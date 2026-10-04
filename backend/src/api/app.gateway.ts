import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as path from 'path';
import * as fs from 'fs';
import { AccountManager, AccountInfo } from '../bot/core/account-manager';
import { BotInstance } from '../bot/core/bot-instance';
import { configService, normalizeKeys } from '../config/config.service';
import { databaseService } from '../database/database.service';
import { defaultBotConfig, stripLegacyConfig } from '../models/bot-config';
import { notifyBotConnectionFailed } from '../bot/features/notification.service';
import { calculateMask } from '../models/troop-masks';
import { TroopType, TroopTier } from '../models/troop-state';
import { ProxyAuthBytes, loadProxyAuthBytes, saveProxyAuthBytes } from '../bot/features/proxy-auth-config';
import { getMissionName } from '../bot/data/mission-names';
import itemsData from '../bot/data/items.json';
import '../bot/data/techs.json';
import { COSTUME_DB } from '../bot/data/costume-db';
import { TALENT_DB, BRANCHES } from '../bot/data/talent-db';
import { BUILDING_DB } from '../bot/data/building-db';
import { EFFECT_DEFS } from '../bot/data/effect-db';
import { buildFamiliarViews } from '../bot/data/familiars-db';
import { buildArtifactViews, buildSetViews } from '../bot/data/artifacts-db';
import { DAILY_MISSION_CHESTS, dailyMissionInfo, dailyMissionState, maxDailyPa } from '../bot/data/daily-missions-db';
import { acceptGuildApplication, rejectGuildApplication } from '../bot/commands/guild-accept-reject.commands';
import { DiscordNotificationService } from '../discord/discord-notification.service';
import { EventRewardData } from '../bot/models/event-rewards.types';
import { huntCoordinator } from '../bot/models/hunt-coordinator';
import { distributeTotal } from '../bot/features/supply-distribute';
import { getBagTotalValue } from '../bot/features/bag-helper';
import { computePlayerStats } from '../bot/features/player-stats';
import { serverNowSec } from '../utils/clock-sync';
import { useFamiliarSkill } from '../bot/commands/familiar-skill.commands';
import { serializeHeroes } from '../bot/models/heroes.types';

/** Nombre de recurso del supply → clave de BAG_ITEMS / getBagTotalValue */
const SUPPLY_BAG_KEY: Record<string, string> = { trigo: 'wheat', piedra: 'stone', madera: 'wood', mineral: 'mineral', oro: 'gold' };

const ITEMS_DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'bot', 'data', 'items.json'), 'utf-8'));
const ITEMS_DB: Record<string, { name: string }> = ITEMS_DATA.ITEMS_DB || {};

/** Catálogo de investigaciones (sólo lo que necesita el frontend; sin costos por nivel). */
const TECHS_DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'bot', 'data', 'techs.json'), 'utf-8'));
const TECHS_CATALOG = {
  kinds: TECHS_DATA.kinds,
  techs: Object.fromEntries(
    Object.entries<any>(TECHS_DATA.techs || {}).map(([id, t]) => [
      id,
      { id: t.id, kind: t.kind, name: t.name, nameEn: t.nameEn, levelMax: t.levelMax, effect: t.effect, effectIds: t.effectIds, times: (t.levels || []).map((l: any) => l.time) },
    ]),
  ),
};

const SWEEP_DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'bot', 'data', 'hero-stages.json'), 'utf-8'));

function getItemName(itemId: number): string {
  const item = ITEMS_DB[String(itemId)];
  return item?.name || `Item ${itemId}`;
}

/**
 * Estado del "Diario" (3144/3143) ya enriquecido para el frontend: PA, cofres
 * con sus umbrales y cada contador con descripción, objetivo y estado
 * ('claimed' = reclamada | 'complete' = completa sin reclamar | 'progress').
 */
function serializeDailyMissions(instance: BotInstance) {
  const cache = instance.getDailyMissions();
  if (!cache) return null;
  return {
    pa: cache.pa,
    chestMask: cache.chestMask,
    missionRank: cache.missionRank,
    maxPa: maxDailyPa(cache.missionRank),
    chests: DAILY_MISSION_CHESTS,
    missions: cache.missions.map(m => {
      const info = dailyMissionInfo(m.id);
      return {
        id: m.id,
        value: m.value,
        requirement: info?.requirement ?? 0,
        energy: info?.energy ?? 0,
        icon: info?.icon ?? 0,
        desc: info?.desc || `Misión ${m.id}`,
        hint: info?.hint ?? null,
        param: info?.param ?? 0,
        state: dailyMissionState(m.id, m.value),
      };
    }),
  };
}

/** Catálogo de construcciones (sólo lo que necesita el frontend; sin efectos por nivel: van en `effects`). */
const BUILDING_CATALOG = Object.fromEntries(
  Object.entries(BUILDING_DB).map(([id, b]) => [
    id,
    {
      id: b.id,
      name: b.name,
      nameTable: b.nameTable,
      maxLevel: b.maxLevel,
      temporal: b.temporal || false,
      levels: Object.fromEntries(
        Object.entries(b.levels).map(([lv, l]) => [lv, { time: l.time, costs: l.costs, might: l.might }]),
      ),
    },
  ]),
);

// Serializar tiles sin rawData (Buffer) para evitar binarios en socket.io
function serializeMapTiles(tiles: any[]): any[] {
  return tiles.map(t => ({
    id: t.id,
    x: t.x,
    y: t.y,
    type: t.type,
    name: t.name,
    guild: t.guild,
    resource: t.resource,
    monster: t.monster,
    castle: t.castle,
    empty: t.empty,
    occupiedBy: t.occupiedBy,
    text: t.text,
    entityType: t.entityType,
  }));
}

interface ClientState {
  subscribedLogs: Set<number>;
  subscribedWars: Set<number>;
}

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/',
})
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  private capturing = false;
  private startingBots = new Set<number>();
  /** captura en curso (upsert en Mongo) — `listAccounts` espera a que termine */
  private pendingCapture: Promise<void> | null = null;

  private clients = new Map<string, ClientState>();

  private squadTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private accountManager: AccountManager,
    private discordNotifications: DiscordNotificationService,
  ) {
    // Proxy log/status from all bot instances to WebSocket
    this.accountManager.onLog = (iggId, msg) => {
      this.server.emit('log', { iggId, msg });
    };
    this.accountManager.onStatusChanged = (iggId) => {
      this.server.emit('statusChanged', { iggId, online: this.accountManager.instances.get(iggId)?.bot.isOnline });
    };
    // Squad de caza compartido entre bots: HP + quiénes van al mismo bicho.
    // Throttle de 1s: los 2201 de refresco cambian el HP muy seguido.
    huntCoordinator.on('changed', () => this.queueSquadEmit());
  }

  private queueSquadEmit(): void {
    if (this.squadTimer) return;
    this.squadTimer = setTimeout(() => {
      this.squadTimer = null;
      this.server?.emit('huntSquad', { squads: huntCoordinator.snapshot() });
    }, 1000);
  }

  handleConnection(client: Socket): void {
    console.log(`[WS] Cliente conectado: ${client.id} desde ${client.handshake?.address ?? 'desconocido'}`);
    this.clients.set(client.id, {
      subscribedLogs: new Set(),
      subscribedWars: new Set(),
    });
    client.emit('huntSquad', { squads: huntCoordinator.snapshot() });
  }

  handleDisconnect(client: Socket): void {
    console.log(`[WS] Cliente desconectado: ${client.id}`);
    this.clients.delete(client.id);
  }

  @SubscribeMessage('listAccounts')
  async handleListAccounts(client: Socket): Promise<void> {
    // Si hay una captura escribiendo en Mongo, esperarla: si no, el cliente que
    // se reconecta justo entonces recibe la lista vieja (sin la cuenta nueva)
    if (this.pendingCapture) await this.pendingCapture.catch(() => {});
    // Archivos + Mongo (cuentas capturadas que nunca tuvieron token.json)
    client.emit('accounts', await this.buildAccounts());
  }

  @SubscribeMessage('getItems')
  handleGetItems(client: Socket): void {
    client.emit('items', ITEMS_DATA);
  }

  @SubscribeMessage('getTechs')
  handleGetTechs(client: Socket): void {
    client.emit('techs', TECHS_CATALOG);
  }

  @SubscribeMessage('getHeroStages')
  handleGetHeroStages(client: Socket): void {
    client.emit('heroStages', SWEEP_DATA);
  }

  @SubscribeMessage('getRunningBots')
  handleGetRunningBots(client: Socket): void {
    const running: Record<number, boolean> = {};
    const players: Record<number, any> = {};
    const shields: Record<number, { remaining: number; name: string }> = {};
    const resData: Record<number, any> = {};
    const invData: Record<number, { itemId: number; amount: number }[]> = {};
    for (const [id, inst] of this.accountManager.instances) {
      running[id] = inst.bot.isOnline;
      if (inst.playerInfo) {
        const pi = inst.playerInfo;
        players[id] = { playerId: pi.playerId, playerName: pi.playerName, power: pi.power, gems: pi.gems, kills: pi.kills };
      }
      const shield = inst.buffs.shield;
      if (shield) shields[id] = { remaining: shield.remaining, name: shield.def.name };
      if (inst.resources) resData[id] = inst.resources;
      if (inst.inventory.size > 0) {
        invData[id] = Array.from(inst.inventory.entries()).map(([k, v]) => ({ itemId: k, amount: v }));
      }
    }
    const tcData: Record<number, any> = {};
    const bData: Record<number, any> = {};
    for (const [id, inst] of this.accountManager.instances) {
      if (inst.treasureChamber) tcData[id] = inst.treasureChamber;
      if (inst.buildingState.buildings.length > 0) bData[id] = { buildings: inst.buildingState.buildings };
    }
    client.emit('runningBots', { running, players, shields, resources: resData, inventory: invData, treasureChamber: tcData, buildingState: bData });
  }

  @SubscribeMessage('createAccount')
  async handleCreateAccount(client: Socket, payload: { iggId: number; accessToken: string; proxy?: string }): Promise<void> {
    if (!databaseService.isConnected()) {
      client.emit('error', { message: 'MongoDB no conectado' });
      return;
    }
    try {
      await this.upsertToken(payload.iggId, payload.accessToken, payload.proxy || '');
      await this.upsertConfigDefaults(payload.iggId, payload.proxy || '');
      client.emit('accountCreated', { iggId: payload.iggId });
      // El resto de clientes también deben ver la cuenta nueva en la lista
      this.server.emit('accounts', await this.buildAccounts());
    } catch (e: any) {
      client.emit('error', { message: `Error al crear cuenta: ${e.message}` });
    }
  }

  /** Token de acceso de la cuenta (upsert). */
  private async upsertToken(iggId: number, accessToken: string, proxy: string): Promise<void> {
    await databaseService.TokenModel.updateOne(
      { iggId },
      { $set: { iggId, accessToken, proxy } },
      { upsert: true },
    );
  }

  /**
   * Config por defecto de la cuenta (sólo al insertar) + proxy.
   *
   * `proxy` va SOLO en `$set`: si además está en `$setOnInsert` (dentro de
   * `defaultBotConfig(proxy)`) Mongo revienta con
   * `Updating the path 'proxy' would create a conflict at 'proxy'` y el upsert
   * entero se cae. `$set` también se aplica en el insert, así que no hace
   * falta duplicarlo.
   */
  private async upsertConfigDefaults(iggId: number, proxy: string): Promise<void> {
    const { proxy: _proxy, ...defaults } = defaultBotConfig(proxy);
    await databaseService.ConfigModel.updateOne(
      { iggId },
      { $setOnInsert: { iggId, ...defaults }, $set: { proxy } },
      { upsert: true },
    );
  }

  /** Lista de cuentas (archivos + Mongo), la misma que responde `listAccounts`. */
  private async buildAccounts(): Promise<any[]> {
    const accounts = configService.listAccounts();
    if (!databaseService.isConnected()) return accounts;
    try {
      const dbTokens = await databaseService.TokenModel.find({ accessToken: { $ne: '' } }).lean();
      const fileIds = new Set(accounts.map(a => a.iggId));
      for (const t of dbTokens) {
        if (!fileIds.has(String(t.iggId))) {
          const configDoc = await databaseService.ConfigModel.findOne({ iggId: t.iggId }).lean();
          accounts.push({
            iggId: String(t.iggId),
            token: { data: { access_token: t.accessToken }, proxy: t.proxy },
            config: configDoc || null,
          });
        }
      }
    } catch {}
    return accounts;
  }

  /** Lógica compartida de arranque (usada por startBot y por el auto-arranque al iniciar el servidor). */
  private async startBotInternal(iggId: number): Promise<{ ok: boolean; error?: string; code?: 'ALREADY' | 'STARTING' }> {
    if (this.startingBots.has(iggId)) return { ok: false, code: 'STARTING', error: 'Bot ya está iniciando para esta cuenta' };

    const existing = this.accountManager.instances.get(iggId);
    if (existing && (existing.bot.isOnline || existing.connecting)) {
      return { ok: false, code: 'ALREADY', error: 'Bot ya iniciado para esta cuenta' };
    }

    this.startingBots.add(iggId);
    try {
      if (existing) {
        // Instancia registrada pero desconectada (caída o en reconexión): reconectar en vez de rechazar.
        this.server.emit('botStarting', { iggId });
        const ok = await existing.connect();
        if (ok) this.server.emit('botStarted', { iggId });
        return { ok: true };
      }
      return await this.startBotLocked(iggId);
    } catch (e: any) {
      const msg = e?.message || 'Error inesperado al iniciar el bot';
      const inst = this.accountManager.instances.get(iggId);
      if (inst && !inst.bot.isOnline) this.accountManager.instances.delete(iggId);
      this.server.emit('statusChanged', { iggId, online: false });
      this.server.emit('connectionFailed', { iggId, message: msg });
      notifyBotConnectionFailed(iggId, msg).catch(() => {});
      return { ok: false, error: msg };
    } finally {
      this.startingBots.delete(iggId);
    }
  }

  /** Crea la instancia y conecta. Debe invocarse con el lock `startingBots` ya adquirido. */
  private async startBotLocked(iggId: number): Promise<{ ok: boolean; error?: string }> {
    let account: AccountInfo | null = null;
    try {
      account = await this.accountManager.loadAccountFromDB(iggId);
    } catch {
      return { ok: false, error: 'Cuenta no encontrada en MongoDB' };
    }

    if (!account) {
      return { ok: false, error: 'Cuenta no encontrada en MongoDB' };
    }

    const instance = new BotInstance(iggId, account.token, account.proxy, account.config);
    this.accountManager.instances.set(iggId, instance);
    this.server.emit('botStarting', { iggId });

    instance.on('log', (msg: string) => {
      this.server.emit('log', { iggId, msg });
    });
    instance.on('statusChanged', () => {
      this.server.emit('statusChanged', { iggId, online: instance.bot.isOnline });
    });
    instance.on('ready', () => {
      this.server.emit('ready', { iggId });
      instance.runAutoShield();
      instance.runAutoHelp();
    });
    instance.on('playerInfoUpdated', () => {
      const info = instance.playerInfo
        ? {
            ...instance.playerInfo,
            energy: instance.getCurrentEnergy(),
            energyMax: instance.getEnergyMax(),
            currentResistencia: instance.getCurrentResistencia(),
            resistenciaMax: instance.getResistenciaMax(),
            energyRegen: instance.getEnergyRegen(),
          }
        : null;
      this.server.emit('playerInfo', { iggId, info });
    });
    instance.on('resourcesUpdated', () => {
      this.server.emit('resources', { iggId, resources: instance.resources });
    });
    instance.on('guildInfoUpdated', () => {
      this.server.emit('guildInfo', { iggId, info: instance.guildInfo });
    });
    instance.on('guildApplicationsUpdated', (data) => {
      this.server.emit('guildApplications', { iggId, applications: data?.applications || null });
    });

    instance.on('troopTrainingUpdated', () => {
      this.server.emit('troopTraining', { iggId, training: instance.troopTraining });
    });
    instance.on('inventoryUpdated', () => {
      const inv = Array.from(instance.inventory.entries()).map(([k, v]) => ({ itemId: k, amount: v }));
      this.server.emit('inventory', { iggId, inventory: inv });
    });
    instance.on('buildingStateUpdated', () => {
      this.server.emit('buildingState', {
        iggId,
        buildingState: { buildings: instance.buildingState.buildings },
        playerStats: instance.playerStats || computePlayerStats(instance),
      });
    });
    instance.on('constructionsUpdated', () => {
      this.server.emit('constructions', { iggId, constructions: instance.constructions || null });
    });
    instance.on('researchUpdated', () => {
      this.server.emit('research', {
        iggId,
        research: instance.research || null,
        playerStats: instance.playerStats || computePlayerStats(instance),
      });
    });
    instance.on('talentsUpdated', () => {
      this.server.emit('talents', {
        iggId,
        talents: instance.talents || null,
        playerStats: instance.playerStats || computePlayerStats(instance),
      });
    });
    instance.on('essenceUpdated', () => {
      this.server.emit('essence', { iggId, essenceState: instance.essenceState || null });
    });
    instance.on('troopsUpdated', () => {
      this.server.emit('troops', { iggId, troopState: { troops: instance.troopState.troops } });
    });
    instance.on('hospitalUpdated', () => {
      this.server.emit('hospitalState', { iggId, hospitalState: instance.hospitalState || null });
    });
    instance.on('marchesUpdated', () => {
      this.server.emit('incomingMarches', { iggId, marches: instance.serializableMarches() });
    });
    instance.on('ownMarchesUpdated', () => {
      this.server.emit('ownMarches', { iggId, marches: instance.ownMarches || null });
    });
    instance.on('familiarsUpdated', () => {
      const f = instance.familiars;
      this.server.emit('familiars', {
        iggId,
        list: f ? buildFamiliarViews(f) : [],
        playerStats: instance.playerStats || computePlayerStats(instance),
        cooldowns: f?.cooldowns ?? [],
        fatigue: f?.fatigue ?? null,
        buffs: f?.buffs ?? [],
      });
    });
    instance.on('artifactsUpdated', () => {
      this.server.emit('artifacts', {
        iggId,
        artifacts: {
          list: buildArtifactViews(instance.artifacts),
          sets: buildSetViews(instance.artifacts),
        },
        playerStats: instance.playerStats || computePlayerStats(instance),
      });
    });
    instance.marchQueue.on('enqueued', () => {
      this.server.emit('marchQueueUpdated', { iggId, queue: instance.marchQueue.all.map(e => ({ id: e.id, type: e.type, status: e.status, createdAt: e.createdAt, sentAt: e.sentAt, ackedAt: e.ackedAt, completedAt: e.completedAt, error: e.error, meta: e.meta })) });
    });
    instance.marchQueue.on('acked', () => {
      this.server.emit('marchQueueUpdated', { iggId, queue: instance.marchQueue.all.map(e => ({ id: e.id, type: e.type, status: e.status, createdAt: e.createdAt, sentAt: e.sentAt, ackedAt: e.ackedAt, completedAt: e.completedAt, error: e.error, meta: e.meta })) });
    });
    instance.marchQueue.on('failed', () => {
      this.server.emit('marchQueueUpdated', { iggId, queue: instance.marchQueue.all.map(e => ({ id: e.id, type: e.type, status: e.status, createdAt: e.createdAt, sentAt: e.sentAt, ackedAt: e.ackedAt, completedAt: e.completedAt, error: e.error, meta: e.meta })) });
    });
    instance.marchQueue.on('cancelled', () => {
      this.server.emit('marchQueueUpdated', { iggId, queue: instance.marchQueue.all.map(e => ({ id: e.id, type: e.type, status: e.status, createdAt: e.createdAt, sentAt: e.sentAt, ackedAt: e.ackedAt, completedAt: e.completedAt, error: e.error, meta: e.meta })) });
    });
    instance.on('eventsUpdated', () => {
      this.server.emit('events', { iggId, eventDefs: instance.eventDefs || [], eventClaims: Array.from(instance.eventClaims.values()) });
    });
    instance.on('chatMessage', (msg) => {
      this.server.emit('chatMessage', { iggId, message: msg });
    });
    instance.on('chatHistoryLoaded', (messages) => {
      this.server.emit('chatHistory', { iggId, messages });
    });
    instance.on('leaderUpdated', () => {
      this.server.emit('leaderState', { iggId, isCaptured: instance.isLeaderCaptured, isExecuted: instance.isLeaderExecuted, freeRevivalAt: instance.leaderFreeRevivalAt, captiveData: instance.captiveData || null });
    });

    instance.on('coliseumUpdated', () => {
      this.server.emit('coliseum', { iggId, state: instance.coliseumState || null });
    });
    instance.on('heroListUpdated', (heroes) => {
      this.server.emit('heroes', {
        iggId,
        heroes: serializeHeroes(heroes),
        playerStats: instance.playerStats || computePlayerStats(instance),
      });
    });
    instance.on('missionsUpdated', () => {
      this.server.emit('missions', { iggId, missions: instance.missions || null });
    });
    instance.on('missionRecordsUpdated', () => {
      this.server.emit('missionRecords', { iggId, missionRecords: instance.missionRecords || null });
    });
    instance.on('fdgExtensionUpdated', () => {
      this.server.emit('fdgExtension', { iggId, fdgExtension: instance.fdgExtension || null });
    });
    instance.on('dailyMissionsUpdated', () => {
      this.server.emit('dailyMissions', { iggId, dailyMissions: serializeDailyMissions(instance) });
    });
    instance.on('buffsUpdated', () => {
      const shield = instance.buffs.shield;
      this.server.emit('shield', { iggId, remaining: shield?.remaining || 0, name: shield?.def.name || '' });
    });
    instance.on('warsUpdated', (wars) => {
      this.server.emit('wars', { iggId, wars });
    });
    instance.on('warParticipantsUpdated', (participants) => {
      this.server.emit('warParticipants', { iggId, participants });
    });
    instance.on('warNotification', (count: number) => {
      this.server.emit('warNotification', { iggId, count });
    });
    instance.on('costumesUpdated', (costumes) => {
      this.server.emit('costumes', { iggId, costumes });
    });
    instance.on('equippedCostumesUpdated', (equippedCostumes) => {
      this.server.emit('equippedCostumes', {
        iggId,
        equippedCostumes,
        playerStats: instance.playerStats || computePlayerStats(instance),
      });
    });
    instance.on('mapDataUpdated', () => {
      this.server.emit('mapDataUpdated', {
        iggId,
        mapTiles: serializeMapTiles(Array.from(instance.mapTiles.values())),
        mapMarches: Array.from(instance.mapMarches.values()),
      });
    });
    instance.on('huntUpdated', () => {
      this.server.emit('huntUpdated', {
        iggId,
        huntTarget: instance.huntTarget,
        energy: instance.getCurrentEnergy(),
      });
    });
    instance.on('eventRewardsUpdated', ({ data, body }: { data: EventRewardData; body: Buffer }) => {
      this.server.emit('eventRewards', { iggId, data });
      this.notifyEventRewards(iggId, data, body).catch(() => {});
    });

    instance.on('connectionFailed', (reason?: string) => {
      this.server.emit('statusChanged', { iggId, online: false });
      this.server.emit('shield', { iggId, remaining: 0, name: '' });
      this.server.emit('connectionFailed', { iggId, message: reason || 'Conexión fallida' });
      this.accountManager.instances.delete(iggId);
      notifyBotConnectionFailed(iggId, reason || 'Conexión fallida').catch(() => {});
    });

    const connected = await instance.connect();
    if (connected) {
      this.server.emit('botStarted', { iggId });
    } else {
      if (!instance.bot.isOnline && !instance.connecting) this.accountManager.instances.delete(iggId);
      this.server.emit('connectionFailed', { iggId, message: 'No se pudo conectar' });
      notifyBotConnectionFailed(iggId, 'No se pudo conectar').catch(() => {});
    }
    return { ok: true };
  }

  @SubscribeMessage('startBot')
  async handleStartBot(client: Socket, payload: { iggId: number }): Promise<void> {
    const res = await this.startBotInternal(payload.iggId);
    if (!res.ok) client.emit('error', { iggId: payload.iggId, message: res.error });
  }

  /** Auto-arranque al iniciar el servidor: levanta todas las cuentas con config.autoStart = true. */
  async autoStartFromDB(): Promise<void> {
    if (!databaseService.isConnected()) {
      console.log('[BotIgg] AutoStart omitido: MongoDB no conectado');
      return;
    }

    try {
      const { resolveVersion } = await import('../bot/features/version-resolver');
      const version = await resolveVersion();
      console.log(`[BotIgg] Versión del juego: v${version.major}.${version.minor}.${version.patch}`);
    } catch (e: any) {
      console.warn('[BotIgg] No se pudo resolver versión, usando defaults:', e?.message);
    }

    try {
      const docs = await databaseService.ConfigModel.find({ autoStart: true }).lean();
      console.log(`[BotIgg] AutoStart: ${docs.length} cuentas con autoStart=true`);
      let started = 0;
      for (const doc of docs) {
        const iggId = Number((doc as any).iggId);
        if (!Number.isFinite(iggId)) continue;
        const res = await this.startBotInternal(iggId);
        if (res.ok) {
          started++;
          console.log(`[BotIgg] AutoStart: cuenta ${iggId} iniciada`);
        } else {
          console.log(`[BotIgg] AutoStart: cuenta ${iggId} omitida (${res.error})`);
        }
        // Escalonar conexiones para no saturar proxies/red al bootear
        await new Promise(r => setTimeout(r, 5000));
      }
      console.log(`[BotIgg] AutoStart completado: ${started}/${docs.length} cuentas`);
    } catch (e: any) {
      console.warn('[BotIgg] AutoStart falló:', e?.message);
    }
  }

  @SubscribeMessage('stopBot')
  async handleStopBot(client: Socket, payload: { iggId: number }): Promise<void> {
    this.startingBots.delete(payload.iggId);
    this.accountManager.stopAccount(payload.iggId);
    this.server.emit('statusChanged', { iggId: payload.iggId, online: false });
    this.server.emit('shield', { iggId: payload.iggId, remaining: 0, name: '' });
    this.server.emit('botStopped', { iggId: payload.iggId });
  }

  @SubscribeMessage('getBotData')
  handleGetBotData(client: Socket, payload: { iggId: number }): void {
    const instance = this.accountManager.instances.get(payload.iggId);
    if (!instance) {
      client.emit('error', { message: 'Bot no encontrado' });
      return;
    }
    const shield = instance.buffs.shield;
    client.emit('botData', {
      iggId: payload.iggId,
      playerInfo: instance.playerInfo
        ? {
            ...instance.playerInfo,
            energy: instance.getCurrentEnergy(),
            energyMax: instance.getEnergyMax(),
            currentResistencia: instance.getCurrentResistencia(),
            resistenciaMax: instance.getResistenciaMax(),
          }
        : null,
      resources: instance.resources,
      shield: shield ? { remaining: shield.remaining, name: shield.def.name } : null,
      guildInfo: instance.guildInfo,
      troopTraining: instance.troopTraining,
      troopState: { troops: instance.troopState.troops },
      hospitalState: instance.hospitalState || null,
      incomingMarches: instance.serializableMarches(),
      ownMarches: instance.ownMarches || null,
      familiars: instance.familiars ? buildFamiliarViews(instance.familiars) : [],
      familiarCooldowns: instance.familiars?.cooldowns ?? [],
      familiarFatigue: instance.familiars?.fatigue ?? null,
      familiarBuffs: instance.familiars?.buffs ?? [],
      artifacts: {
        list: buildArtifactViews(instance.artifacts),
        sets: buildSetViews(instance.artifacts),
      },
      marchHistory: instance.marchHistory || [],
      eventDefs: instance.eventDefs || [],
      eventClaims: Array.from(instance.eventClaims.values()),
      inventory: Array.from(instance.inventory.entries()).map(([k, v]) => ({ itemId: k, amount: v })),
      wars: instance.war.activeWarsList,
      treasureChamber: instance.treasureChamber,
      essenceState: instance.essenceState || null,
      buildingState: { buildings: instance.buildingState.buildings },
      constructions: instance.constructions || null,
      research: instance.research || null,
      talents: instance.talents || null,
      playerStats: instance.playerStats || computePlayerStats(instance),
      online: instance.bot.isOnline,
      launched: instance.launched,
      isLeaderCaptured: instance.isLeaderCaptured,
      isLeaderExecuted: instance.isLeaderExecuted,
      leaderFreeRevivalAt: instance.leaderFreeRevivalAt,
      captiveData: instance.captiveData || null,
      coliseum: instance.coliseumState || null,
      heroes: serializeHeroes(instance.heroes || []),
      missions: instance.missions || null,
      missionRecords: instance.missionRecords || null,
      dailyMissions: serializeDailyMissions(instance),
      fdgExtension: instance.fdgExtension || null,
      config: instance.config,
      mapTiles: serializeMapTiles(Array.from(instance.mapTiles.values())),
      huntTarget: instance.huntTarget,
      chatMessages: instance.chatMessages || [],
      guildApplications: instance.guildApplications?.applications || null,
      costumes: instance.costumes || [],
      equippedCostumes: instance.equippedCostumes || [],
      costumeDB: COSTUME_DB,
      effects: EFFECT_DEFS,
      buildingDB: BUILDING_CATALOG,
      talentDB: TALENT_DB,
      talentBranches: BRANCHES,
      logs: instance.recentLogs.slice(-200),
      autoActionsRunning: instance.actions.isRunning,
    });
  }

  @SubscribeMessage('sendCommand')
  handleSendCommand(client: Socket, payload: { iggId: number; command: string }): void {
    const instance = this.accountManager.instances.get(payload.iggId);
    if (!instance) {
      client.emit('error', { message: 'Bot no encontrado' });
      return;
    }
    instance.bot.log(`[CMD] ${payload.command}`);
    // Simple command dispatch
    const cmd = payload.command.toLowerCase().trim();
    if (cmd === 'help' || cmd === 'ayuda') {
      instance.bot.sendHelp();
    } else if (cmd.startsWith('chat ')) {
      instance.bot.sendChat(payload.command.substring(5));
    } else if (cmd === 'disconnect' || cmd === 'desconectar') {
      instance.disconnect();
    } else if (cmd === 'shield' || cmd === 'escudo') {
      instance.tryRenewShield();
    } else if (cmd === 'fury' || cmd === 'furia') {
      const { activateFury } = require('../bot/features/fury');
      activateFury(instance);
    } else {
      instance.bot.log(`[-] Comando desconocido: ${payload.command}`);
    }
  }

  @SubscribeMessage('requestMapData')
  handleRequestMapData(client: Socket, payload: { iggId: number; x?: number; y?: number }): void {
    const instance = this.accountManager.instances.get(payload.iggId);
    if (!instance) return;
    instance.requestMapData(payload.x, payload.y);
  }

  /** Cazar el monstruo de un tile (2488); tileId opcional → mejor candidato del mapa. */
  @SubscribeMessage('huntMonster')
  handleHuntMonster(client: Socket, payload: { iggId: number; tileId?: number }): void {
    const instance = this.accountManager.instances.get(payload.iggId);
    if (!instance) return;
    const res = instance.startHunt(payload.tileId);
    client.emit('huntResult', { iggId: payload.iggId, ...res });
    instance.emitHuntUpdate();
  }

  @SubscribeMessage('huntStop')
  handleHuntStop(client: Socket, payload: { iggId: number }): void {
    const instance = this.accountManager.instances.get(payload.iggId);
    if (!instance) return;
    instance.stopHunt();
  }

  @SubscribeMessage('setWarViewing')
  handleSetWarViewing(client: Socket, payload: { iggId: number; viewing: boolean }): void {
    const instance = this.accountManager.instances.get(payload.iggId);
    if (!instance) return;
    instance.war.setViewing(payload.viewing);
    if (payload.viewing) {
      instance.requestWarData();
    } else {
      instance.uiSection = 0x02;
      instance.bot.log('[AGRU] UI → sección personaje (0x02)');
    }
  }

  @SubscribeMessage('buyFruit')
  handleBuyFruit(client: Socket, payload: { iggId: number }): void {
    const instance = this.accountManager.instances.get(payload.iggId);
    if (!instance || !instance.bot.isOnline) return;
    const body = Buffer.from('010c005d040100', 'hex');
    instance.bot.sendEncrypted(1408, body);
    instance.bot.log('[LÍDER] Comprando fruta de reanimación...');
  }

  @SubscribeMessage('useFruit')
  handleUseFruit(client: Socket, payload: { iggId: number }): void {
    const instance = this.accountManager.instances.get(payload.iggId);
    if (!instance || !instance.bot.isOnline) return;
    const body = Buffer.from('5d04010000000000000000000000', 'hex');
    instance.bot.sendEncrypted(1406, body);
    instance.bot.log('[LÍDER] Usando fruta de reanimación...');
  }

  @SubscribeMessage('useFamiliarSkill')
  handleUseFamiliarSkill(client: Socket, payload: { iggId: number; petId: number; skillId: number; force?: boolean }): void {
    const instance = this.accountManager.instances.get(payload.iggId);
    if (!instance) { client.emit('error', { message: 'Bot no encontrado' }); return; }
    if (!instance.bot.isOnline) { client.emit('error', { message: 'Bot no conectado' }); return; }

    const cd = instance.familiars?.cooldowns?.find(c => c.skillId === payload.skillId);
    const now = serverNowSec();
    if (!payload.force && cd && cd.availableAt > now) {
      client.emit('familiarSkillResult', {
        iggId: payload.iggId,
        petId: payload.petId,
        skillId: payload.skillId,
        sent: false,
        reason: 'cooldown',
        availableAt: cd.availableAt,
        remainingSec: cd.availableAt - now,
      });
      return;
    }

    const pi = instance.playerInfo;
    if (!pi) { client.emit('error', { message: 'Sin datos de personaje' }); return; }
    useFamiliarSkill(instance.bot, payload.petId, payload.skillId, { x: pi.castleX, y: pi.castleY });
    instance.bot.log(`[MONSTRUITOS] Uso de skill ${payload.skillId} (pet ${payload.petId})${payload.force ? ' (force)' : ''}`);
    client.emit('familiarSkillResult', {
      iggId: payload.iggId,
      petId: payload.petId,
      skillId: payload.skillId,
      sent: true,
    });
  }

  @SubscribeMessage('requestWarData')
  handleRequestWarData(client: Socket, payload: { iggId: number }): void {
    const instance = this.accountManager.instances.get(payload.iggId);
    if (!instance) return;
    instance.war.setViewing(true);
    instance.requestWarData();
  }

  @SubscribeMessage('acceptGuildApplication')
  handleAcceptGuildApplication(client: Socket, payload: { iggId: number; userId: number }): void {
    const instance = this.accountManager.instances.get(payload.iggId);
    if (!instance || !instance.bot.isOnline) return;
    instance.bot.log(`[GREMIO] Aceptando solicitud de usuario ${payload.userId}`);
    acceptGuildApplication(instance.bot, payload.userId);
  }

  @SubscribeMessage('rejectGuildApplication')
  handleRejectGuildApplication(client: Socket, payload: { iggId: number; userId: number }): void {
    const instance = this.accountManager.instances.get(payload.iggId);
    if (!instance || !instance.bot.isOnline) return;
    instance.bot.log(`[GREMIO] Rechazando solicitud de usuario ${payload.userId}`);
    rejectGuildApplication(instance.bot, payload.userId);
  }

  @SubscribeMessage('requestWarParticipants')
  handleRequestWarParticipants(client: Socket, payload: { iggId: number; warIndex: number }): void {
    const instance = this.accountManager.instances.get(payload.iggId);
    if (!instance) return;
    instance.requestWarParticipants(payload.warIndex);
  }

  @SubscribeMessage('requestTroops')
  handleRequestTroops(client: Socket, payload: { iggId: number }): void {
    const instance = this.accountManager.instances.get(payload.iggId);
    if (!instance) return;
    client.emit('troops', { iggId: payload.iggId, troopState: { troops: instance.troopState.troops } });
  }

  @SubscribeMessage('openChest')
  handleOpenChest(client: Socket, payload: { iggId: number; itemId: number; quantity: number }): void {
    const instance = this.accountManager.instances.get(payload.iggId);
    if (!instance) { client.emit('error', { message: 'Bot no encontrado' }); return; }
    if (!instance.bot.isOnline) { client.emit('error', { message: 'Bot no conectado' }); return; }

    instance.actions.pause();
    client.emit('chestProgress', { iggId: payload.iggId, opened: 0, total: payload.quantity, done: false });

    instance.openChest(payload.itemId, payload.quantity, (opened, total) => {
      client.emit('chestProgress', { iggId: payload.iggId, opened, total, done: opened >= total });
    });

    instance.bot.enqueueCommand(async () => {
      instance.actions.resume();
      client.emit('chestProgress', { iggId: payload.iggId, opened: payload.quantity, total: payload.quantity, done: true });
    });
  }

  @SubscribeMessage('globalCommand')
  handleGlobalCommand(client: Socket, payload: { proto: number; body: string }): void {
    const body = Buffer.from(payload.body.replace(/\s+/g, ''), 'hex');
    if (body.length === 0) { client.emit('error', { message: 'Body inválido' }); return; }
    let count = 0;
    for (const [id, inst] of this.accountManager.instances) {
      if (inst.bot.isOnline) {
        inst.bot.sendCommandPacket(payload.proto, body, true);
        count++;
      }
    }
    client.emit('globalCommandResult', { sent: count, proto: payload.proto });
  }

  @SubscribeMessage('sendManualSupply')
  async handleSendManualSupply(
    client: Socket,
    payload: { iggId?: number; iggIds?: number[]; targetPlayer: string; resources?: string[]; amounts?: Record<string, number>; useBag?: boolean },
  ): Promise<void> {
    const ids: number[] = [];
    if (payload.iggId) ids.push(payload.iggId);
    if (payload.iggIds?.length) ids.push(...payload.iggIds);
    const unique = [...new Set(ids)];
    if (unique.length === 0) { client.emit('error', { message: 'Sin bots seleccionados' }); return; }
    if (!payload.targetPlayer?.trim()) { client.emit('error', { message: 'Jugador objetivo requerido' }); return; }

    let sent = 0;
    let failed = 0;
    const target = payload.targetPlayer.trim();

    // Modo batch: montos TOTALES por recurso → se reparte entre las cuentas
    // (parte justa + reasignación a las que sí tienen capacidad).
    const amounts: Record<string, number> = {};
    if (payload.amounts) {
      for (const name of Object.keys(SUPPLY_BAG_KEY)) {
        const v = Math.floor(Number(payload.amounts[name]) || 0);
        if (v > 0) amounts[name] = v;
      }
    }
    const batchMode = Object.keys(amounts).length > 0;

    const slices = new Map<number, Record<string, number>>();
    const shortfall: Record<string, number> = {};
    if (batchMode) {
      const storeOf = (inst: BotInstance, name: string): number => {
        const r = inst.resources;
        if (!r) return 0;
        return name === 'trigo' ? r.wheat : name === 'piedra' ? r.stone : name === 'madera' ? r.wood : name === 'mineral' ? r.mineral : r.gold;
      };
      const instances = unique.map(id => ({ id, inst: this.accountManager.instances.get(id) }));
      for (const name of Object.keys(amounts)) {
        const caps = instances.map(({ inst }) => {
          if (!inst || !inst.bot.isOnline || !inst.resources) return 0;
          let cap = storeOf(inst, name);
          if (payload.useBag) cap += getBagTotalValue(inst.inventory, SUPPLY_BAG_KEY[name]);
          return cap;
        });
        const parts = distributeTotal(amounts[name], caps);
        const assigned = parts.reduce((a, b) => a + b, 0);
        if (assigned < amounts[name]) shortfall[name] = amounts[name] - assigned;
        instances.forEach(({ id }, i) => {
          if (parts[i] <= 0) return;
          const m = slices.get(id) || {};
          m[name] = parts[i];
          slices.set(id, m);
        });
      }
      if (Object.keys(shortfall).length > 0) {
        const detail = Object.entries(shortfall).map(([n, v]) => `${n} ${v}`).join(', ');
        client.emit('error', { message: `Capacidad total insuficiente: falta enviar ${detail} (almacén + bolsa de las cuentas seleccionadas)` });
      }
    }

    const results = await Promise.all(unique.map(async (id) => {
      try {
        const instance = this.accountManager.instances.get(id);
        if (!instance || !instance.bot.isOnline) {
          client.emit('supplyResult', { iggId: id, ok: false, message: instance ? 'Bot no conectado' : 'Bot no encontrado' });
          return false;
        }
        const mySlice = batchMode ? slices.get(id) : undefined;
        if (batchMode && !mySlice) {
          client.emit('supplyResult', { iggId: id, ok: true, message: 'Parte 0: sin recursos disponibles (nada que enviar)' });
          return true;
        }
        client.emit('supplyStarted', { iggId: id });
        const result = await instance.manualSupply(target, payload.resources, mySlice, payload.useBag);
        client.emit('supplyResult', { iggId: id, ok: result.ok, message: result.message });
        return result.ok;
      } catch (err: any) {
        client.emit('supplyResult', { iggId: id, ok: false, message: `Error inesperado: ${err?.message ?? err}` });
        return false;
      }
    }));
    for (const ok of results) { if (ok) sent++; else failed++; }
    client.emit('supplyBatchResult', { total: unique.length, sent, failed, targetPlayer: payload.targetPlayer, shortfall: batchMode ? shortfall : undefined });
  }

  @SubscribeMessage('stopManualSupply')
  handleStopManualSupply(client: Socket, payload: { iggId: number }): void {
    const instance = this.accountManager.instances.get(payload.iggId);
    if (!instance) {
      client.emit('supplyStopped', { iggId: payload.iggId, stopped: false, message: 'Bot no encontrado' });
      return;
    }
    const res = instance.stopSupply();
    client.emit('supplyStopped', { iggId: payload.iggId, stopped: res.stopped, message: res.message });
  }

  @SubscribeMessage('sendRawProto')
  handleSendRawProto(client: Socket, payload: { iggId: number; proto: number; body: string; seq?: boolean }): void {
    const instance = this.accountManager.instances.get(payload.iggId);
    if (!instance) { client.emit('error', { message: 'Bot no encontrado' }); return; }
    if (!instance.bot.isOnline) { client.emit('error', { message: 'Bot no conectado' }); return; }
    const body = Buffer.from(payload.body.replace(/\s+/g, ''), 'hex');
    instance.bot.sendCommandPacket(payload.proto, body, payload.seq !== false);
    client.emit('rawProtoSent', { iggId: payload.iggId, proto: payload.proto, bytes: body.length });
  }

  @SubscribeMessage('sendRawBatch')
  async handleSendRawBatch(client: Socket, payload: { iggId: number; commands: { proto: number; body: string; seq?: boolean }[]; delayMs?: number }): Promise<void> {
    const instance = this.accountManager.instances.get(payload.iggId);
    if (!instance) { client.emit('error', { message: 'Bot no encontrado' }); return; }
    if (!instance.bot.isOnline) { client.emit('error', { message: 'Bot no conectado' }); return; }
    const delay = payload.delayMs || 500;
    for (let i = 0; i < payload.commands.length; i++) {
      const cmd = payload.commands[i];
      const body = Buffer.from(cmd.body.replace(/\s+/g, ''), 'hex');
      instance.bot.sendCommandPacket(cmd.proto, body, cmd.seq !== false);
      client.emit('rawBatchProgress', { iggId: payload.iggId, sent: i + 1, total: payload.commands.length, proto: cmd.proto });
      if (i < payload.commands.length - 1) {
        await new Promise(r => setTimeout(r, delay));
      }
    }
    client.emit('rawBatchDone', { iggId: payload.iggId, total: payload.commands.length });
  }

  @SubscribeMessage('toggleAutoActions')
  handleToggleAutoActions(client: Socket, payload: { iggId: number }): void {
    const instance = this.accountManager.instances.get(payload.iggId);
    if (!instance) return;
    if (instance.actions.isRunning) {
      instance.actions.pause();
    } else {
      instance.actions.resume();
    }
    client.emit('autoActionsState', { iggId: payload.iggId, running: instance.actions.isRunning });
  }

  @SubscribeMessage('cancelMarchQueue')
  handleCancelMarchQueue(client: Socket, payload: { iggId: number; entryId?: number }): void {
    const instance = this.accountManager.instances.get(payload.iggId);
    if (!instance) { client.emit('error', { message: 'Bot no encontrado' }); return; }
    if (payload.entryId) {
      instance.marchQueue.cancel(payload.entryId);
    } else {
      instance.marchQueue.cancelAll();
    }
    client.emit('marchQueueUpdated', { iggId: payload.iggId, queue: instance.marchQueue.all.map(e => ({ id: e.id, type: e.type, status: e.status, createdAt: e.createdAt, sentAt: e.sentAt, ackedAt: e.ackedAt, completedAt: e.completedAt, error: e.error, meta: e.meta })) });
  }

  @SubscribeMessage('clearMarchQueue')
  handleClearMarchQueue(client: Socket, payload: { iggId: number }): void {
    const instance = this.accountManager.instances.get(payload.iggId);
    if (!instance) return;
    instance.marchQueue.clear();
    client.emit('marchQueueUpdated', { iggId: payload.iggId, queue: instance.marchQueue.all.map(e => ({ id: e.id, type: e.type, status: e.status, createdAt: e.createdAt, sentAt: e.sentAt, ackedAt: e.ackedAt, completedAt: e.completedAt, error: e.error, meta: e.meta })) });
  }

  @SubscribeMessage('getAutoActionsState')
  handleGetAutoActionsState(client: Socket, payload: { iggId: number }): void {
    const instance = this.accountManager.instances.get(payload.iggId);
    if (!instance) return;
    client.emit('autoActionsState', { iggId: payload.iggId, running: instance.actions.isRunning });
  }

  @SubscribeMessage('listGlobalCommands')
  async handleListGlobalCommands(client: Socket): Promise<void> {
    const list = await this.fetchGlobalCommands();
    client.emit('globalCommands', list);
  }

  @SubscribeMessage('addGlobalCommand')
  async handleAddGlobalCommand(client: Socket, payload: { name: string; proto: number; hex: string; kind?: string }): Promise<void> {
    if (!databaseService.isConnected()) {
      client.emit('error', { message: 'MongoDB no conectado' });
      return;
    }
    const name = (payload?.name || '').trim();
    const proto = Number(payload?.proto);
    const hex = (payload?.hex || '').replace(/\s+/g, '').toLowerCase();
    const kind = payload?.kind === 'chests' ? 'chests' : 'packet';
    if (!name) { client.emit('error', { message: 'Nombre requerido' }); return; }
    if (kind === 'packet') {
      if (!Number.isFinite(proto) || proto <= 0) { client.emit('error', { message: 'Proto inválido' }); return; }
      if (!/^[0-9a-f]+$/i.test(hex) || hex.length === 0 || hex.length % 2 !== 0) {
        client.emit('error', { message: 'Hex inválido (debe ser par de caracteres hexadecimales)' });
        return;
      }
    }
    try {
      await databaseService.GlobalCommandModel.updateOne(
        { name },
        { $set: { name, proto, hex, kind } },
        { upsert: true }
      );
      const list = await this.fetchGlobalCommands();
      this.server.emit('globalCommands', list);
      client.emit('globalCommandSaved', { name, proto, hex, kind });
    } catch (e: any) {
      client.emit('error', { message: `Error guardando comando: ${e.message}` });
    }
  }

  @SubscribeMessage('removeGlobalCommand')
  async handleRemoveGlobalCommand(client: Socket, payload: { name: string }): Promise<void> {
    if (!databaseService.isConnected()) {
      client.emit('error', { message: 'MongoDB no conectado' });
      return;
    }
    const name = (payload?.name || '').trim();
    if (!name) { client.emit('error', { message: 'Nombre requerido' }); return; }
    try {
      await databaseService.GlobalCommandModel.deleteOne({ name });
      const list = await this.fetchGlobalCommands();
      this.server.emit('globalCommands', list);
    } catch (e: any) {
      client.emit('error', { message: `Error borrando comando: ${e.message}` });
    }
  }

  private async fetchGlobalCommands(): Promise<{ name: string; proto: number; hex: string; kind: string }[]> {
    if (!databaseService.isConnected()) return [];
    try {
      const docs = await databaseService.GlobalCommandModel.find({}).sort({ name: 1 }).lean();
      return docs.map((d: any) => ({ name: d.name, proto: d.proto, hex: d.hex, kind: d.kind || 'packet' }));
    } catch {
      return [];
    }
  }

  // ─── Plan B: Secuencias de comandos ───

  @SubscribeMessage('listPlanSequences')
  async handleListPlanSequences(client: Socket): Promise<void> {
    const list = await this.fetchPlanSequences();
    client.emit('planSequences', list);
  }

  @SubscribeMessage('savePlanSequence')
  async handleSavePlanSequence(client: Socket, payload: { name: string; commands: { proto: number; hex: string; label: string }[]; delayMs: number }): Promise<void> {
    if (!databaseService.isConnected()) {
      client.emit('error', { message: 'MongoDB no conectado' });
      return;
    }
    const name = (payload?.name || '').trim();
    if (!name) { client.emit('error', { message: 'Nombre requerido' }); return; }
    const commands = (payload?.commands || []).map(c => ({
      proto: Number(c.proto) || 0,
      hex: (c.hex || '').replace(/\s+/g, '').toLowerCase(),
      label: (c.label || '').trim(),
    }));
    const delayMs = Math.max(100, Number(payload?.delayMs) || 500);
    try {
      await databaseService.PlanSequenceModel.updateOne(
        { name },
        { $set: { name, commands, delayMs } },
        { upsert: true }
      );
      const list = await this.fetchPlanSequences();
      this.server.emit('planSequences', list);
    } catch (e: any) {
      client.emit('error', { message: `Error guardando secuencia: ${e.message}` });
    }
  }

  @SubscribeMessage('deletePlanSequence')
  async handleDeletePlanSequence(client: Socket, payload: { name: string }): Promise<void> {
    if (!databaseService.isConnected()) {
      client.emit('error', { message: 'MongoDB no conectado' });
      return;
    }
    const name = (payload?.name || '').trim();
    if (!name) return;
    try {
      await databaseService.PlanSequenceModel.deleteOne({ name });
      const list = await this.fetchPlanSequences();
      this.server.emit('planSequences', list);
    } catch (e: any) {
      client.emit('error', { message: `Error borrando secuencia: ${e.message}` });
    }
  }

  @SubscribeMessage('executePlanSequence')
  async handleExecutePlanSequence(client: Socket, payload: { name: string; iggId?: number }): Promise<void> {
    if (!databaseService.isConnected()) {
      client.emit('error', { message: 'MongoDB no conectado' });
      return;
    }
    const doc = await databaseService.PlanSequenceModel.findOne({ name: payload.name }).lean() as any;
    if (!doc || !doc.commands?.length) {
      client.emit('error', { message: 'Secuencia vacía o no encontrada' });
      return;
    }

    const targets: any[] = [];
    if (payload.iggId) {
      const inst = this.accountManager.instances.get(payload.iggId);
      if (inst && inst.bot.isOnline) targets.push(inst);
    } else {
      for (const [, inst] of this.accountManager.instances) {
        if (inst.bot.isOnline) targets.push(inst);
      }
    }

    if (targets.length === 0) {
      client.emit('error', { message: 'Sin cuentas online' });
      return;
    }

    client.emit('planSequenceProgress', { name: payload.name, step: 0, total: doc.commands.length, status: 'Iniciando...' });

    for (let i = 0; i < doc.commands.length; i++) {
      const cmd = doc.commands[i];
      const body = Buffer.from((cmd.hex || '').replace(/\s+/g, ''), 'hex');
      for (const inst of targets) {
        inst.bot.sendCommandPacket(cmd.proto, body, true);
      }
      client.emit('planSequenceProgress', { name: payload.name, step: i + 1, total: doc.commands.length, status: `Paso ${i + 1}/${doc.commands.length}: proto ${cmd.proto}` });
      if (i < doc.commands.length - 1) {
        await new Promise(r => setTimeout(r, doc.delayMs));
      }
    }

    client.emit('planSequenceDone', { name: payload.name, total: doc.commands.length, accounts: targets.length });
  }

  private async notifyEventRewards(iggId: number, data: EventRewardData, body: Buffer): Promise<void> {
    const hex = body.toString('hex');
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const hourStart = new Date(utcMs);
    hourStart.setUTCMinutes(0, 0, 0);
    const timestamp = Math.floor(hourStart.getTime() / 1000);

    const eventType = data.eventType === 1 ? 'infierno' : 'solitario';
    const typeName = data.eventType === 1 ? 'Infierno' : 'Solitario';
    const color = data.eventType === 1 ? 0xff4444 : 0x44ff44;

    const missionLines = data.missionIds.map(id => `${getMissionName(id)} (0x${id.toString(16).padStart(4, '0')})`).join('\n');
    const totalGems = data.levels.reduce((sum, l) => sum + l.gemsEntrega, 0);
    const totalRewards = data.records.length;

    const [c1, c2, c3] = data.counts;
    const levelRecords = [
      data.records.slice(0, c1),
      data.records.slice(c1, c1 + c2),
      data.records.slice(c1 + c2),
    ];

    const fields = data.levels.map((l, i) => {
      const records = levelRecords[i];
      const gifts = records.map(r => `${getItemName(r.itemId)} x${r.amount}`).join('\n') || 'Sin recompensas';
      return {
        name: `Nivel ${i + 1} — ${l.sinValorar} sin valorar`,
        value: `Gemas: ${l.gemsEntrega}\n${gifts}`,
        inline: false,
      };
    });

    await this.discordNotifications.processEvent({
      hex,
      timestamp,
      type: eventType,
      missionIds: data.missionIds.map(id => `0x${id.toString(16).padStart(4, '0')}`),
      title: `Evento ${typeName}`,
      description: `${missionLines}\n${totalRewards} recompensas — ${totalGems} gemas`,
      color,
      fields,
    });
  }

  private async fetchPlanSequences(): Promise<any[]> {
    if (!databaseService.isConnected()) return [];
    try {
      const docs = await databaseService.PlanSequenceModel.find({}).sort({ name: 1 }).lean();
      return docs.map((d: any) => ({ name: d.name, commands: d.commands || [], delayMs: d.delayMs || 500 }));
    } catch {
      return [];
    }
  }

  // ─── Config global de proxy auth (bytes del auth packet, editables desde web/app) ───

  @SubscribeMessage('getProxyAuth')
  async handleGetProxyAuth(client: Socket): Promise<void> {
    const bytes = await loadProxyAuthBytes();
    client.emit('proxyAuthData', bytes);
  }

  @SubscribeMessage('saveProxyAuth')
  async handleSaveProxyAuth(client: Socket, payload: ProxyAuthBytes): Promise<void> {
    try {
      const saved = await saveProxyAuthBytes(payload || {});
      this.server.emit('proxyAuthData', saved);
      client.emit('proxyAuthSaved', saved);
    } catch (e: any) {
      client.emit('error', { message: `Error guardando proxy auth: ${e.message}` });
    }
  }

  @SubscribeMessage('openAllWarChests')
  handleOpenAllWarChests(client: Socket): void {
    const WAR_CHEST_ITEM = 3073;
    let found = 0;
    for (const [id, inst] of this.accountManager.instances) {
      if (!inst.bot.isOnline) continue;
      const count = inst.inventory.get(WAR_CHEST_ITEM) || 0;
      if (count <= 0) continue;
      inst.actions.pause();
      inst.openChest(WAR_CHEST_ITEM, count, (opened, total) => {
        client.emit('chestProgress', { iggId: id, opened, total, done: opened >= total });
      });
      inst.bot.enqueueCommand(async () => {
        inst.actions.resume();
        client.emit('chestProgress', { iggId: id, opened: count, total: count, done: true });
      });
      found++;
    }
    client.emit('chestBulkResult', { accounts: found });
  }

  @SubscribeMessage('sendWarTroops')
  handleSendWarTroops(client: Socket, payload: { iggId: number; warIndex: number; rallyLeader: string; tier: number; infantry: boolean; artillery: boolean; cavalry: boolean; infantryCount: number; artilleryCount: number; cavalryCount: number }): void {
    const instance = this.accountManager.instances.get(payload.iggId);
    if (!instance) return;

    const tier = payload.tier as TroopTier;
    const availInf = instance.troopState.getCount(TroopType.Infantry, tier);
    const availArt = instance.troopState.getCount(TroopType.Ranged, tier);
    const availCav = instance.troopState.getCount(TroopType.Cavalry, tier);

    if (payload.infantry && payload.infantryCount > availInf) {
      client.emit('warStatus', { iggId: payload.iggId, status: `❌ Infantería T${tier}: solo hay ${availInf}, pediste ${payload.infantryCount}` });
      return;
    }
    if (payload.artillery && payload.artilleryCount > availArt) {
      client.emit('warStatus', { iggId: payload.iggId, status: `❌ Artillería T${tier}: solo hay ${availArt}, pediste ${payload.artilleryCount}` });
      return;
    }
    if (payload.cavalry && payload.cavalryCount > availCav) {
      client.emit('warStatus', { iggId: payload.iggId, status: `❌ Caballería T${tier}: solo hay ${availCav}, pediste ${payload.cavalryCount}` });
      return;
    }

    const mask = calculateMask([{ tier: payload.tier, inf: payload.infantry, art: payload.artillery, cav: payload.cavalry }]);
    const quantities = [payload.infantryCount, payload.artilleryCount, payload.cavalryCount];

    instance.enqueueWarSend(payload.warIndex, payload.rallyLeader, mask, quantities, (status) => {
      client.emit('warStatus', { iggId: payload.iggId, status });
    });
  }

  @SubscribeMessage('saveConfig')
  async handleSaveConfig(client: Socket, payload: { iggId: number; config: any }): Promise<void> {
    stripLegacyConfig(payload.config);
    const instance = this.accountManager.instances.get(payload.iggId);
    if (!instance) {
      // Sin instancia corriendo: guardar offline (archivo + DB)
      const configPath = configService.getConfigPath(payload.iggId);
      let existing: any = {};
      try { existing = normalizeKeys(JSON.parse(fs.readFileSync(configPath, 'utf-8'))); } catch {}
      deepMerge(existing, payload.config);
      stripLegacyConfig(existing);
      try {
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), 'utf-8');
      } catch (e: any) {
        client.emit('error', { message: `Error guardando config: ${e.message}` });
        return;
      }
      if (databaseService.isConnected()) {
        try {
          await databaseService.ConfigModel.updateOne(
            { iggId: payload.iggId },
            { $set: flattenConfig(payload.config) },
            { upsert: true }
          );
        } catch {}
      }
      this.server.emit('configUpdated', { iggId: payload.iggId, config: existing });
      return;
    }
    deepMerge(instance.config, payload.config);
    instance.saveConfig(instance.config);
    if (databaseService.isConnected()) {
      try {
        await databaseService.ConfigModel.updateOne(
          { iggId: payload.iggId },
          { $set: flattenConfig(payload.config) },
          { upsert: true }
        );
      } catch {}
    }
    this.server.emit('configUpdated', { iggId: payload.iggId, config: instance.config });

    // Re-evaluar escudo si cambió warMode o shield.enable
    if (payload.config.warMode !== undefined || payload.config.shield?.enable !== undefined) {
      instance.retryShield();
    }

    // Notificar a la instancia de cambios de config para que reaccione
    instance.onConfigChanged();
  }

  @SubscribeMessage('getConfigOffline')
  async handleGetConfigOffline(client: Socket, payload: { iggId: number }): Promise<void> {
    const instance = this.accountManager.instances.get(payload.iggId);
    if (instance) {
      client.emit('configData', { iggId: payload.iggId, config: instance.config, online: true });
      return;
    }
    // Base con defaults para que nunca falten campos/secciones
    let config: any = defaultBotConfig('');
    // Capa 1: archivo config.json
    try {
      const configPath = configService.getConfigPath(payload.iggId);
      if (fs.existsSync(configPath)) {
        const fileCfg = normalizeKeys(JSON.parse(fs.readFileSync(configPath, 'utf-8')));
        if (fileCfg && typeof fileCfg === 'object' && Object.keys(fileCfg).length > 0) {
          deepMerge(config, fileCfg);
        }
      }
    } catch {}
    // Capa 2: MongoDB (tiene prioridad sobre el archivo, igual que en línea)
    if (databaseService.isConnected()) {
      try {
        const doc = await databaseService.ConfigModel.findOne({ iggId: payload.iggId }).lean();
        if (doc) {
          const { _id, __v, ...clean } = doc as any;
          if (typeof clean === 'object' && Object.keys(clean).length > 0) {
            deepMerge(config, clean);
          }
        }
      } catch {}
    }
    stripLegacyConfig(config);
    client.emit('configData', { iggId: payload.iggId, config, online: false });
  }

  // ─── Importar captura (frontend maneja mitm, solo guardamos en DB) ───

  @SubscribeMessage('importCapture')
  async handleImportCapture(_client: Socket, payload: { json: string }): Promise<void> {
    const pending = this.persistCapture(payload.json).finally(() => {
      if (this.pendingCapture === pending) this.pendingCapture = null;
    });
    this.pendingCapture = pending;
    return pending;
  }

  /**
   * Guarda la captura en Mongo y avisa a TODOS los clientes.
   *
   * El aviso va por `server.emit`, nunca por `client`: el socket que manda el
   * `importCapture` es el del watcher de vite, no el del navegador — si el
   * aviso sale por ese socket el frontend no se entera y la cuenta nueva no
   * aparece hasta recargar a mano.
   */
  private async persistCapture(json: string): Promise<void> {
    try {
      console.log('[CAPTURE] JSON recibido, length:', json.length);
      console.log('[CAPTURE] Primeros 500 chars:', json.substring(0, 500));

      const root = JSON.parse(json);
      const iggId = root?.data?.iggid;
      console.log('[CAPTURE] iggId extraído:', iggId);

      if (!iggId) { this.server.emit('captureError', 'JSON no contiene iggid válido'); return; }

      const proxy = root?.proxy || '';
      console.log('[CAPTURE] proxy extraído:', proxy || '(vacio)');

      // Guardar en MongoDB
      if (!databaseService.isConnected()) {
        this.server.emit('captureError', 'MongoDB no conectado');
        return;
      }

      const tokenData = root?.data?.access_token || root?.data?.accessKey || '';
      console.log('[CAPTURE] token extraído, length:', tokenData.length);

      const tokenResult = await databaseService.TokenModel.updateOne(
        { iggId: Number(iggId) },
        { $set: { iggId: Number(iggId), accessToken: tokenData, proxy } },
        { upsert: true }
      );
      console.log('[CAPTURE] TokenModel resultado:', JSON.stringify(tokenResult));

      // La config no debe cortar el aviso: el token ya quedó guardado
      try {
        await this.upsertConfigDefaults(Number(iggId), proxy);
        console.log('[CAPTURE] ConfigModel OK (defaults + proxy)');
      } catch (e: any) {
        console.error('[CAPTURE] ConfigModel error (token ya guardado):', e.message);
      }

      // Verificar lo guardado
      const savedToken = await databaseService.TokenModel.findOne({ iggId: Number(iggId) }).lean();
      console.log('[CAPTURE] Token en DB después de guardar:', JSON.stringify({ iggId: savedToken?.iggId, proxy: savedToken?.proxy, accessTokenLength: savedToken?.accessToken?.length }));

      // Avisar a todos los clientes (el navegador escucha en OTRO socket)
      this.server.emit('accountCaptured', { iggId: Number(iggId) });

      // Refrescar lista de cuentas en todos los clientes
      this.server.emit('accounts', await this.buildAccounts());
    } catch (err: any) {
      this.server.emit('captureError', `Error importando captura: ${err.message}`);
    }
  }
}

function deepMerge(target: any, source: any): void {
  for (const key of Object.keys(source)) {
    const val = source[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
        target[key] = {};
      }
      deepMerge(target[key], val);
    } else if (val !== undefined) {
      target[key] = val;
    }
  }
}

/** Convierte un objeto anidado en paths con puntos para $set de Mongo
 *  (ej: { train: { type: '03' } } → { 'train.type': '03' }).
 *  Evita que se reemplacen sub-documentos enteros al guardar configs parciales. */
function flattenConfig(obj: any, prefix = '', out: Record<string, any> = {}): Record<string, any> {
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    const path = prefix ? `${prefix}.${key}` : key;
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      flattenConfig(val, path, out);
    } else if (val !== undefined) {
      out[path] = val;
    }
  }
  return out;
}
