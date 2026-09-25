import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { BotEngine } from '../engine/bot-engine';
import { configService, normalizeKeys } from '../../config/config.service';
import { BotConfig, defaultBotConfig } from '../../models/bot-config';
import { PlayerInfo, RESISTENCIA_MAX } from '../models/player.types';
import { ResourcesData } from '../models/resources.types';
import { ConstructionData } from '../models/buildings.types';
import { TroopState } from '../../models/troop-state';
import { HospitalState } from '../models/hospital.types';
import { ParsedMapTile } from '../models/map.types';
import { MapMarch } from '../models/map-march.types';
import { ResearchData } from '../models/research.types';
import { TroopTraining } from '../models/troops.types';
import { GuildInfo } from '../models/guild.types';
import { BuffManager } from '../features/buff-manager';
import { ResourceTracker } from '../features/resource-tracker';
import { startEventRewardScheduler } from '../features/event-rewards.scheduler';
import { WarDetector } from '../war/war-detector';
import { ActionRunner } from '../actions/action-runner';
import { buyShield24h, activateShield } from '../features/shield';
import { activateFury, isFuryBlockingShield, hasFury, getFuryRemaining } from '../features/fury';
import { claimEvent } from '../commands/event.commands';
import { BuffCategory, BuffInstance } from '../models/player.types';
import { MessagePacket } from '../network/message-packet';
import { TreasureChamberData } from '../models/treasure.types';
import { EssenceTransmutationState } from '../models/essence.types';
import { QuestMemory } from '../models/quest.types';
import { MissionData } from '../models/missions.types';
import { MissionRecordData } from '../models/missions.types';
import { FdgMissionExtensionData } from '../models/missions.types';
import { VipChestMemory } from '../models/vip-chest.types';
import { ColiseumState } from '../models/coliseum.types';
import { HeroEntry } from '../models/heroes.types';
import { BuildingState } from '../models/buildings.types';
import { MarchInfo } from '../models/march.types';
import { CostumeItem } from '../parsers/costume.parser';
import { LordCaptivePacket } from '../models/leader.types';
import { ChatMessage } from '../models/chat.types';
import { GuildApplicationsData } from '../models/guild-applications.types';
import { EventRewardData } from '../models/event-rewards.types';
import { MarchQueue } from '../features/march-queue';
import { MarchType } from '../models/march-queue.types';
import { databaseService } from '../../database/database.service';
import { EVENT_ACTIONS } from '../features/event-registry';
import { findActionByName } from '../actions/bot-action';
import { dispatchPacket } from '../handlers/index';
import { WarParticipant, parse2483 as parse2483Participants, loadMarchHistory as loadMarchHistoryDb, checkExpiredMarches as checkExpiredMarchesImpl, serializableMarches as serializableMarchesImpl } from '../war/march-manager';
import { armCounter, armCounterTimer, fireCounterNow, revertCounter } from '../war/counter-logic';
import { requestMapData as sendMapData, refreshMapCoord } from '../commands/map.commands';
import { decodeCoordBytes } from '../../models/map-coords';
import { getPlayerLocation as getPlayerLocationCmd } from '../commands/player.commands';
import { selectAction11, selectWarIndex, sendTroops, send2476 } from '../commands/war.commands';
import { requestRivals, attackRival, claimColiseumGems } from '../commands/coliseum.commands';

export type { WarParticipant };

const ITEMS_DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'items.json'), 'utf-8'));

/** 2453 sin datos seguidos antes de abortar el lote de supply */
const MAX_CONSECUTIVE_SEND_FAILS = 3;

export class BotInstance extends EventEmitter {
  readonly iggId: number;
  readonly bot: BotEngine;
  readonly buffs = new BuffManager();
  readonly war: WarDetector;
  readonly actions: ActionRunner;
  readonly resTracker = new ResourceTracker();

  config: BotConfig;
  playerInfo?: PlayerInfo;
  lastRes: number = 0;
  resTimer?: ReturnType<typeof setInterval>;
  resources?: ResourcesData;
  guildInfo?: GuildInfo;
  constructions?: ConstructionData;
  research?: ResearchData;
  troopTraining?: TroopTraining;
  troopState = new TroopState();
  hospitalState?: HospitalState;
  inventory = new Map<number, number>();
  guildName = '';
  guildId = 0;
  guildTag = '';
  treasureChamber?: TreasureChamberData;
  essenceState?: EssenceTransmutationState;
  adminQuestMem?: QuestMemory;
  guildQuestMem?: QuestMemory;
  eventRewards?: EventRewardData;
  lastAdminQuestEndTs: number = 0;
  lastGuildQuestEndTs: number = 0;
  vipChestMem?: VipChestMemory;
  refineManaCount = 0;
  coliseumState?: ColiseumState;
  missions?: MissionData;
  missionRecords?: MissionRecordData;
  fdgExtension?: FdgMissionExtensionData;
  eternalTreasureAvailable = false;
  eternalTreasureClaimed = false;
  eternalTreasureItems: { id: number; amount: number }[] = [];
  buildingState = new BuildingState();
  incomingMarches: MarchInfo[] = [];
  marchHistory: any[] = [];
  isLeaderCaptured = false;
  isLeaderExecuted = false;
  leaderFreeRevivalAt = 0;
  captiveData?: LordCaptivePacket;
  mapTiles = new Map<number, ParsedMapTile>();
  mapMarches = new Map<string, MapMarch>();
  chatMessages: ChatMessage[] = [];
  guildApplications?: GuildApplicationsData;
  warParticipants: WarParticipant[] = [];
  costumes: CostumeItem[] = [];
  equippedCostumes: CostumeItem[] = [];
  activeCaravans = 0;
  supplyPending: { name: string; amount: number }[] = [];
  supplyBatchSent = false;
  supplyTargetCoord: Buffer | null = null;
  supplyBusy = false;
  supplyManualActive = false;
  supplyCaravanAckResolve: (() => void) | null = null;
  supplyCurrentTarget: string | null = null;
  /** caravanas enviadas en el lote actual; freeAt se completa con el 2453 (startTime + 2×duración) */
  supplyInFlight: { sentAt: number; freeAt: number | null }[] = [];
  /** último 2452 enviado; se revierte si el 2453 vuelve sin datos (nada salió) */
  supplyLastSend: {
    entry: { name: string; amount: number };
    amount: number;
    wheat: number;
    wood: number;
    stone: number;
    ore: number;
    gold: number;
  } | null = null;
  /** 2453 sin datos seguidos; al llegar a 3 se aborta el lote */
  supplyConsecutiveFails = 0;
  supplyManualFailed = false;
  marchQueue: MarchQueue;
  resourcesUpdatePending = false;
  lastRequestedMarchId = 0;
  pendingMarchData: { marchId: number; timestamp: number }[] = [];
  lastSentFormation: number | null = null;
  lastSentCostume: number | null = null;
  uiSection: number = 0x02;

  eventDefs: any[] = [];
  eventClaims: Map<string, any> = new Map();
  private eventsLoadedAt = 0;

  launched = false;
  connecting = false;
  connected = false;
  intentionalDisconnect = false;
  reconnectTimer?: NodeJS.Timeout;
  autoShieldDone = false;
  lastShieldRenew = 0;
  furyBattle = 0;

  recentLogs: string[] = [];
  private logFile: string = '';
  private logDir: string = '';
  private midnightTimer?: NodeJS.Timeout;

  constructor(iggId: number, private token: string, private proxy: string, config?: BotConfig) {
    super();
    this.iggId = iggId;
    const defaults = defaultBotConfig(proxy);
    this.config = config ? mergeConfig(config, defaults) : defaults;
    this.config.proxy = proxy;
    this.bot = new BotEngine();
    this.war = new WarDetector(this.bot, iggId);
    this.actions = new ActionRunner(this);
    this.marchQueue = new MarchQueue(this);

    const logsBase = require('path').join(require('path').dirname(require('fs').realpathSync('.')), 'logs');
    this.logDir = require('path').join(logsBase, String(iggId));
    try { require('fs').mkdirSync(this.logDir, { recursive: true }); } catch {}
    this.logFile = this.getLogPathForDate(new Date());
    this.scheduleMidnightRotation();

    this.bot.on('log', (msg: string) => {
      const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
      this.recentLogs.push(line);
      if (this.recentLogs.length > 200) this.recentLogs.shift();
      try { require('fs').appendFileSync(this.logFile, line + '\n'); } catch {}
      this.emit('log', msg);
    });

    this.bot.on('status', (online: boolean) => {
      if (!online) {
        this.connected = false;
        this.connecting = false;
        this.resTracker.stop();
        if (this.intentionalDisconnect) return;
        this.resetTransientState();
        const delay = Math.max(this.config.reconnectTime, 5) * 1000;
        this.bot.log(`[*] Auto-reconexión en ${delay / 1000}s...`);
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
          this.bot.log('[RECONNECT] Intentando reconexión...');
          this.connect();
        }, delay);
      }
      this.emit('statusChanged');
    });

    this.bot.on('packet', (mp: MessagePacket, seq: number) => dispatchPacket(this, mp));
    this.bot.on('sentPacket', ({ proto, payload }: { proto: number; payload: Buffer }) => {
      if (proto === 2445 && payload.length >= 4) {
        const marchId = payload.readUInt32LE(0);
        this.bot.log(`[ATALAYA] 2445 OUT marchId=${marchId}`);
        const idx = this.incomingMarches.findIndex(m => m.marchId === marchId);
        if (idx >= 0) {
          this.bot.log(`[ATALAYA] Marcha ${marchId} vinculada con datos solicitados`);
        }
      }
    });
    this.bot.on('ready', () => this.emit('ready'));
    this.bot.on('cargoShipUpdated', () => this.onShipUpdated());

    this.buffs.onBuffChanged = () => this.emit('buffsUpdated');
    this.war.onWarsUpdated = (wars) => this.emit('warsUpdated', wars);
    this.war.onNotification = (count) => this.emit('warNotification', count);

    this.loadGuildApplications();
  }

  resetTransientState(): void {
    for (const march of this.incomingMarches) {
      if (march.timer) { clearTimeout(march.timer); march.timer = undefined; }
    }
    this.incomingMarches = [];
    this.pendingMarchData = [];
    this.marchQueue.reset();
    this.lastRequestedMarchId = 0;
    this.supplyPending = [];
    this.supplyBatchSent = false;
    this.supplyBusy = false;
    this.supplyTargetCoord = null;
    this.activeCaravans = 0;
    this.supplyInFlight = [];
    this.eternalTreasureAvailable = false;
    this.eternalTreasureItems = [];
  }

  async connect(): Promise<boolean> {
    this.intentionalDisconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.resetTransientState();
    if (this.connecting) { this.bot.log('[-] Ya conectando...'); return false; }
    if (this.connected) { this.bot.log('[-] Ya conectado'); return true; }
    this.connecting = true;

    this.bot.setToken(this.token, this.iggId);

    if (!this.proxy) {
      this.connecting = false;
      this.launched = true;
      this.bot.log('[-] No hay proxy configurado para esta cuenta');
      this.emit('connectionFailed', 'No hay proxy configurado para esta cuenta');
      return false;
    }

    const proxy = this.proxy;
    if (this.bot.account) this.bot.account.proxyAddress = proxy;
    this.bot.log(`[*] Conectando via proxy ${proxy}...`);

    let result = await this.bot.proxyAuth();
    if (!result.success) {
      this.bot.log('[*] Auth falló, reintentando con versión actualizada...');
      try {
        const { resolveVersion } = await import('../features/version-resolver');
        await resolveVersion();
        result = await this.bot.proxyAuth();
      } catch {}
    }

    if (!result.success) {
      this.connecting = false;
      this.launched = true;
      const reason = 'Proxy auth falló — versión inválida o JWT rechazado';
      this.bot.log(`[-] ${reason}`);
      this.emit('connectionFailed', reason);
      return false;
    }

    const ok = await this.bot.connectToGameServer(result.gameIp || '34.168.134.194', result.gamePort || 10714);
    if (!ok) {
      this.connecting = false;
      this.launched = true;
      this.bot.log(`[-] Conexión a game server falló`);
      this.bot.disconnect();
      this.emit('connectionFailed', 'Conexión a game server falló');
      return false;
    }

    this.bot.log(`[+] Conectado via proxy ${proxy}`);

    this.bot.goOnline();
    this.connected = true;
    this.connecting = false;
    this.launched = true;
    this.coliseumState = undefined;
    this.resTracker.start();
    this.resTracker.onUpdate = () => {
      if (!this.resourcesUpdatePending) {
        this.resourcesUpdatePending = true;
        setTimeout(() => {
          this.resourcesUpdatePending = false;
          this.emit('resourcesUpdated');
        }, 3000);
      }
    };

    setInterval(() => {
      try {
        checkExpiredMarchesImpl(this).catch((e: any) => this.bot.log(`[ATALAYA] error checkExpiredMarches: ${e?.message || e}`));
      } catch (e: any) { this.bot.log(`[ATALAYA] error checkExpiredMarches: ${e?.message || e}`); }
    }, 1000);

    loadMarchHistoryDb(this).catch(() => {});
    this.loadEvents(true).catch(() => {});
    setInterval(() => this.loadEvents().catch(() => {}), 60000);
    startEventRewardScheduler(this).catch(e => this.bot.log(`[EVENT-REWARDS] Error scheduler: ${e?.message || e}`));

    this.bot.log('[+] Conectado y en línea');
    return true;
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.midnightTimer) clearTimeout(this.midnightTimer);
    this.bot.disconnect();
  }

  private getLogPathForDate(date: Date): string {
    const d = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return require('path').join(this.logDir, `${d}.log`);
  }

  private scheduleMidnightRotation(): void {
    const now = new Date();
    const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
    this.midnightTimer = setTimeout(() => {
      this.logFile = this.getLogPathForDate(new Date());
      this.bot.log(`[LOG] Rotado a archivo diario: ${require('path').basename(this.logFile)}`);
      this.scheduleMidnightRotation();
    }, msUntilMidnight);
    this.midnightTimer.unref();
  }

  runAutoShield(): void {
    if (this.autoShieldDone) return;
    this.autoShieldDone = true;
    this.doShieldSequence();
  }

  retryShield(): void {
    this.autoShieldDone = false;
    this.doShieldSequence();
  }

  onConfigChanged(): void {}

  private doShieldSequence(): void {
    if (!this.config.shield.enable || this.config.warMode) {
      this.bot.log(`[AUTO] Escudo ${this.config.warMode ? 'desactivado por warMode' : 'desactivado en config'}`);
      this.bot.enqueueCommand(async () => { this.actions.start(); });
      return;
    }

    this.bot.enqueueDelay(18000);
    this.bot.enqueueCommand(async () => { this.tryRenewShield(); });
    if (this.config.sendHelp) {
      this.bot.enqueueCommand(async () => { this.bot.log('[AUTO] Enviando ayuda inicial...'); this.bot.sendHelp(); });
    }
    this.bot.enqueueCommand(async () => { this.actions.start(); });
  }

  tryRenewShield(): boolean {
    if ((Date.now() - this.lastShieldRenew) < 60000) return false;

    if (isFuryBlockingShield(this)) {
      const furyRem = getFuryRemaining(this);
      const min = Math.floor(furyRem / 60000);
      const sec = Math.floor((furyRem % 60000) / 1000);
      this.bot.log(`[ESCUDO] Bloqueado por furia activa (${min}m ${sec}s restantes)`);
      return false;
    }

    const shield = this.buffs.shield;
    const redeploy = this.parseRedeployTime(this.config.shield.redeployTime);

    if (shield) {
      const rem = shield.remaining;
      if (rem >= redeploy) {
        this.bot.log(`[ESCUDO] Activo (${(rem / 3600000).toFixed(1)}h), faltan ${new Date(rem - redeploy).toISOString().substr(11, 5)} para renovar`);
        return false;
      }
      this.bot.log(`[ESCUDO] Renovando (${(rem / 3600000).toFixed(1)}h < redeployTime)...`);
    } else {
      this.bot.log('[ESCUDO] Sin escudo, comprando...');
    }

    this.lastShieldRenew = Date.now();
    this.bot.enqueueCommand(async () => {
      this.bot.log(`[ESCUDO] Comprando escudo 24h (1000 gemas, restantes: ${(this.playerInfo?.gems || 0) - 1000})...`);
      buyShield24h(this.bot);
    });
    this.bot.enqueueDelay(2000);
    this.bot.enqueueCommand(async () => {
      this.bot.log('[ESCUDO] Activando escudo...');
      activateShield(this.bot);
      const def = { id: 0x041C, name: 'Escudo 1d', category: BuffCategory.Shield, durationMs: 24 * 3600 * 1000 };
      this.buffs.setShield(new BuffInstance(def, new Date(), 24 * 3600 * 1000));
    });
    return true;
  }

  private parseRedeployTime(input: string): number {
    if (!input) return 3600000;
    let total = 0;
    let num = 0;
    for (const c of input) {
      if (c >= '0' && c <= '9') { num = num * 10 + (c.charCodeAt(0) - 48); }
      else {
        switch (c) {
          case 'h': total += num * 3600000; break;
          case 'm': total += num * 60000; break;
          case 's': total += num * 1000; break;
        }
        num = 0;
      }
    }
    return total > 0 ? total : 3600000;
  }

  private autoHelpRegistered = false;

  runAutoHelp(): void {
    if (!this.config.sendHelp) {
      this.bot.log('[AUTO] Ayuda automática desactivada en config');
      return;
    }
    if (this.autoHelpRegistered) return;
    this.autoHelpRegistered = true;
    this.bot.on('newHelp', () => {
      setTimeout(() => {
        if (!this.bot.isOnline) return;
        this.bot.enqueueCommand(async () => { this.bot.sendHelp(); });
      }, 4000);
    });
  }

  getCurrentResistencia(): number {
    return this.lastRes;
  }

  consumeResistencia(amount: number): void {
    this.lastRes = Math.max(0, this.lastRes - amount);
    this.bot.log(`[RES] -${amount} resistencia → ${this.lastRes}/${RESISTENCIA_MAX}`);
    this.emit('playerInfoUpdated');
    this.startResistenciaRegen();
  }

  private startResistenciaRegen(): void {
    if (this.resTimer) return;
    if (this.lastRes >= RESISTENCIA_MAX) return;
    this.resTimer = setInterval(() => {
      if (this.lastRes >= RESISTENCIA_MAX) {
        clearInterval(this.resTimer);
        this.resTimer = undefined;
        this.bot.log(`[RES] resistencia llena → ${RESISTENCIA_MAX}/${RESISTENCIA_MAX}`);
        return;
      }
      this.lastRes++;
      this.bot.log(`[RES] +1 resistencia → ${this.lastRes}/${RESISTENCIA_MAX}`);
      this.emit('playerInfoUpdated');
    }, 6 * 60 * 1000);
  }

  requestColiseumRivals(): void {
    requestRivals(this.bot);
    this.bot.log('[COLISEO] 5204 enviado — solicitando rivales');
  }

  waitForColiseumUpdate(prevFights: number, timeoutMs = 6000): Promise<void> {
    return new Promise(resolve => {
      const check = () => {
        const s = this.coliseumState;
        if (!s || s.fightsDone !== prevFights) {
          clearTimeout(timeout);
          this.removeListener('coliseumUpdated', check);
          resolve();
          return;
        }
      };
      const timeout = setTimeout(() => {
        this.removeListener('coliseumUpdated', check);
        resolve();
      }, timeoutMs);
      this.on('coliseumUpdated', check);
      check();
    });
  }

  attackColiseumRival(rivalIndex: number, rivalId: number, rivalName: string, heroIds: number[]): void {
    if (heroIds.length !== 5) {
      this.bot.log(`[COLISEO] Error: se necesitan 5 héroes, se recibieron ${heroIds.length}`);
      return;
    }
    attackRival(this.bot, rivalIndex, rivalId, rivalName, heroIds);
    this.bot.log(`[COLISEO] 5208: atacando rival index=${rivalIndex} id=${rivalId} héroes=[${heroIds.join(',')}]`);
  }

  requestMapData(x?: number, y?: number): void {
    const cx = x ?? this.playerInfo?.castleX ?? 0;
    const cy = y ?? this.playerInfo?.castleY ?? 0;
    sendMapData(this.bot, cx, cy);
    this.bot.log(`[MAPA] Solicitando tiles alrededor de (${cx}, ${cy})...`);
  }

  async getPlayerLocation(name: string): Promise<import('../models/player.types').PlayerLocationResult | null> {
    this.bot.log(`[SUPPLY] Buscando ubicación de "${name}" (2204)...`);
    const result = await getPlayerLocationCmd(this.bot, name);
    if (!result) {
      this.bot.log(`[SUPPLY] Sin respuesta 2205 para "${name}"`);
      return null;
    }
    if (!result.sameRealm) {
      this.bot.log(`[SUPPLY] 2205: "${name}" no está en el mismo reino/gremio`);
      return null;
    }
    this.bot.log(`[SUPPLY] 2205: "${name}" en (${result.x}, ${result.y})`);
    return result;
  }

  calculateDistance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
  }

  /**
   * Supply manual: busca el jugador, obtiene ubicación, llena supplyPending
   * y ejecuta sendCaravanBatch() con skipEnableCheck para ignorar el toggle
   * de supply.enable (que es solo para el automático).
   * Pausa el ActionRunner para que no ejecute otras acciones mientras envía.
   */
  async manualSupply(targetPlayer: string, specificResources?: string[]): Promise<{ ok: boolean; message: string }> {
    if (!this.bot.isOnline) return { ok: false, message: 'Bot no conectado' };
    if (this.supplyBusy) return { ok: false, message: 'Supply ya en progreso' };
    if (!targetPlayer) return { ok: false, message: 'Sin jugador objetivo' };

    const resolveErr = await this.resolveTargetLocation(targetPlayer);
    if (resolveErr) return { ok: false, message: resolveErr };

    const res = this.resources;
    if (!res) return { ok: false, message: 'Sin recursos disponibles' };

    const allEntries: { name: string; amount: number }[] = [
      { name: 'trigo', amount: res.wheat },
      { name: 'piedra', amount: res.stone },
      { name: 'madera', amount: res.wood },
      { name: 'mineral', amount: res.mineral },
      { name: 'oro', amount: res.gold },
    ];

    const cfg = this.config.supply;
    const entries: { name: string; amount: number }[] = [];

    for (const r of allEntries) {
      if (specificResources && specificResources.length > 0 && !specificResources.includes(r.name)) continue;
      if (r.amount <= 0) continue;
      const totalCaravans = Math.ceil(r.amount / cfg.maxAmount);
      entries.push({ name: r.name, amount: totalCaravans * cfg.maxAmount });
    }

    if (entries.length === 0) return { ok: false, message: 'Sin recursos para enviar' };

    this.actions.pause();
    this.supplyPending = entries;
    this.supplyBusy = false;
    this.supplyCurrentTarget = targetPlayer;
    this.supplyManualActive = true;
    const summary = entries.map(e => `${e.name} ${(e.amount / 1e6).toFixed(1)}M`).join(', ');
    this.bot.log(`[SUPPLY-MANUAL] Pausando acciones, enviando a "${targetPlayer}": ${summary}`);

    await this.sendCaravanBatch(true);
    if (this.supplyManualFailed) {
      this.supplyManualFailed = false;
      return { ok: false, message: `Supply abortado para "${targetPlayer}" (ver log: gremio/ubicación/mapa)` };
    }
    return { ok: true, message: `Supply enviado a "${targetPlayer}": ${summary}` };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private nowSec(): number {
    return Math.floor(Date.now() / 1000);
  }

  /**
   * El 2453 con datos confirma que la caravana salió:
   * slot ocupado hasta startTime + 2×duración.
   */
  onCaravanDeparted(freeAt: number): void {
    const pending = this.supplyInFlight.find(c => c.freeAt === null);
    if (pending) pending.freeAt = freeAt;
    this.supplyConsecutiveFails = 0;
    this.supplyLastSend = null;
  }

  /**
   * El 2453 llegó SIN datos (body < 17B): el servidor rechazó el 2452 y no salió
   * ninguna caravana. Se libera el slot al instante (para no quedar 10 min
   * bloqueando), se revierte el descuento local de la cola/recursos y, tras
   * `MAX_CONSECUTIVE_SEND_FAILS` fallos seguidos, se aborta el lote.
   */
  onCaravanSendFailed(code: number): void {
    const idx = this.supplyInFlight.findIndex(c => c.freeAt === null);
    if (idx >= 0) this.supplyInFlight.splice(idx, 1);
    this.activeCaravans = Math.max(0, this.activeCaravans - 1);

    const last = this.supplyLastSend;
    if (last) {
      this.supplyLastSend = null;
      if (this.supplyPending.indexOf(last.entry) === -1) this.supplyPending.unshift(last.entry);
      last.entry.amount += last.amount;
      this.resTracker.wheat += last.wheat;
      this.resTracker.wood += last.wood;
      this.resTracker.stone += last.stone;
      this.resTracker.ore += last.ore;
      this.resTracker.gold += last.gold;
      if (this.resources) {
        this.resources.wheat += last.wheat;
        this.resources.wood += last.wood;
        this.resources.stone += last.stone;
        this.resources.mineral += last.ore;
        this.resources.gold += last.gold;
      }
      this.bot.log(
        `[SUPPLY] 2453 sin datos (code=0x${(code & 0xff).toString(16).padStart(2, '0')}): no salió nada, ` +
        `${last.entry.name} +${last.amount} devuelta a la cola`,
      );
    } else {
      this.bot.log(`[SUPPLY] 2453 sin datos (code=0x${(code & 0xff).toString(16).padStart(2, '0')})`);
    }

    this.supplyConsecutiveFails++;
    if (this.supplyConsecutiveFails >= MAX_CONSECUTIVE_SEND_FAILS) {
      this.bot.log(
        `[SUPPLY] ${this.supplyConsecutiveFails} 2453 sin datos seguidos: ` +
        `abortando lote (el 2452 se está rechazando)`,
      );
      this.supplyPending = [];
      if (this.supplyManualActive) this.supplyManualFailed = true;
    }
  }

  /** Slots ocupados = caravanas enviadas cuyo freeAt (vuelta) aún no venció. */
  private countSupplySlots(): number {
    const now = this.nowSec();
    let n = 0;
    for (const c of this.supplyInFlight) {
      if (c.freeAt === null) {
        // Sin 2453 con datos en 10 min: libera el slot para no atascar el lote
        if (now - c.sentAt > 600) continue;
        n++;
      } else if (c.freeAt > now) {
        n++;
      }
    }
    return n;
  }

  /** Abre el mapa (2201) alrededor de (x,y) y espera el tile castillo del target. */
  private openMapAndFindTarget(targetPlayer: string, x: number, y: number, timeoutMs = 15000): Promise<ParsedMapTile | null> {
    const find = () => this.findTargetCastleTile(targetPlayer, x, y);
    return new Promise(resolve => {
      let done = false;
      const finish = (tile: ParsedMapTile | null) => {
        if (done) return;
        done = true;
        this.removeListener('mapDataUpdated', onUpdate);
        clearTimeout(timer);
        resolve(tile);
      };
      const onUpdate = () => {
        const t = find();
        if (t) finish(t);
      };
      const timer = setTimeout(() => finish(find()), timeoutMs);
      this.on('mapDataUpdated', onUpdate);
      sendMapData(this.bot, x, y);
      this.bot.log(`[SUPPLY] 2201: abriendo mapa en (${x}, ${y}) para "${targetPlayer}"`);
      const t = find();
      if (t) finish(t);
    });
  }

  private findTargetCastleTile(name: string, x: number, y: number): ParsedMapTile | null {
    let byName: ParsedMapTile | null = null;
    let byPos: ParsedMapTile | null = null;
    for (const t of this.mapTiles.values()) {
      if (t.type !== 8 || t.empty) continue;
      if (t.name && t.name === name) {
        byName = t;
        break;
      }
      if (!byPos && Math.abs(t.x - x) <= 3 && Math.abs(t.y - y) <= 3) byPos = t;
    }
    return byName || byPos;
  }

  private async waitForSupplySlot(): Promise<boolean> {
    const limit = Math.max(1, this.config.supply.caravanLimit);
    const maxWaitMs = 15 * 60 * 1000;
    const deadline = Date.now() + maxWaitMs;
    while (this.bot.isOnline && this.supplyPending.length > 0) {
      const active = this.countSupplySlots();
      if (active < limit) return true;
      if (Date.now() > deadline) {
        this.bot.log(`[SUPPLY] Timeout esperando slot libre (${active}/${limit})`);
        return false;
      }
      const now = this.nowSec();
      let minFree = Infinity;
      for (const c of this.supplyInFlight) {
        if (c.freeAt !== null && c.freeAt > now && c.freeAt < minFree) minFree = c.freeAt;
      }
      const waitSec = minFree === Infinity ? 5 : Math.min(Math.max(minFree - now + 1, 1), 30);
      this.bot.log(`[SUPPLY] Slots ${active}/${limit} ocupados, esperando ${waitSec}s`);
      await this.sleep(waitSec * 1000);
    }
    return false;
  }

  /**
   * Encola una marcha genérica. El caller provee:
   *  - type: kind of march
   *  - sendFn: async function that actually sends the packet, returns true if OK
   *  - ackProtos: proto(s) to wait for as server confirmation
   *  - meta: optional metadata attached to the entry
   * Returns the queue entry ID.
   */
  enqueueMarch(type: MarchType, sendFn: (entry: import('../models/march-queue.types').MarchQueueEntry) => Promise<boolean> | boolean, ackProtos: number | number[], meta?: Record<string, any>): number {
    return this.marchQueue.enqueue(type, sendFn, ackProtos, meta);
  }

  saveConfig(fullConfig?: BotConfig): void {
    const configPath = configService.getConfigPath(this.iggId);
    if (!fs.existsSync(configPath)) return;
    try {
      if (fullConfig) {
        fs.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2), 'utf-8');
      } else {
        const original = normalizeKeys(JSON.parse(fs.readFileSync(configPath, 'utf-8')));
        const updated = {
          ...original,
          giftDaily: { ...original.giftDaily, next: this.config.giftDaily.next, index: this.config.giftDaily.index },
          chestVip: { ...original.chestVip },
          artifactFair: { ...original.artifactFair, reset: this.config.artifactFair.reset },
          refineMana: { ...original.refineMana },
          mysteryBox: { ...original.mysteryBox, next: this.config.mysteryBox.next },
          ship: { ...original.ship, next: this.config.ship.next, reclaim: this.config.ship.reclaim, lastExchangedTs: this.config.ship.lastExchangedTs },
          forgeGift: { ...original.forgeGift, next: this.config.forgeGift.next },
        };
        fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf-8');
      }
    } catch {}
  }

  saveGuildApplications(): void {
    try {
      const dataDir = path.join(configService.accessDir, String(this.iggId));
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      const filePath = path.join(dataDir, 'guild-applications.json');
      fs.writeFileSync(filePath, JSON.stringify(this.guildApplications, null, 2), 'utf-8');
    } catch {}
  }

  loadGuildApplications(): void {
    try {
      const filePath = path.join(configService.accessDir, String(this.iggId), 'guild-applications.json');
      if (fs.existsSync(filePath)) {
        this.guildApplications = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
    } catch {}
  }

  warSelectAction11(): void {
    selectAction11(this.bot);
    this.bot.log('[GUERRA] 1144 acción 11 enviado');
  }

  warSelectIndex(index: number): void {
    selectWarIndex(this.bot, index);
    this.bot.log(`[GUERRA] 2480 index ${index} (${index * 256}) enviado`);
  }

  requestWarData(): void {
    if (this.uiSection === 0x05) return;
    this.uiSection = 0x05;
    this.bot.log('[AGRU] UI → sección guerras (0x05)');
    this.war.requestData();
  }

  parse2483(body: Buffer): WarParticipant[] {
    const participants = parse2483Participants(body);
    this.warParticipants = participants;
    this.bot.log(`[GUERRA] 2483 parseado: ${participants.length} participantes`);
    for (const p of participants) {
      const troopStr = p.troops.map(t => `${t.type}T${t.tier}=${t.count}`).join(', ');
      this.bot.log(`  [${p.index}] ${p.name}: mask=0x${p.mask.toString(16)} [${troopStr}]`);
    }
    this.emit('warParticipantsUpdated', participants);
    return participants;
  }

  requestWarParticipants(warIndex: number): void {
    this.bot.enqueueCommand(async () => { this.warSelectAction11(); });
    this.bot.enqueueDelay(500);
    this.bot.enqueueCommand(async () => { this.warSelectIndex(warIndex); });
    this.bot.enqueueCommand(async () => {
      const body = await this.bot.waitForReply<Buffer>(2483, 5000);
      if (body) this.parse2483(body);
      else this.bot.log('[GUERRA] 2483 timeout');
    });
  }

  warSendTroops(rallyLeader: string, mask: number, quantities: number[]): void {
    sendTroops(this.bot, rallyLeader, mask, quantities);
    this.bot.log(`[GUERRA] 2472 tropas enviadas: mask=${mask}`);
  }

  enqueueWarSend(warIndex: number, rallyLeader: string, mask: number, quantities: number[], onStatus?: (s: string) => void): void {
    onStatus?.('Encolando...');
    this.bot.enqueueCommand(async () => {
      onStatus?.('Enviando 2476...');
      if (this.war.canSend2476()) send2476(this.bot);
    });
    this.bot.enqueueCommand(async () => {
      onStatus?.('Esperando datos de guerra...');
      await this.bot.waitForAnyReply([2478, 6611, 7315]);
    });
    this.bot.enqueueCommand(async () => {
      onStatus?.('Acción 11...');
      this.warSelectAction11();
    });
    this.bot.enqueueDelay(500);
    this.bot.enqueueCommand(async () => {
      onStatus?.('Seleccionando guerra...');
      this.warSelectIndex(warIndex);
    });
    this.bot.enqueueCommand(async () => {
      onStatus?.('Esperando datos de rally...');
      const body = await this.bot.waitForReply<Buffer>(2483, 5000);
      if (body) {
        this.parse2483(body);
        onStatus?.(`Rally: ${this.warParticipants.length} participante(s)`);
      }
    });
    this.bot.enqueueDelay(5000);
    this.bot.enqueueCommand(async () => {
      onStatus?.('Enviando tropas...');
      this.warSendTroops(rallyLeader, mask, quantities);
    });
    this.bot.enqueueDelay(500);
    this.bot.enqueueCommand(async () => {
      onStatus?.('✔ Enviado');
    });
  }

  openChest(itemId: number, quantity: number, onProgress?: (opened: number, total: number) => void): void {
    const BATCH_MAX = 100;
    const batchSizes: number[] = [];
    let remaining = quantity;
    while (remaining > 0) {
      const take = Math.min(BATCH_MAX, remaining);
      batchSizes.push(take);
      remaining -= take;
    }

    const chestEntry: any = (ITEMS_DATA as any).ITEMS_DB?.[String(itemId)];
    const drops: number[] = chestEntry?.drops || [];
    let opened = 0;

    for (const batchQty of batchSizes) {
      const logQty = batchQty;
      this.bot.enqueueCommand(async () => {
        const { openChestBatch } = require('../commands/chest.commands');
        openChestBatch(this.bot, itemId, logQty);
        opened += logQty;
        this.bot.log(`[COFRE] Abriendo ${logQty}x item ${itemId} (${opened}/${quantity})`);
        onProgress?.(opened, quantity);
      });
      this.bot.enqueueDelay(800);
    }

    this.bot.enqueueCommand(async () => {
      const current = this.inventory.get(itemId) || 0;
      const rem = current - quantity;
      if (rem <= 0) this.inventory.delete(itemId);
      else this.inventory.set(itemId, rem);

      for (const dropId of drops) {
        this.inventory.set(dropId, (this.inventory.get(dropId) || 0) + quantity);
      }
      this.emit('inventoryUpdated');
      this.bot.log(`[COFRE] Simulado: -${quantity}x item ${itemId}, +${quantity}x cada drop [${drops.join(',')}]`);
    });
  }

  /**
   * Resuelve la ubicación (2204) del target y setea supplyTargetCoord.
   * Usado por manualSupply y SupplyAction ANTES de sendCaravanBatch.
   * No se usa 1109: el 2205 ya trae la ubicación y el check de mismo reino.
   * Devuelve null si todo OK, o el motivo de fallo.
   */
  async resolveTargetLocation(targetPlayer: string): Promise<string | null> {
    const location = await this.getPlayerLocation(targetPlayer);
    if (!location) return `Sin ubicación de "${targetPlayer}"`;

    const myX = this.playerInfo?.castleX ?? 0;
    const myY = this.playerInfo?.castleY ?? 0;
    const dist = this.calculateDistance(myX, myY, location.x, location.y);
    if (dist > 40) return `"${targetPlayer}" a ${dist.toFixed(1)} tiles, fuera de rango (máx 40)`;

    this.supplyTargetCoord = Buffer.from(location.coordBytes);
    return null;
  }

  /**
   * Envía un lote de caravanas. Flujo:
   *   1. 2201 abrir mapa una vez alrededor del target (supplyTargetCoord ya resuelta antes)
   *   2. Bucle: esperar slot libre → 2202 + 2452 → ack 2453
   *
   * El 2453 con datos trae startTime + duración de ida: el slot se libera en
   * freeAt = startTime + 2×duración (ida+vuelta). Si no llega en 10 min, libera igual.
   * 2202 "selecciona" el castillo antes de cada 2452 (con el mapa ya abierto
   * vía 2201 no causa desconexión).
   */
  async sendCaravanBatch(skipEnableCheck = false): Promise<void> {
    if (this.supplyBusy) {
      this.bot.log(`[SUPPLY] sendCaravanBatch abortado: supplyBusy=true`);
      return;
    }
    this.supplyBusy = true;
    this.supplyConsecutiveFails = 0;
    this.supplyLastSend = null;
    this.bot.log(`[SUPPLY] sendCaravanBatch iniciado, pendientes: ${this.supplyPending.length}`);

    try {
      const targetPlayer = this.supplyCurrentTarget;
      const fail = () => {
        this.supplyPending = [];
        if (this.supplyManualActive) this.supplyManualFailed = true;
      };
      if (!targetPlayer) {
        this.bot.log(`[SUPPLY] Sin targetPlayer, abortando`);
        fail();
        return;
      }

      if (!this.supplyTargetCoord || this.supplyTargetCoord.length !== 3) {
        this.bot.log(`[SUPPLY] Sin supplyTargetCoord, abortando (¿resolveTargetLocation no se llamó?)`);
        fail();
        return;
      }

      const dec = decodeCoordBytes([
        this.supplyTargetCoord[0],
        this.supplyTargetCoord[1],
        this.supplyTargetCoord[2],
      ]);
      const tx = dec.x;
      const ty = dec.y;

      // 2201: abrir mapa una vez + esperar tile del target
      const tile = await this.openMapAndFindTarget(targetPlayer, tx, ty);
      if (!tile) {
        this.bot.log(`[SUPPLY] No se encontró tile de "${targetPlayer}" tras 2201, abortando`);
        fail();
        return;
      }

      while (this.supplyPending.length > 0 && this.bot.isOnline) {
        if (!skipEnableCheck && !this.config.supply.enable) {
          this.supplyPending = [];
          break;
        }

        const slotOk = await this.waitForSupplySlot();
        if (!slotOk) break;

        // 2202 selecciona el castillo → 2452 envía (patrón del juego);
        // entre 2201/2202/2452 hay un cooldown de 1 s (si van pegados, 2453 responde 0x0e = rate limit)
        await refreshMapCoord(this.bot, this.supplyTargetCoord!);
        await this.sendNextCaravan(skipEnableCheck);
        if (this.supplyPending.length === 0 && !this.supplyBatchSent) break;

        await this.waitForCaravanAck(3000);

        if (this.supplyPending.length > 0 && this.bot.isOnline) {
          await this.sleep(1200);
        }
      }
    } finally {
      this.supplyBusy = false;
      if (this.supplyPending.length > 0) {
        this.bot.log(`[SUPPLY] Lote interrumpido con ${this.supplyPending.length} pendientes, limpiando cola`);
        this.supplyPending = [];
        if (this.supplyManualActive) this.supplyManualFailed = true;
      }
      this.supplyManualActive = false;
      this.supplyCurrentTarget = null;
      this.bot.log(`[SUPPLY] Lote finalizado, reanudando acciones`);
      this.actions.resume();
    }
  }

  /**
   * Espera la respuesta 2453 del servidor.
   * Si el servidor no responde en timeoutMs, continúa igualmente
   * para no bloquear el flujo (podría ser que el ack ya venga por otra vía).
   */
  private waitForCaravanAck(timeoutMs: number): Promise<void> {
    return new Promise<void>(resolve => {
      this.supplyCaravanAckResolve = resolve;
      setTimeout(() => {
        if (this.supplyCaravanAckResolve === resolve) {
          this.supplyCaravanAckResolve = null;
          this.bot.log(`[SUPPLY] Timeout esperando 2453, continuando...`);
          resolve();
        }
      }, timeoutMs);
    });
  }

  /**
   * Construye y envía una única caravana (proto 2452).
   * Toma el primer recurso de supplyPending, arma el payload de 23 bytes
   * (3 bytes coordenada + 5×4 bytes recursos) y lo envía.
   * Descuenta los recursos localmente y avanza la cola.
   */
  async sendNextCaravan(skipEnableCheck = false): Promise<void> {
    if (this.supplyPending.length === 0) return;
    const cfg = this.config.supply;
    if (!skipEnableCheck && !cfg.enable) { this.supplyPending = []; return; }

    if (!this.supplyTargetCoord || this.supplyTargetCoord.length !== 3) {
      this.bot.log(`[SUPPLY] Sin ubicación de destino, saltando caravana`);
      this.supplyPending = [];
      return;
    }

    const entry = this.supplyPending[0];
    const rIdx = ['trigo', 'piedra', 'madera', 'mineral', 'oro'].indexOf(entry.name);
    const wheat = rIdx === 0 ? cfg.maxAmount : 0;
    const stone = rIdx === 1 ? cfg.maxAmount : 0;
    const wood = rIdx === 2 ? cfg.maxAmount : 0;
    const ore = rIdx === 3 ? cfg.maxAmount : 0;
    const gold = rIdx === 4 ? cfg.maxAmount : 0;

    const { sendCaravan } = require('../commands/supply.commands');
    await sendCaravan(this.bot, this.supplyTargetCoord, rIdx, cfg.maxAmount);
    this.resTracker.deduct(wheat, wood, stone, ore, gold);
    if (this.resources) {
      this.resources.wheat = Math.max(0, this.resources.wheat - wheat);
      this.resources.wood = Math.max(0, this.resources.wood - wood);
      this.resources.stone = Math.max(0, this.resources.stone - stone);
      this.resources.mineral = Math.max(0, this.resources.mineral - ore);
      this.resources.gold = Math.max(0, this.resources.gold - gold);
    }
    this.activeCaravans++;
    this.supplyBatchSent = true;
    this.supplyInFlight.push({ sentAt: this.nowSec(), freeAt: null });
    this.supplyLastSend = { entry, amount: cfg.maxAmount, wheat, wood, stone, ore, gold };

    entry.amount -= cfg.maxAmount;
    if (entry.amount <= 0) this.supplyPending.shift();

    const restan = this.supplyPending.length > 0 ? Math.ceil(this.supplyPending[0].amount / cfg.maxAmount) : 0;
    this.bot.log(`[SUPPLY] ${entry.name}: enviada 1 caravana, restan ${restan}, activas: ${this.activeCaravans}`);
  }

  private onShipUpdated(): void {
    const shipTs = this.bot.cargoShip?.timestamp;
    if (!shipTs) return;
    const serverUnix = Math.floor(shipTs.getTime() / 1000);
    const savedNext = this.config.ship.next;
    const lastExchanged = this.config.ship.lastExchangedTs;

    if (savedNext === 0 && !this.config.ship.reclaim) {
      this.config.ship.next = serverUnix;
      this.saveConfig();
      this.bot.log(`[BARCO] Primer ts guardado, next=${serverUnix}`);
      return;
    }

    if (serverUnix > savedNext && this.config.ship.reclaim) {
      this.config.ship.next = serverUnix;
      this.config.ship.reclaim = false;
      this.saveConfig();
      this.bot.log(`[BARCO] Nuevo barco detectado, next=${serverUnix} reclaim=false`);
    } else if (serverUnix === lastExchanged) {
      this.bot.log(`[BARCO] Mismo barco ya intercambiado (ts=${serverUnix}), ignorando`);
    }
  }

  serializableMarches(): MarchInfo[] {
    return serializableMarchesImpl(this);
  }

  async loadEvents(force = false): Promise<void> {
    if (!force && Date.now() - this.eventsLoadedAt < 30000) return;
    if (!databaseService.isConnected()) return;
    try {
      const [defs, claims] = await Promise.all([
        databaseService.EventModel.find({ active: true }).lean(),
        databaseService.EventClaimModel.find({ iggId: this.iggId }).lean(),
      ]);
      this.eventDefs = defs;
      this.eventClaims = new Map(claims.map((c: any) => [c.eventId, c]));
      this.eventsLoadedAt = Date.now();
      this.emit('eventsUpdated');
    } catch (err: any) {
      this.bot.log(`[EVENTOS] Error cargando eventos: ${err.message}`);
    }
  }

  getAvailableEvents(): any[] {
    const now = Math.floor(Date.now() / 1000);
    return this.eventDefs.filter((def: any) => {
      if (def.startAt && now < def.startAt) return false;
      if (def.endAt && now > def.endAt) return false;
      const next = this.eventClaims.get(def.eventId)?.nextClaimAt || 0;
      return next <= now;
    });
  }

  async runEvent(def: any): Promise<boolean> {
    let did = false;
    if (def.action) {
      const fn = EVENT_ACTIONS[def.action];
      if (fn) {
        did = await fn(this);
      } else {
        const action = findActionByName(def.action);
        if (action) {
          did = await action.execute(this);
        } else {
          this.bot.log(`[EVENTOS] Acción "${def.action}" no registrada (evento ${def.eventId})`);
        }
      }
    }
    if (!did && def.claimProto) {
      const payload = Buffer.from(def.claimPayload || '00', 'hex');
      claimEvent(this.bot, def.claimProto, payload);
      this.bot.log(`[EVENTOS] "${def.name}" reclamado (proto ${def.claimProto}, payload ${def.claimPayload || 'vacío'})`);
      did = true;
    }
    if (did && databaseService.isConnected()) {
      const now = Math.floor(Date.now() / 1000);
      const next = now + (def.cooldownSeconds || 3600);
      const claim = { iggId: this.iggId, eventId: def.eventId, nextClaimAt: next, available: true };
      this.eventClaims.set(def.eventId, claim);
      await databaseService.EventClaimModel.updateOne(
        { iggId: this.iggId, eventId: def.eventId },
        { $set: { nextClaimAt: next, available: true } },
        { upsert: true }
      ).catch(() => {});
      this.emit('eventsUpdated');
    }
    return did;
  }

  armCounter(march: any): void {
    armCounter(this, march);
  }

  armCounterTimer(march: any): void {
    armCounterTimer(this, march);
  }

  fireCounterNow(march: any): void {
    fireCounterNow(this, march);
  }

  revertCounter(march: any): void {
    revertCounter(this, march);
  }
}

function mergeConfig(config: Partial<BotConfig>, defaults: BotConfig): BotConfig {
  const merged: any = { ...defaults };
  for (const key of Object.keys(config) as (keyof BotConfig)[]) {
    const val = config[key];
    const def = defaults[key];
    if (val !== undefined && typeof val === 'object' && val !== null && !Array.isArray(val) && typeof def === 'object' && def !== null && !Array.isArray(def)) {
      merged[key] = { ...def, ...val };
    } else if (val !== undefined) {
      merged[key] = val;
    }
  }
  return merged as BotConfig;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
