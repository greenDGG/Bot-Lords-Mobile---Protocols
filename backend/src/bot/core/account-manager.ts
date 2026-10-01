import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { BotInstance } from './bot-instance';
import { configService } from '../../config/config.service';
import { BotConfig, defaultBotConfig, pickSupply } from '../../models/bot-config';
import { databaseService } from '../../database/database.service';

export interface AccountInfo {
  iggId: number;
  token: string;
  proxy: string;
  config: BotConfig;
}

// Logs persistentes por cuenta: buffer + flush cada 2s para no saturar la SD de la Pi.
class FileLogWriter {
  private buffers = new Map<number, string[]>();
  private timer: NodeJS.Timeout | undefined;

  write(iggId: number, msg: string): void {
    if (!this.buffers.has(iggId)) this.buffers.set(iggId, []);
    this.buffers.get(iggId)!.push(msg);
    this.ensureTimer();
  }

  flush(): void {
    for (const [iggId, lines] of this.buffers) {
      if (lines.length === 0) continue;
      const content = lines.join('\n') + '\n';
      this.buffers.set(iggId, []);
      try {
        fs.mkdirSync(configService.logDir, { recursive: true });
        fs.appendFileSync(configService.getLogPath(iggId), content, 'utf-8');
      } catch {}
    }
  }

  private ensureTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.flush(), 2000);
    this.timer.unref();
  }
}

const fileLogWriter = new FileLogWriter();

/** Flush inmediato de todos los logs pendientes (usar en shutdown). */
export function flushAllLogs(): void {
  fileLogWriter.flush();
}

export class AccountManager extends EventEmitter {
  instances = new Map<number, BotInstance>();

  onLog?: (iggId: number, msg: string) => void;
  onStatusChanged?: (iggId: number) => void;
  onReady?: (iggId: number) => void;

  async loadAccountFromDB(iggId: number): Promise<AccountInfo | null> {
    if (!databaseService.isConnected()) return null;
    try {
      const [tokenDoc, configDoc] = await Promise.all([
        databaseService.TokenModel.findOne({ iggId }).lean(),
        databaseService.ConfigModel.findOne({ iggId }).lean(),
      ]);
      if (!tokenDoc || !tokenDoc.accessToken) return null;

      const config = configDoc ? this.cleanConfig(configDoc) : defaultBotConfig(tokenDoc.proxy || '');
      return { iggId, token: tokenDoc.accessToken, proxy: tokenDoc.proxy || '', config };
    } catch {
      return null;
    }
  }

  private cleanConfig(doc: any): BotConfig {
    return {
      autoStart: doc.autoStart ?? true,
      dailyResetTime: doc.dailyResetTime || '00:00',
      limitTrain: doc.limitTrain ?? 0,
      reconnectTime: doc.reconnectTime ?? 30,
      sendHelp: doc.sendHelp ?? true,
      proxy: doc.proxy || '',
      warMode: doc.warMode ?? false,
      costumeWar: doc.costumeWar ?? 1,
      costumeNormal: doc.costumeNormal ?? 0,
      train: doc.train || { enable: false, type: '', velTrain: 0, subsidiosPorcentaje: 0 },
      shield: doc.shield || { enable: true, type: '1d', redeployTime: '1h' },
      giftDaily: { autoreclaim: true, next: 0, index: 0, ...doc.giftDaily },
      mysteryBox: { enable: true, next: 0, ...doc.mysteryBox },
      ship: { intercambio: true, next: 0, reclaim: true, lastExchangedTs: 0, ...doc.ship },
      forgeGift: { enable: true, next: 0, ...doc.forgeGift },
      chestVip: doc.chestVip || { enable: true },
      artifactFair: doc.artifactFair || { enable: false, reset: 0 },
      refineMana: doc.refineMana || { enable: false },
      openGuildChest: doc.openGuildChest || { enable: false },
      eternalTreasure: doc.eternalTreasure || { enable: true },
      treasureChamber: doc.treasureChamber || { enable: false },
      adminQuest: doc.adminQuest || { enable: true },
      guildQuest: doc.guildQuest || { enable: true },
      resourceLimit: doc.resourceLimit || { wheat: 1_000_000_000, wood: 1_000_000_000, stone: 1_000_000_000, ore: 1_000_000_000, gold: 1_000_000_000 },
      supply: pickSupply(doc.supply),
      events: doc.events || { enable: true },
      coliseum: doc.coliseum || { reclaimGems: false, autoAttack: false, hero0: 1, hero1: 3, hero2: 6, hero3: 5, hero4: 23 },
      sweep: doc.sweep || { enable: false, payload: '0202010001' },
      missions: doc.missions || { autoEliminate: false, wantedMissionIds: [] },
      hunt: { ...defaultBotConfig('').hunt, ...(doc.hunt || {}) },
      luckyCards: { ...defaultBotConfig('').luckyCards, ...(doc.luckyCards || {}) },
    };
  }

  loadAccounts(): AccountInfo[] {
    const accounts: AccountInfo[] = [];
    const dir = configService.accessDir;
    if (!fs.existsSync(dir)) return accounts;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const iggId = parseInt(entry.name, 10);
      if (isNaN(iggId)) continue;

      try {
        const tokenPath = configService.getTokenPath(iggId);
        const configPath = configService.getConfigPath(iggId);
        const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
        const accessToken = tokenData.access_token || tokenData.accessKey || '';
        const proxy = tokenData.proxy || tokenData.proxyAddress || '';

        let config: BotConfig;
        try {
          config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        } catch {
          config = defaultBotConfig(proxy);
        }

        if (accessToken) {
          accounts.push({ iggId, token: accessToken, proxy, config });
        }
      } catch {}
    }

    return accounts;
  }

  startAccount(account: AccountInfo): BotInstance {
    const instance = new BotInstance(account.iggId, account.token, account.proxy, account.config);
    this.instances.set(account.iggId, instance);

    instance.on('log', (msg: string) => {
      this.onLog?.(account.iggId, msg);
      fileLogWriter.write(account.iggId, `[${new Date().toISOString()}] ${msg}`);
    });
    instance.on('statusChanged', () => this.onStatusChanged?.(account.iggId));
    instance.on('ready', () => this.onReady?.(account.iggId));

    instance.connect();
    return instance;
  }

  stopAccount(iggId: number): void {
    const instance = this.instances.get(iggId);
    if (instance) {
      instance.disconnect();
      this.instances.delete(iggId);
      fileLogWriter.flush();
    }
  }

  async startAll(): Promise<void> {
    const accounts = this.loadAccounts();
    for (let i = 0; i < accounts.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 5000));
      this.startAccount(accounts[i]);
    }
  }

  stopAll(): void {
    for (const [iggId] of this.instances) {
      this.stopAccount(iggId);
    }
  }
}
