import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { BotEngine } from '../engine/bot-engine';
import { configService, normalizeKeys } from '../../config/config.service';
import { BotConfig, defaultBotConfig, getLuckyCardsConfig } from '../../models/bot-config';
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
import { requestMapData as sendMapData, refreshMapCoord, buildScanWindows } from '../commands/map.commands';
import { queryTileInfo, startLuckyCardSearch, exchangeLuckyCards } from '../commands/lucky-card.commands';
import { LuckyCardInfo, LuckyExchangeResult, LuckySearchResult, TileInfoResult } from '../models/lucky-card.types';
import { decodeCoordBytes, encodeCoordId } from '../../models/map-coords';
import { getPlayerLocation as getPlayerLocationCmd } from '../commands/player.commands';
import { selectAction11, selectWarIndex, sendTroops, send2476 } from '../commands/war.commands';
import { requestRivals, attackRival, claimColiseumGems } from '../commands/coliseum.commands';
import { huntMonster } from '../commands/hunt.commands';
import { getHuntLevel, getHuntPayloadHex, getHuntSquad } from '../../models/bot-config';
import { getMonster, getMonsterDebilidad, isMonsterChest, monsterName } from '../data/monsters';
import { huntCoordinator, SquadPolicy } from '../models/hunt-coordinator';
import { HuntTarget, HuntStatus } from '../models/hunt.types';
import { matchHpScale, toHpPercent, MonsterHitUpdate } from '../models/monster-hit.types';

export type { WarParticipant };

const ITEMS_DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'items.json'), 'utf-8'));

/** 2453 sin datos seguidos antes de abortar el lote de supply */
const MAX_CONSECUTIVE_SEND_FAILS = 3;

/**
 * Capacidad máxima de recursos por caravana (proto 2452).
 * Si la cantidad enviada supera este tope el servidor responde 2453 <17B con
 * code `0x07` = "capacidad de suministros excedida": no sale ninguna caravana.
 * Ver `docs/protocols/2453.md`.
 */
export const SUPPLY_CARAVAN_LIMIT = 1_000_000;

/** ms entre ventanas (2201) del escaneo del mapa para Caza */
const MAP_SCAN_INTERVAL_MS = 3500;
  /** ms mínimos entre escaneos consecutivos del mapa */
  const MAP_SCAN_REPEAT_MS = 60_000;
  /** ms mínimos entre avisos "sin energía" al chat de gremio */
  const NO_ENERGY_CHAT_COOLDOWN_MS = 5 * 60_000;

  /**
   * Salvaguarda de una búsqueda de carta (9866) si no llega ni el ack 9867 ni
   * la marcha de vuelta: el slot se libera igual para no bloquear el bucle.
   */
  const LUCKY_SEARCH_FALLBACK_MS = 60_000;
  /** margen sobre ida+vuelta (2×duración del ack) antes de permitir otra */
  const LUCKY_SEARCH_MARGIN_MS = 3_000;
  /** espera entre reintentos de un cofre sin respuesta / rechazado */
  const LUCKY_CHEST_BACKOFF_MS = 60_000;
  /** cofres a consultar como máximo en UN paso (se saltan los que ya están) */
  const LUCKY_TILE_TRIES_PER_STEP = 3;
  /** backoff de un tile que respondió sin flag de reclamo (no sirve como cofre) */
  const LUCKY_NO_FLAG_BACKOFF_MS = 10 * 60_000;
  /** salvaguarda del 9864 (canje) si no llega el 9865 */
  const LUCKY_EXCHANGE_TIMEOUT_MS = 15_000;
  /** espera entre intentos de canje */
  const LUCKY_EXCHANGE_RETRY_MS = 60_000;
  /** intentos de canje por evento antes de avisar y frenar */
  const LUCKY_EXCHANGE_MAX_ATTEMPTS = 3;
  /** dígitos necesarios del mismo valor (tres 9 = 999) para canjear */
  const LUCKY_EXCHANGE_MIN_NINES = 3;
  /** la mano sólo admite 10 cartas: las de mayor dígito (ver 9862.md) */
  const LUCKY_HAND_SIZE = 10;

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
  /** Caza activa (proto 2488); null cuando no hay objetivo en curso */
  huntTarget: HuntTarget | null = null;
  private huntRunning = false;
  /** Último reino (K) observado en un push 2220 (monster hit) */
  private lastKingdom = 0;
  /** Date.now() del último aviso "sin energía" al gremio */
  private lastNoEnergyChatAt = 0;
  /** escaneo del mapa (2201 ventana por ventana) para hallar bichos */
  private mapScanRunning = false;
  private mapScanStartAt = 0;
  /** Carta de la Suerte: cofres ya consultados/reclamados en esta sesión */
  claimedChests = new Set<number>();
  /** Cartas obtenidas por dígito (0-9) en esta sesión */
  luckyCards: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  /** inicio (ms) del ciclo de cartas actual y búsquedas enviadas en él */
  private luckyCycleAt = 0;
  private luckyCycleSent = 0;
  /** instante (ms) mínimo para el próximo 9866: ida+vuelta de la tropa */
  private luckySearchBusyUntil = 0;
  private luckySearchTarget: { x: number; y: number } | null = null;
  private luckySearchTileId = 0;
  private lastLuckyCardAt = 0;
  /** tileId → instante (ms) en que vuelve a intentarse (rechazo/sin respuesta) */
  private luckyChestBackoff = new Map<number, number>();
  /** u32 ts del evento actual (byte 0..3 del 9861); 0 mientras no llega */
  private luckyEventTs = 0;
  /** duración del evento en segundos (byte 8..11 del 9861; 172740 ≈ 2 días) */
  private luckyEventDuration = 0;
  /** clave única del evento = `${eventTs}_${duration}` ('' hasta el primer 9861) */
  private luckyEventKey = '';
  /** la DB dice que este evento ya fue canjeado → sin buscar ni canjear */
  private luckyExchangeReclaimed = false;
  /** true cuando terminó la consulta a la DB del `luckyEventKey` vigente */
  private luckyExchangeHydrated = false;
  /** eventKey por el que se mandó el 9864 (contexto para aceptar el 9865) */
  private luckyExchangeEventKey = '';
  /** cache eventKey → ya canjeado: una sola consulta a la DB por evento */
  private luckyExchangeCache = new Map<string, boolean>();
  /** true mientras espera el 9865 tras haber mandado un 9864 */
  private luckyExchangePending = false;
  private luckyExchangeSentAt = 0;
  /** valor (número) enviado en el último 9864, para contrastar el 9865 */
  private luckyExchangeSentValue = 0;
  private luckyExchangeAttempts = 0;
  private luckyExchangeRetryAt = 0;
  private luckyExchangeWarned = false;
  private pendingTileInfo: {
    x: number;
    y: number;
    timer: NodeJS.Timeout;
    resolve: (v: TileInfoResult | null) => void;
  } | null = null;
  /** ventanas 2201 pendientes por recorrer cuando no hay cofres a la vista */
  private luckyScanWindows: { x: number; y: number }[] = [];
  private luckyScanIdx = 0;
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
  /** usuario pidió parar el lote actual */
  supplyStopRequested = false;
  /** el lote manual se cortó por petición del usuario (se lee en manualSupply) */
  supplyStoppedByUser = false;
  /** despierta las esperas del lote cuando el usuario pide parar */
  supplyStopWakeup: (() => void) | null = null;
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
  // Timers creados en cada connect(): se limpian al reconectar/desconectar para
  // que no se acumulen (doble login → reconexión → intervals duplicados)
  private atalayaTimer?: NodeJS.Timeout;
  private eventsTimer?: NodeJS.Timeout;
  private eventSchedulerStarted = false;

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
        this.clearCoreTimers();
        this.stopHunt('Conexión perdida — caza cancelada');
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

  private clearCoreTimers(): void {
    if (this.atalayaTimer) { clearInterval(this.atalayaTimer); this.atalayaTimer = undefined; }
    if (this.eventsTimer) { clearInterval(this.eventsTimer); this.eventsTimer = undefined; }
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
    // Carta de la Suerte: nada pendiente debe sobrevivir a una reconexión
    this.luckySearchBusyUntil = 0;
    this.luckySearchTarget = null;
    this.luckySearchTileId = 0;
    if (this.pendingTileInfo) {
      clearTimeout(this.pendingTileInfo.timer);
      const resolve = this.pendingTileInfo.resolve;
      this.pendingTileInfo = null;
      resolve(null);
    }
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

    this.clearCoreTimers(); // por si quedó alguno de una conexión anterior
    this.atalayaTimer = setInterval(() => {
      try {
        checkExpiredMarchesImpl(this).catch((e: any) => this.bot.log(`[ATALAYA] error checkExpiredMarches: ${e?.message || e}`));
      } catch (e: any) { this.bot.log(`[ATALAYA] error checkExpiredMarches: ${e?.message || e}`); }
    }, 1000);

    loadMarchHistoryDb(this).catch(() => {});
    this.loadEvents(true).catch(() => {});
    this.eventsTimer = setInterval(() => this.loadEvents().catch(() => {}), 60000);
    if (!this.eventSchedulerStarted) {
      this.eventSchedulerStarted = true;
      startEventRewardScheduler(this).catch(e => this.bot.log(`[EVENT-REWARDS] Error scheduler: ${e?.message || e}`));
    }

    this.bot.log('[+] Conectado y en línea');
    return true;
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    this.clearCoreTimers();
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

  // ── Caza de monstruos (2488) ──

  getCurrentEnergy(): number {
    return this.playerInfo?.energy ?? 0;
  }

  consumeEnergy(amount: number): void {
    if (!this.playerInfo) return;
    this.playerInfo.energy = Math.max(0, this.playerInfo.energy - amount);
    this.bot.log(`[ENERG] -${amount} → ${this.playerInfo.energy}`);
    this.emit('playerInfoUpdated');
  }

  isHunting(): boolean {
    return this.huntTarget?.status === 'hunting';
  }

  emitHuntUpdate(): void {
    this.emit('huntUpdated');
  }

  /**
   * 2220 variante "monster hit" (golpe de caza): actualiza el HP del tile en
   * mapTiles y, si es el objetivo, el estado de caza + cuándo vuelve la marcha.
   */
  onMonsterHit(hit: MonsterHitUpdate): void {
    if (hit.kingdom >= 100) this.lastKingdom = hit.kingdom;
    const tileId = encodeCoordId(hit.monster.x, hit.monster.y);
    const tile = this.mapTiles.get(tileId);
    const hpBefore = tile?.monster ? toHpPercent(tile.monster.hp) : hit.hp;
    if (tile?.monster) {
      const scaled = matchHpScale(tile.monster.hp, hit.hp);
      if (tile.monster.hp !== scaled) {
        tile.monster.hp = scaled;
        this.emit('mapDataUpdated');
      }
    }
    // HP del squad compartido + daño observado (todos los bots lo ven)
    huntCoordinator.reportHit(this.iggId, tileId, hpBefore, tile?.monster ? toHpPercent(tile.monster.hp) : hit.hp);

    const t = this.huntTarget;
    const isTarget = !!t && t.x === hit.monster.x && t.y === hit.monster.y;
    const hpPercent = tile?.monster ? toHpPercent(tile.monster.hp) : hit.hp;
    this.bot.log(
      `[CAZA] HP ${hpPercent.toFixed(1)}% en (${hit.monster.x},${hit.monster.y}) ` +
      `de ${hit.name}${hit.guild ? ` [${hit.guild}]` : ''} · vuelta ${hit.returnSeconds}s` +
      (isTarget ? '' : ' (no es el objetivo)'),
    );

    if (t && isTarget) {
      if (tile?.monster) t.hp = tile.monster.hp;
      t.hitsLanded++;
      t.lastHitAt = Date.now();
      t.returnAt = hit.returnSeconds > 0 ? Math.floor(Date.now() / 1000) + hit.returnSeconds : 0;
      this.emitHuntUpdate();
    }
    // Solo despierta al bucle si el golpe es del objetivo (o no hay caza activa)
    if (isTarget || !t || t.status !== 'hunting') this.emit('huntHitLanded');
    if (t && isTarget && hit.hp <= 0) this.finishHunt('killed', 'Bicho muerto (confirmado por servidor)');
  }

  /**
   * Marcha detectada en el mapa: si va hacia el objetivo de caza, registra la
   * hora de salida y la duración de la ida (la vuelta llega en onMonsterHit).
   */
  onHuntMarch(march: MapMarch): void {
    const t = this.huntTarget;
    if (!t || t.status !== 'hunting') return;
    if (march.destination.x !== t.x || march.destination.y !== t.y) return;
    if (march.origin.x !== (this.playerInfo?.castleX ?? -1) || march.origin.y !== (this.playerInfo?.castleY ?? -1)) return;
    t.departedAt = march.startTime;
    t.outboundSeconds = march.duration;
    this.bot.log(
      `[CAZA] Ida → (${t.x},${t.y}) en ${march.duration}s (sale ${new Date(march.startTime * 1000).toLocaleTimeString()})`,
    );
    this.emitHuntUpdate();
  }

  /**
   * El servidor rechazó el 2488 (`2489 ← 01`): el bicho ya no existe en el
   * mapa (alguien lo mató). El tile sigue con el HP viejo en mapTiles porque
   * el 2201 de refresh solo devuelve el eco de las celdas, nunca reenvía tiles
   * ya entregados, así que hay que marcarlo acá para que el bucle no siga
   * gastando energía y el squad se libere.
   */
  onHuntAttackRejected(): void {
    const t = this.huntTarget;
    if (!t || t.status !== 'hunting') return;
    // ack viejo: si el objetivo ya cambió, este rechazo no es de este tile
    if (Date.now() - t.lastHitAt > 15_000) return;
    this.bot.log(`[CAZA] Golpe rechazado (2489 ← 01) — el bicho de (${t.x},${t.y}) ya no existe`);
    if (this.mapTiles.delete(t.tileId)) this.emit('mapDataUpdated');
    // HP 0 compartido: el resto del squad sale como "bicho muerto"
    huntCoordinator.updateHp(t.tileId, 0, '2220');
    this.finishHunt('gone', 'Bicho ya no existe (servidor rechazó el golpe)');
  }

  /** Espera (máx timeoutMs) a que llegue el 2220 con el HP del golpe. */
  waitForHuntHit(timeoutMs: number): Promise<boolean> {
    return new Promise(resolve => {
      let done = false;
      let timer: ReturnType<typeof setTimeout>;
      const cleanup = () => {
        clearTimeout(timer);
        this.removeListener('huntHitLanded', onHit);
        this.removeListener('huntUpdated', onUpdate);
      };
      const finish = (landed: boolean) => {
        if (done) return;
        done = true;
        cleanup();
        resolve(landed);
      };
      const onHit = () => finish(true);
      // Si la caza se detiene a mitad de la espera, no colgar hasta el timeout
      const onUpdate = () => {
        if (!this.huntTarget || this.huntTarget.status !== 'hunting') finish(false);
      };
      timer = setTimeout(() => finish(false), timeoutMs);
      this.on('huntHitLanded', onHit);
      this.on('huntUpdated', onUpdate);
    });
  }

  /** Política de squad (config.hunt.squad) tolerando configs viejas. */
  private huntPolicy(): SquadPolicy {
    return getHuntSquad(this.config.hunt);
  }

  /**
   * Monstruos cazables ordenados por PS: **menor HP primero** (matarlo sale
   * más barato), y a igual HP el más cerca del castillo.
   *
   * Se entra al squad del de menor HP siempre que haya lugar (o al bicho
   * directo si nadie lo está cazando); si el squad ya cubre todos los golpes
   * que faltan, ese tile queda fuera y sigue el siguiente de la lista.
   */
  listHuntCandidates(): ParsedMapTile[] {
    const cx = this.playerInfo?.castleX ?? 0;
    const cy = this.playerInfo?.castleY ?? 0;
    const policy = this.huntPolicy();
    const out: { tile: ParsedMapTile; hp: number }[] = [];
    for (const t of this.mapTiles.values()) {
      if (!t.monster || t.monster.hp <= 0) continue;
      if (isMonsterChest(t.monster.id)) continue; // cofres de evento: no son monstruos
      if (!getHuntLevel(this.config.hunt, t.monster.level)) continue;
      const tileHp = toHpPercent(t.monster.hp);
      const sq = huntCoordinator.peek(t.id);
      if (sq && sq.hp <= 0) continue; // el squad ya sabe que ese bicho murió
      if (sq && !huntCoordinator.hasRoom(t.id, policy)) continue; // squad completo: no nos sumamos
      // HP = lo más fresco de lo que sabemos (solo baja: el mínimo es el más nuevo)
      out.push({ tile: t, hp: sq ? Math.min(sq.hp, tileHp) : tileHp });
    }
    out.sort(
      (a, b) =>
        a.hp - b.hp ||
        this.calculateDistance(a.tile.x, a.tile.y, cx, cy) -
          this.calculateDistance(b.tile.x, b.tile.y, cx, cy),
    );
    return out.map(o => o.tile);
  }

  /**
   * Arranca la caza de un tile (o del mejor candidato si no se pasa tileId).
   * El bucle sigue hasta matar al bicho, que desaparezca o que se acabe la energía.
   */
  startHunt(tileId?: number): { ok: boolean; message: string } {
    if (!this.bot.isOnline) return { ok: false, message: 'Bot no conectado' };
    if (this.huntRunning) return { ok: false, message: 'Ya hay una caza en curso' };

    let tile: ParsedMapTile | undefined;
    if (tileId !== undefined) {
      tile = this.mapTiles.get(tileId);
      if (!tile || !tile.monster) return { ok: false, message: 'Tile sin monstruo' };
      if (tile.monster.hp <= 0) return { ok: false, message: 'El monstruo ya está muerto' };
      if (isMonsterChest(tile.monster.id)) return { ok: false, message: 'Ese tile es un cofre, no un monstruo' };
      if (!getHuntLevel(this.config.hunt, tile.monster.level)) {
        return { ok: false, message: `Nivel ${tile.monster.level} no configurado en Caza` };
      }
    } else {
      const cands = this.listHuntCandidates();
      if (cands.length === 0) return { ok: false, message: 'Sin bichos cazables en el mapa' };
      tile = cands[0];
    }

    const claim = huntCoordinator.claim(
      this.iggId,
      { id: tile.id, x: tile.x, y: tile.y, level: tile.monster!.level, hp: toHpPercent(tile.monster!.hp) },
      this.huntPolicy(),
    );
    if (!claim.ok) return { ok: false, message: claim.message || 'Tile ya ocupado por otro bot' };

    this.huntTarget = {
      tileId: tile.id,
      x: tile.x,
      y: tile.y,
      level: tile.monster!.level,
      hp: tile.monster!.hp,
      hits: 0,
      energySpent: 0,
      status: 'hunting',
      startedAt: Date.now(),
      lastHitAt: 0,
      hitsLanded: 0,
      departedAt: 0,
      outboundSeconds: 0,
      returnAt: 0,
    };
    this.emitHuntUpdate();
    const info = getMonster(tile.monster!.id);
    const debilidad = info?.debilidad;
    this.bot.log(
      `[CAZA] Objetivo: ${monsterName(tile.monster!.id)} nivel ${tile.monster!.level} en (${tile.x},${tile.y}) ` +
      `HP=${toHpPercent(tile.monster!.hp).toFixed(1)}% · ` +
      `${debilidad ? `débil contra ${debilidad}` : 'debilidad desconocida'} · energía ${this.getCurrentEnergy()}`,
    );
    // Abrir la ventana del mapa: el 2220 con el HP solo llega mientras la región está cargada
    this.requestMapData(tile.x, tile.y);
    void this.runHuntLoop();
    return { ok: true, message: `Cazando nivel ${tile.monster!.level} en (${tile.x},${tile.y})` };
  }

  stopHunt(reason = 'Detenido por el usuario'): void {
    if (!this.huntTarget) return;
    if (this.huntTarget.status !== 'hunting') return;
    this.huntTarget.status = 'stopped';
    this.bot.log(`[CAZA] ${reason}`);
    this.emitHuntUpdate();
  }

  private finishHunt(status: HuntStatus, reason: string): void {
    if (!this.huntTarget) return;
    this.huntTarget.status = status;
    this.bot.log(
      `[CAZA] ${reason} — ${this.huntTarget.hits} golpe(s), -${this.huntTarget.energySpent} energía, ` +
      `quedan ${this.getCurrentEnergy()}`,
    );
    this.emitHuntUpdate();
    if (status === 'no-energy') this.announceNoEnergy();
  }

  /** Reino (K) del bicho: tile del castillo propio → visto en 2220 → gremio. */
  private currentKingdom(): number {
    const cx = this.playerInfo?.castleX;
    const cy = this.playerInfo?.castleY;
    if (cx !== undefined && cy !== undefined) {
      const tile = this.mapTiles.get(encodeCoordId(cx, cy));
      if (tile?.castle?.kingdom) return tile.castle.kingdom;
    }
    if (this.lastKingdom >= 100) return this.lastKingdom;
    return this.guildInfo?.kingdomId ?? 0;
  }

  /**
   * Se acabó la energía a mitad de caza: avisa en el chat de gremio con el bicho
   * que queda a medias para que otro lo remate:
   *   `Nv.2 Buen Apetito K: 1231 X:218 Y:582 87%`
   */
  private announceNoEnergy(): void {
    const t = this.huntTarget;
    if (!t || t.hp <= 0) return;
    const now = Date.now();
    if (now - this.lastNoEnergyChatAt < NO_ENERGY_CHAT_COOLDOWN_MS) {
      this.bot.log('[CHAT] Aviso "sin energía" omitido (ya se avisó hace poco)');
      return;
    }
    const monster = this.mapTiles.get(t.tileId)?.monster;
    const name = monster ? monsterName(monster.id) : `monstruo ${t.level}`;
    const kingdom = this.currentKingdom();
    const hp = toHpPercent(t.hp).toFixed(0);
    const text =
      `Nv.${t.level} ${name}` +
      (kingdom ? ` K:${kingdom}` : '') +
      ` X:${t.x} Y:${t.y} ${hp}%`;
    this.lastNoEnergyChatAt = now;
    this.bot.sendChat(text);
    this.bot.log(`[CHAT] Aviso gremio: ${text}`);
  }

  /**
   * Bucle de caza: un golpe (2488) por vuelta, con el cooldown de config.hunt.cooldown.
   * Cada vuelta relee el tile en mapTiles: si el HP llegó a 0 o el tile se borró, termina.
   */
  private async runHuntLoop(): Promise<void> {
    this.huntRunning = true;
    try {
      while (this.bot.isOnline && this.huntTarget && this.huntTarget.status === 'hunting') {
        const t = this.huntTarget;
        const tile = this.mapTiles.get(t.tileId);

        if (!tile || !tile.monster) {
          this.finishHunt('gone', 'El bicho desapareció del mapa');
          break;
        }
        t.level = tile.monster.level;
        t.hp = tile.monster.hp;
        // HP leído en el 2201 → el squad compartido de todos los bots lo ve
        huntCoordinator.updateHp(t.tileId, toHpPercent(tile.monster.hp), '2201');
        if (tile.monster.hp <= 0) {
          this.finishHunt('killed', 'Bicho muerto');
          break;
        }

        const cfg = getHuntLevel(this.config.hunt, t.level);
        if (!cfg) {
          this.finishHunt('no-target', `Sin config de caza para nivel ${t.level}`);
          break;
        }
        const energy = this.getCurrentEnergy();
        if (energy < cfg.energyCost) {
          this.finishHunt('no-energy', `Energía insuficiente (${energy}/${cfg.energyCost})`);
          break;
        }

        // ¿Hace falta mi golpe? needed = ceil(HP restante / daño medio).
        // Si otros ya cubren los golpes que faltan → me libero y voy a otro bicho.
        const squad = huntCoordinator.peek(t.tileId);
        if (!squad || !squad.members.has(this.iggId)) {
          // squad borrado (miembro pruneado) u ocupado por otro bot: reclamar o salir
          const re = huntCoordinator.claim(
            this.iggId,
            { id: t.tileId, x: t.x, y: t.y, level: t.level, hp: toHpPercent(t.hp) },
            this.huntPolicy(),
          );
          if (!re.ok) {
            this.finishHunt('stopped', re.message || 'Otro bot tomó ese bicho');
            break;
          }
        }
        const gate = huntCoordinator.canHit(this.iggId, t.tileId, this.huntPolicy());
        if (!gate.ok) {
          if (gate.reason === 'dead') {
            this.finishHunt('killed', 'Bicho muerto (HP compartido del squad)');
          } else {
            this.finishHunt(
              'stopped',
              `Sobra en el squad: HP ${gate.hp.toFixed(0)}% · ${gate.active} bot(s) cubren ${gate.needed} golpe(s) — va a por otro bicho`,
            );
          }
          break;
        }
        if (gate.needed > 1 || gate.active > 0) {
          this.bot.log(
            `[SQUAD] (${t.x},${t.y}) HP ${gate.hp.toFixed(0)}% · daño medio ${gate.avgDamage.toFixed(1)}% · ` +
            `faltan ${gate.needed} golpe(s) · ${gate.active} en vuelo`,
          );
        }

        const cooldownMs = Math.max(1, this.config.hunt.cooldown || 8) * 1000;
        // Espera el 2220 con el HP nuevo: ida (conocida por la marcha anterior) + impacto.
        // Si no llega, fallback al cooldown.
        const outboundMs = t.outboundSeconds > 0 ? (t.outboundSeconds + 5) * 1000 : 20_000;
        const hitTimeoutMs = Math.min(Math.max(cooldownMs, outboundMs), 60_000);
        // Ocupado: golpe en vuelta + espera (los demás no se suben mientras tanto)
        huntCoordinator.markBusy(this.iggId, t.tileId, Date.now() + hitTimeoutMs + cooldownMs);

        const payload = getHuntPayloadHex(cfg, getMonsterDebilidad(tile.monster.id));
        if (!payload) {
          this.finishHunt('no-target', `Sin hex de ataque para nivel ${t.level} (magia/físico)`);
          break;
        }
        if (!huntMonster(this.bot, t.x, t.y, payload)) {
          this.finishHunt('stopped', 'Fallo al enviar el 2488');
          break;
        }
        this.consumeEnergy(cfg.energyCost);
        t.hits++;
        t.energySpent += cfg.energyCost;
        t.lastHitAt = Date.now();
        this.emitHuntUpdate();
        this.bot.log(
          `[CAZA] Golpe ${t.hits} → nivel ${t.level} en (${t.x},${t.y}) · HP=${toHpPercent(t.hp).toFixed(1)}% · ` +
          `energía ${this.getCurrentEnergy()}`,
        );

        const landed = await this.waitForHuntHit(hitTimeoutMs);
        if (!landed && this.huntTarget?.status === 'hunting') {
          this.bot.log(
            `[CAZA] Sin 2220 de HP tras ${(hitTimeoutMs / 1000).toFixed(0)}s — sigo en UI map, espero el próximo update`,
          );
        }
        if (!this.huntTarget || this.huntTarget.status !== 'hunting') break;
        if (!this.bot.isOnline) break;

        // No volver a golpear hasta que la marcha regrese (vuelta informada en el 2220)
        const now = Math.floor(Date.now() / 1000);
        const waitUntil = Math.max(now + Math.ceil(cooldownMs / 1000), this.huntTarget.returnAt);
        // El squad ve la espera real (ida + vuelta), no el fallback
        huntCoordinator.markBusy(this.iggId, t.tileId, Math.max(Date.now(), waitUntil * 1000));
        await this.sleep(Math.min(Math.max((waitUntil - now) * 1000 + (landed ? 500 : 0), 1000), 120_000));
        if (!this.huntTarget || this.huntTarget.status !== 'hunting') break;
        if (!this.bot.isOnline) break;
        // El mapa ya se cargó con el 2201 de startHunt: la UI map queda abierta
        // y los updates (HP, muerte) llegan solos por 2220. No se re-pide.
      }
    } finally {
      this.huntRunning = false;
      huntCoordinator.release(this.iggId);
    }
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

  isMapScanning(): boolean {
    return this.mapScanRunning;
  }

  /**
   * Escanea el mapa alrededor del castillo para localizar monstruos (Caza):
   * pide ventana por ventana (2201) hasta cubrir config.hunt.scanRadius tiles.
   * Se corta si aparece un bicho cazable, arranca una caza o se desconecta.
   * Devuelve false si ya hay un escaneo en curso o si el último arrancó hace poco.
   */
  startMapScan(): boolean {
    if (this.mapScanRunning || this.huntRunning) return false;
    if (!this.bot.isOnline) return false;
    const cx = this.playerInfo?.castleX;
    const cy = this.playerInfo?.castleY;
    if (cx === undefined || cy === undefined) return false;
    const now = Date.now();
    if (this.mapScanStartAt > 0 && now - this.mapScanStartAt < MAP_SCAN_REPEAT_MS) return false;
    const radius = Math.max(0, this.config.hunt.scanRadius ?? 50);
    const windows = buildScanWindows(cx, cy, radius);
    if (windows.length === 0) return false;
    this.mapScanStartAt = now;
    void this.runMapScan(windows, radius);
    return true;
  }

  private async runMapScan(windows: { x: number; y: number }[], radius: number): Promise<void> {
    this.mapScanRunning = true;
    try {
      this.bot.log(`[CAZA] Escaneando mapa: ${windows.length} ventana(s), radio ${radius}`);
      for (const w of windows) {
        if (!this.bot.isOnline || this.huntRunning) {
          this.bot.log('[CAZA] Escaneo interrumpido');
          break;
        }
        if (this.listHuntCandidates().length > 0) {
          break;
        }
        this.requestMapData(w.x, w.y);
        await this.sleep(MAP_SCAN_INTERVAL_MS);
      }
      this.bot.log(`[CAZA] Escaneo terminado: ${this.listHuntCandidates().length} bicho(s) cazable(s) en el mapa`);
    } finally {
      this.mapScanRunning = false;
      this.mapScanStartAt = Date.now();
    }
  }

  requestMapData(x?: number, y?: number): void {
    const cx = x ?? this.playerInfo?.castleX ?? 0;
    const cy = y ?? this.playerInfo?.castleY ?? 0;
    sendMapData(this.bot, cx, cy);
    this.bot.log(`[MAPA] Solicitando tiles alrededor de (${cx}, ${cy})...`);
  }

  // ── Carta de la Suerte (cofres de especie 217 en el mapa) ─────────────
  //
  // Los envíos (2202/9866) salen SOLO desde runLuckyCardStep(), que ejecuta
  // LuckyCardAction dentro del bucle principal de ActionRunner. Nada externo
  // al bucle manda comandos: acá vive el estado y la lógica de cada paso.

  /**
   * Un paso del ciclo de cartas (lo llama el bucle principal):
   *  - si todavía no llegó el 9861 o la DB no confirmó el estado del canje:
   *    no hace nada (no se busca cofre a ciegas);
   *  - si ya hay 3 nueves en mano: canjea con 9864 y deja de buscar cofres;
   *  - si la DB dice que el evento actual ya fue canjeado: no hace nada;
   *  - consulta cofres con 2202 de a UNO por el más cercano (hasta
   *    `LUCKY_TILE_TRIES_PER_STEP` por paso): el que conteste "reclamado" o
   *    "sin flag" se cachea y se pasa al siguiente; con `NOT` manda la tropa
   *    (9866);
   *  - mientras la tropa no vuelve (ida+vuelta = 2×duración del 9867) no hace
   *    nada, así que sólo hay UNA búsqueda por cuenta;
   *  - devuelve true si llamó al juego (el runner apaga su cooldown).
   */
  async runLuckyCardStep(): Promise<boolean> {
    const cfg = getLuckyCardsConfig(this.config);
    const now = Date.now();
    if (!cfg.enable || !this.bot.isOnline) return false;

    // Sin 9861 no hay evento definido y sin la consulta a la DB no se sabe si
    // ya se canjeó: mientras tanto no se busca ni se reclama ningún cofre.
    if (!this.luckyEventKey || !this.luckyExchangeHydrated) return false;

    // Tropa fuera: si ya venció la vuelta se libera el slot. Mientras esté
    // fuera no se consulta ningún cofre, salvo en modo canje (que no usa slot).
    const exchanging = this.isLuckyExchanged() || this.luckyHasExchangeDigits();
    if (this.luckySearchTarget) {
      if (now < this.luckySearchBusyUntil) {
        if (!exchanging) return false;
      } else {
        this.releaseLuckySearch(false);
      }
    }

    // Evento vencido (inicio + duración del 9861): ya no se busca ni se canjea.
    if (this.luckyEventDuration > 0 && now / 1000 > this.luckyEventTs + this.luckyEventDuration) {
      return false;
    }

    // Evento marcado como canjeado en la DB: el bot ya no busca ni reclama.
    if (this.isLuckyExchanged()) return false;

    // Tres 9 en la mano: se canjea (9864) en vez de buscar más cofres.
    if (this.luckyHasExchangeDigits()) return this.runLuckyExchangeStep(now);

    const newCycle = this.luckyCycleAt === 0 || now - this.luckyCycleAt >= cfg.intervalSec * 1000;
    if (newCycle) {
      this.luckyCycleAt = now;
      this.luckyCycleSent = 0;
    }
    if (this.luckyCycleSent >= cfg.maxPerCycle) return false;

    const cx = this.playerInfo?.castleX ?? 0;
    const cy = this.playerInfo?.castleY ?? 0;
    const chests = this.findLuckyChests(cx, cy, now, LUCKY_TILE_TRIES_PER_STEP);
    if (chests.length === 0) {
      // Sin cofres a la vista: una ventana 2201 por ciclo (no spamear 2201)
      if (newCycle) this.refreshLuckyScan(cx, cy);
      return false;
    }

    // Se recorren candidatos de a uno (el 2202 comparte el cooldown de 1 s):
    // el que contesta "reclamado" o "sin flag" se CACHEA y se pasa al
    // siguiente sin cancelar el paso; sólo un cofre reclamable manda el 9866.
    let consulto = false;
    for (const chest of chests) {
      const info = await this.requestTileInfo(chest.x, chest.y);
      consulto = true;
      if (!this.bot.isOnline) return true;
      if (!info) {
        this.bot.log(`[CARTA] (${chest.x},${chest.y}) sin respuesta 2202`);
        this.luckyChestBackoff.set(chest.id, Date.now() + LUCKY_CHEST_BACKOFF_MS);
        continue;
      }
      if (info.claimed === true) {
        this.claimedChests.add(chest.id);
        this.bot.log(`[CARTA] (${chest.x},${chest.y}) ya reclamado por esta cuenta — cacheado, sigue con otro`);
        continue;
      }
      if (info.claimed === null) {
        this.bot.log(
          `[CARTA] (${chest.x},${chest.y}) sin flag de reclamo (serial ${info.serial}) — cacheado ${LUCKY_NO_FLAG_BACKOFF_MS / 60000} min, sigue con otro`,
        );
        this.luckyChestBackoff.set(chest.id, Date.now() + LUCKY_NO_FLAG_BACKOFF_MS);
        continue;
      }

      await this.sendLuckySearch(chest.x, chest.y, chest.id);
      this.luckyCycleSent++;
      return true;
    }
    return consulto;
  }

  /** true si ya hay al menos tres nueves entre las cartas: hora de canjear. */
  private luckyHasExchangeDigits(): boolean {
    return (this.luckyCards[9] ?? 0) >= LUCKY_EXCHANGE_MIN_NINES;
  }

  /**
   * El evento actual (`luckyEventKey`) ya quedó canjeado. Lo decide la DB
   * (`LuckyExchangeClaim.reclaimed`), hidratada con cada 9861: `config.
   * luckyCards.exchangedTs` es legacy y ya no se lee.
   */
  private isLuckyExchanged(): boolean {
    return this.luckyExchangeReclaimed;
  }

  /**
   * Número a canjear (u32 del 9864): los tres slots libres armados con los
   * dígitos más altos en mano. Capturas reales dan 843, 986 y 643 (siempre
   * los 3 más altos en orden descendente) y con tres nueves da 999.
   */
  private luckyExchangeValue(): number {
    const digits: number[] = [];
    for (let d = 9; d >= 0; d--) {
      for (let i = 0; i < (this.luckyCards[d] ?? 0); i++) digits.push(d);
    }
    const a = digits[0] ?? 0;
    const b = digits[1] ?? 0;
    const c = digits[2] ?? 0;
    return a * 100 + b * 10 + c;
  }

  /**
   * Con tres nueves en la mano ya no se buscan más cofres: se manda el canje
   * (9864) y se espera el 9865. Devuelve true sólo si acaba de enviarlo.
   * Agota los reintentos → cierra el evento en la DB (ver markLuckyExchanged).
   */
  private async runLuckyExchangeStep(now: number): Promise<boolean> {
    if (this.luckyExchangePending) {
      if (now - this.luckyExchangeSentAt <= LUCKY_EXCHANGE_TIMEOUT_MS) return false;
      this.luckyExchangePending = false;
      this.bot.log('[CARTA] 9864 sin respuesta 9865 (timeout) — se reintenta');
    }
    if (now < this.luckyExchangeRetryAt) return false;
    if (this.luckyExchangeAttempts >= LUCKY_EXCHANGE_MAX_ATTEMPTS) {
      if (!this.luckyExchangeWarned) {
        this.luckyExchangeWarned = true;
        void this.markLuckyExchanged(
          `${LUCKY_EXCHANGE_MAX_ATTEMPTS} intentos de canje sin respuesta`,
          -1,
          this.luckyExchangeSentValue,
        );
      }
      return false;
    }
    await this.sendLuckyExchange();
    return true;
  }

  private async sendLuckyExchange(): Promise<void> {
    const value = this.luckyExchangeValue();
    this.luckyExchangeRetryAt = Date.now() + LUCKY_EXCHANGE_RETRY_MS;
    try {
      await exchangeLuckyCards(this.bot, value);
    } catch (e: any) {
      // No llegó a salir: NO cuenta como intento (el evento sigue abierto)
      this.bot.log(`[CARTA] error 9864: ${e?.message || e} — no se contó como intento`);
      return;
    }
    this.luckyExchangePending = true;
    this.luckyExchangeSentAt = Date.now();
    this.luckyExchangeSentValue = value;
    this.luckyExchangeEventKey = this.luckyEventKey;
    this.luckyExchangeAttempts++;
    this.bot.log(
      `[CARTA] 9864 → canjear ${value} (${this.luckyCards[9] ?? 0} nueve(s)) — se deja de buscar cofres`,
    );
  }

  /**
   * 9865: respuesta al 9864. Layout confirmado: status 0 = canje aplicado y
   * `[1..4]` eco del número enviado. Sólo se acepta si el 9864 se mandó para
   * el evento vigente; cualquier status (o no poder parsearlo) cierra el
   * evento: sólo existe UN canje por evento. Ver `docs/protocols/9865.md`.
   */
  onLuckyExchangeResponse(res: LuckyExchangeResult | null, body: Buffer): void {
    if (!this.luckyExchangePending) {
      this.bot.log(`[CARTA] 9865 sin canje pendiente — se ignora (${body.toString('hex')})`);
      return;
    }
    this.luckyExchangePending = false;
    if (this.luckyExchangeEventKey && this.luckyExchangeEventKey !== this.luckyEventKey) {
      this.bot.log('[CARTA] 9865 de otro evento — se ignora');
      return;
    }
    if (!res) {
      this.bot.log(`[CARTA] 9865 sin parsear (${body.length} B): ${body.toString('hex')}`);
      void this.markLuckyExchanged('9865 sin parsear (no se pudo confirmar)', -2, this.luckyExchangeSentValue);
      return;
    }
    const echoOk = res.echo === this.luckyExchangeSentValue;
    this.bot.log(
      `[CARTA] 9865 status=${res.status} número=${res.echo}` +
        `${echoOk ? '' : ` (esperaba ${this.luckyExchangeSentValue})`}` +
        ` → saldo ${res.gemsTotal} gems (tail=${res.tail})`,
    );
    if (res.status !== 0x00) {
      void this.markLuckyExchanged(
        `9865 rechazado (status=0x${res.status.toString(16)}) — sólo existe un canje, se cierra el evento`,
        res.status,
        res.echo,
        res.gemsTotal,
      );
      return;
    }
    if (!echoOk) this.bot.log('[CARTA] 9865 eco distinto al enviado — se marca igual (status 0)');
    void this.markLuckyExchanged('¡CANJE CONFIRMADO! (9865 status 00)', 0, res.echo, res.gemsTotal);
  }

  /**
   * Cierra el canje del evento ACTUAL en la DB (`reclaimed = true`): desde
   * acá esta cuenta no vuelve a buscar cofres ni a canjear en este evento.
   * Sólo existe UN canje por evento, así que cualquier respuesta del servidor
   * (o su falta, tras los reintentos) cierra el evento — ver 9865.md.
   */
  private async markLuckyExchanged(reason: string, status: number, value = 0, gemsTotal = 0): Promise<void> {
    const key = this.luckyEventKey;
    if (!key) {
      this.bot.log(`[CARTA] ${reason} — sin eventKey (no llegó el 9861): NO se pudo registrar en la DB`);
      return;
    }
    this.luckyExchangeReclaimed = true;
    this.luckyExchangeHydrated = true;
    this.luckyExchangeCache.set(key, true);
    this.luckyExchangePending = false;
    this.emit('luckyCardUpdated');
    this.bot.log(
      `[CARTA] ${reason}${gemsTotal ? ` · saldo ${gemsTotal} gems` : ''} → evento ${key} marcado en la DB · el bot ya no busca ni reclama cofres`,
    );
    if (!databaseService.isConnected()) {
      this.bot.log('[CARTA] DB sin conexión: el canje queda en memoria; se reintentará en el próximo 9861');
      return;
    }
    try {
      await databaseService.LuckyExchangeClaimModel.updateOne(
        { iggId: this.iggId, eventKey: key },
        {
          $set: {
            iggId: this.iggId,
            eventKey: key,
            eventStartTs: this.luckyEventTs,
            eventDuration: this.luckyEventDuration,
            eventEndTs: this.luckyEventTs + this.luckyEventDuration,
            reclaimed: true,
            status,
            value,
            gemsTotal,
            at: Math.floor(Date.now() / 1000),
          },
        },
        { upsert: true },
      );
    } catch (e: any) {
      this.bot.log(`[CARTA] error guardando el canje en la DB: ${e?.message || e}`);
    }
  }

  /**
   * Define el evento vigente a partir del 9861. Si cambia la ronda se limpia
   * el estado de canje (intentos, pendiente, avisos) y se consulta a la DB si
   * ese evento ya fue canjeado por esta cuenta.
   */
  private setLuckyEvent(eventTs: number, duration: number): void {
    const key = `${eventTs}_${duration}`;
    if (key === this.luckyEventKey) return;
    this.luckyEventKey = key;
    this.luckyEventTs = eventTs;
    this.luckyEventDuration = duration;
    this.luckyExchangePending = false;
    this.luckyExchangeAttempts = 0;
    this.luckyExchangeRetryAt = 0;
    this.luckyExchangeWarned = false;
    this.luckyExchangeEventKey = '';
    this.luckyExchangeReclaimed = this.luckyExchangeCache.get(key) ?? false;
    this.luckyExchangeHydrated = this.luckyExchangeCache.has(key);
    const fin = duration > 0 ? new Date((eventTs + duration) * 1000).toISOString() : '¿?';
    this.bot.log(`[CARTA] evento ${key} (fin ${fin})`);
    void this.hydrateLuckyExchange(key);
  }

  /**
   * Trae de la DB si este evento ya fue canjeado por esta cuenta (una consulta
   * por evento, cacheada). Si no hay DB conectada se confía en el 9861.
   */
  private async hydrateLuckyExchange(key: string): Promise<void> {
    if (this.luckyExchangeCache.has(key)) {
      this.luckyExchangeHydrated = true;
      return;
    }
    if (!databaseService.isConnected()) {
      this.luckyExchangeHydrated = true;
      return;
    }
    try {
      const doc = await databaseService.LuckyExchangeClaimModel
        .findOne({ iggId: this.iggId, eventKey: key })
        .lean();
      if (doc?.reclaimed) {
        this.luckyExchangeCache.set(key, true);
        this.bot.log(`[CARTA] evento ${key} ya canjeado en la DB (status=${doc.status}) — sin buscar ni canjear`);
      }
      this.seedLuckyExchangeFromConfig(key);
    } catch (e: any) {
      this.bot.log(`[CARTA] error leyendo el canje en la DB: ${e?.message || e}`);
    } finally {
      if (this.luckyEventKey === key) {
        if (!this.luckyExchangeReclaimed && this.luckyExchangeCache.get(key)) {
          this.luckyExchangeReclaimed = true;
          this.emit('luckyCardUpdated');
        }
        this.luckyExchangeHydrated = true;
      }
    }
  }

  /**
   * Migración del estado viejo: el canje se guardaba en
   * `config.luckyCards.exchangedTs` (que sólo vivía en el JSON, que la carga
   * desde la DB ni lee). Si ese ts coincide con el evento vigente se siembra
   * la fila en la DB para que esas cuentas no vuelvan a canjear.
   */
  private seedLuckyExchangeFromConfig(key: string): void {
    const legacy = this.config.luckyCards?.exchangedTs ?? 0;
    if (legacy && legacy === this.luckyEventTs && !this.luckyExchangeCache.get(key)) {
      this.plantLegacyExchanged(key, legacy, 'config de la DB');
      return;
    }
    // El JSON de la cuenta (fuente original de ese campo) puede traerlo aunque
    // la DB no: ahí estaban las cuentas que ya canjearon este evento.
    try {
      const raw = JSON.parse(fs.readFileSync(configService.getConfigPath(this.iggId), 'utf-8'));
      const fromFile = normalizeKeys(raw)?.luckyCards?.exchangedTs ?? 0;
      if (fromFile && fromFile === this.luckyEventTs && !this.luckyExchangeCache.get(key)) {
        this.plantLegacyExchanged(key, fromFile, 'config.json');
      }
    } catch {
      /* sin config.json o ilegible: no hay nada que migrar */
    }
  }

  /** Siembra la fila del evento a partir del `exchangedTs` legacy (status -3). */
  private plantLegacyExchanged(key: string, legacyTs: number, origen: string): void {
    this.luckyExchangeCache.set(key, true);
    this.bot.log(`[CARTA] migración: exchangedTs=${legacyTs} (${origen}) → evento ${key} marcado como canjeado`);
    if (!databaseService.isConnected()) return;
    void databaseService.LuckyExchangeClaimModel
      .updateOne(
        { iggId: this.iggId, eventKey: key },
        {
          $set: {
            iggId: this.iggId,
            eventKey: key,
            eventStartTs: legacyTs,
            eventDuration: this.luckyEventDuration,
            eventEndTs: legacyTs + this.luckyEventDuration,
            reclaimed: true,
            status: -3,
            value: 0,
            gemsTotal: 0,
            at: Math.floor(Date.now() / 1000),
          },
        },
        { upsert: true },
      )
      .catch((e: any) => this.bot.log(`[CARTA] error migrando el canje a la DB: ${e?.message || e}`));
  }

  /**
   * Cofres sin reclamar y fuera de backoff, ordenados por distancia al
   * castillo (los `limit` más cercanos). Los que ya se consultaron y
   * respondieron "reclamado" / "sin flag" quedan cacheados y no vuelven a
   * salir hasta que venza su backoff.
   */
  private findLuckyChests(cx: number, cy: number, now: number, limit: number): ParsedMapTile[] {
    const cand: { t: ParsedMapTile; d: number }[] = [];
    for (const t of this.mapTiles.values()) {
      if (!t.monster || !isMonsterChest(t.monster.id)) continue;
      if (this.claimedChests.has(t.id)) continue;
      const retryAt = this.luckyChestBackoff.get(t.id);
      if (retryAt !== undefined) {
        if (retryAt <= now) this.luckyChestBackoff.delete(t.id);
        else continue;
      }
      cand.push({ t, d: this.calculateDistance(t.x, t.y, cx, cy) });
    }
    cand.sort((a, b) => a.d - b.d);
    return cand.slice(0, Math.max(1, limit)).map(c => c.t);
  }

  /**
   * Sin cofres a la vista: pide la siguiente ventana 2201 alrededor del
   * castillo para que lleguen tiles nuevos (no mientras corre el escaneo
   * de caza, que cancelaría su tanda). Recorre hunt.scanRadius y repite.
   */
  private refreshLuckyScan(cx: number, cy: number): void {
    if (this.mapScanRunning || this.huntRunning) return;
    if (this.luckyScanWindows.length === 0 || this.luckyScanIdx >= this.luckyScanWindows.length) {
      const radius = Math.max(0, this.config.hunt.scanRadius ?? 50);
      this.luckyScanWindows = buildScanWindows(cx, cy, radius);
      this.luckyScanIdx = 0;
    }
    const w = this.luckyScanWindows[this.luckyScanIdx++];
    if (w) this.requestMapData(w.x, w.y);
  }

  /** 2202 al tile del cofre; devuelve el 2220 de 60 B (NOT/YES) o null si expira. */
  private requestTileInfo(x: number, y: number, timeoutMs = 5000): Promise<TileInfoResult | null> {
    if (this.pendingTileInfo) {
      const prev = this.pendingTileInfo;
      this.pendingTileInfo = null;
      clearTimeout(prev.timer);
      prev.resolve(null);
    }
    return new Promise<TileInfoResult | null>(resolve => {
      const timer = setTimeout(() => {
        if (this.pendingTileInfo?.timer === timer) this.pendingTileInfo = null;
        resolve(null);
      }, timeoutMs);
      this.pendingTileInfo = {
        x,
        y,
        timer,
        resolve: v => {
          clearTimeout(timer);
          if (this.pendingTileInfo?.timer === timer) this.pendingTileInfo = null;
          resolve(v);
        },
      };
      queryTileInfo(this.bot, x, y).catch(e => this.bot.log(`[CARTA] error 2202: ${e?.message || e}`));
    });
  }

  /** Llegó la respuesta del 2202 (60 B): despierta la espera si es el tile nuestro. */
  onTileInfo(info: TileInfoResult): void {
    const p = this.pendingTileInfo;
    if (!p || p.x !== info.x || p.y !== info.y) return;
    p.resolve(info);
  }

  private async sendLuckySearch(x: number, y: number, tileId: number): Promise<void> {
    // Salvaguarda del slot hasta que llegue el 9867 (trae la duración real)
    this.luckySearchTarget = { x, y };
    this.luckySearchTileId = tileId;
    this.luckySearchBusyUntil = Date.now() + LUCKY_SEARCH_FALLBACK_MS;
    try {
      await startLuckyCardSearch(this.bot, x, y);
    } catch (e: any) {
      this.luckySearchTarget = null;
      this.luckySearchTileId = 0;
      this.luckySearchBusyUntil = 0;
      this.bot.log(`[CARTA] error 9866: ${e?.message || e}`);
      return;
    }
    this.claimedChests.add(tileId);
    this.bot.log(`[CARTA] 9866 → (${x},${y}) buscando carta…`);
  }

  /**
   * Libera el slot de búsqueda. `retry` = el servidor rechazó el 9866 (no
   * salió ninguna marcha): el cofre se desmarca y se reintenta más tarde.
   */
  private releaseLuckySearch(retry: boolean): void {
    const t = this.luckySearchTarget;
    if (!t) return;
    const tileId = this.luckySearchTileId;
    this.luckySearchTarget = null;
    this.luckySearchTileId = 0;
    this.luckySearchBusyUntil = 0;
    if (retry && tileId) {
      this.claimedChests.delete(tileId);
      this.luckyChestBackoff.set(tileId, Date.now() + LUCKY_CHEST_BACKOFF_MS);
      this.bot.log(`[CARTA] (${t.x},${t.y}) rechazada — slot libre, reintento en ${LUCKY_CHEST_BACKOFF_MS / 1000}s`);
    } else {
      this.bot.log('[CARTA] búsqueda terminada — slot libre');
    }
  }

  /**
   * 9867: respuesta al 9866. status 0 = aceptada (la tropa sale con ida y
   * vuelta de `durationSec`); cualquier otro status = rechazo (no sale marcha).
   */
  onLuckySearchAck(res: LuckySearchResult | null, raw: Buffer): void {
    if (!res) {
      this.bot.log(`[CARTA] 9867 sin parsear: ${raw.toString('hex')}`);
      return;
    }
    if (res.status !== 0x00) {
      this.bot.log(`[CARTA] 9867 rechazado (status=0x${res.status.toString(16)})`);
      this.releaseLuckySearch(true);
      return;
    }
    const ack = res.ack;
    if (!ack) return;
    this.bot.log(`[CARTA] 9867 ack (${ack.x},${ack.y}) duración ${ack.durationSec}s`);
    if (!this.luckySearchTarget) return;
    // Ida + vuelta + margen: hasta que la tropa no regresa no se manda otra
    this.luckySearchBusyUntil = Date.now() + ack.durationSec * 2 * 1000 + LUCKY_SEARCH_MARGIN_MS;
  }

  /**
   * 9861: el servidor manda el conjunto REAL de cartas (login y reset diario)
   * más el inicio y la duración del evento. Manda sobre el contador local, que
   * sólo refleja lo visto desde el último 9861 (si el jugador canjea desde el
   * móvil, esto lo pone en cero).
   */
  onLuckyCardInfo(info: LuckyCardInfo): void {
    if (info.eventTs) this.setLuckyEvent(info.eventTs, info.duration);
    const counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const digit of info.cards) counts[digit] = (counts[digit] ?? 0) + 1;
    const changed = counts.some((c, i) => c !== this.luckyCards[i]);
    this.luckyCards = counts;
    const total = info.cards.length;
    const nines = counts[9] ?? 0;
    const extra = this.isLuckyExchanged()
      ? ' — evento ya canjeado, sin buscar más'
      : nines >= LUCKY_EXCHANGE_MIN_NINES
        ? ` — ¡${nines} nueves! se canjea (9864)`
        : '';
    this.bot.log(
      total > 0
        ? `[CARTA] 9861 INFO: ${total} carta(s) en mano: ${info.cards.join(',')}${extra}`
        : `[CARTA] 9861 INFO: sin cartas en mano${extra}`,
    );
    // El servidor volvió a mandar el estado con las manos vacías después del
    // 9864 (aunque ya haya pasado el timeout del 9865): otra señal de que el
    // canje se aplicó, así que cierra el evento sin esperar el 9865.
    if (
      info.cardCount === 0 &&
      this.luckyEventKey &&
      this.luckyExchangeEventKey === this.luckyEventKey &&
      !this.isLuckyExchanged()
    ) {
      void this.markLuckyExchanged('9861 con mano vacía tras el 9864', 0, this.luckyExchangeSentValue);
    }
    if (changed) this.emit('luckyCardUpdated');
  }

  /**
   * Llegó una carta que ENTRÓ a la mano (9862 con flag 01). La mano sólo admite
   * 10 cartas y son las de mayor dígito: si está llena, la que se cae es la
   * menor. El servidor ya validó la entrada, así que acá se replica el descarte
   * para que `luckyCards[]` no sobre-cuente (ver docs/protocols/9862.md).
   *
   * Un duplicado dentro de los 5 s no suma dos veces.
   */
  onLuckyCardEvent(digit: number | null, source: string, raw: Buffer): void {
    if (digit === null) {
      if (raw.length > 0)
        this.bot.log(`[CARTA] ${source} no sumada (flag 00 = fuera del top 10, o sin dígito): ${raw.toString('hex')}`);
      return;
    }
    const now = Date.now();
    if (now - this.lastLuckyCardAt < 5000) return;
    this.lastLuckyCardAt = now;

    const dropped: number[] = [];
    let total = this.luckyCards.reduce((a, b) => a + b, 0);
    while (total >= LUCKY_HAND_SIZE) {
      const min = this.luckyCards.findIndex((c) => c > 0);
      if (min < 0) break;
      this.luckyCards[min] -= 1;
      dropped.push(min);
      total -= 1;
    }

    this.luckyCards[digit] = (this.luckyCards[digit] ?? 0) + 1;
    const hand = this.luckyCards.reduce((a, b) => a + b, 0);
    const nines = this.luckyCards[9] ?? 0;
    const hint = nines >= LUCKY_EXCHANGE_MIN_NINES ? ' — ¡3 nueves! se canjea (9864)' : '';
    const out = dropped.length > 0 ? `, sale ${dropped.join('/')} del top 10` : '';
    const drift = dropped.some((d) => digit <= d) ? ' (drift local: recheck en el próximo 9861)' : '';
    this.bot.log(
      `[CARTA] +1 carta dígito ${digit} (dígito ${digit}: ${this.luckyCards[digit]} · total: ${hand})${out}${hint}${drift}`,
    );
    this.emit('luckyCardUpdated');
  }

  /**
   * Marcha vista en el mapa: si es la vuelta de la búsqueda de carta
   * (cofre → castillo) se adelanta la liberación del slot, pero NUNCA antes
   * de que la tropa llegue: se usa startTime + 2×duration (ida completa), que
   * sirve tanto si el registro es la ida como si es la vuelta.
   */
  onLuckyCardMarch(march: MapMarch): void {
    const t = this.luckySearchTarget;
    if (!t) return;
    const cx = this.playerInfo?.castleX ?? -1;
    const cy = this.playerInfo?.castleY ?? -1;
    if (march.origin.x !== t.x || march.origin.y !== t.y) return;
    if (march.destination.x !== cx || march.destination.y !== cy) return;
    const releaseAt = (march.startTime + march.duration * 2) * 1000 + LUCKY_SEARCH_MARGIN_MS;
    this.luckySearchBusyUntil = Math.min(this.luckySearchBusyUntil, releaseAt);
    const secs = Math.max(0, Math.round((releaseAt - Date.now()) / 1000));
    this.bot.log(`[CARTA] vuelta de (${t.x},${t.y}) observada — slot en ${secs}s`);
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

    this.supplyStopRequested = false;
    this.supplyStoppedByUser = false;
    this.supplyManualActive = true;

    const resolveErr = await this.resolveTargetLocation(targetPlayer);
    if (resolveErr) {
      this.supplyManualActive = false;
      return { ok: false, message: resolveErr };
    }
    if (this.supplyStopRequested) {
      this.supplyStopRequested = false;
      this.supplyStoppedByUser = false;
      this.supplyManualActive = false;
      return { ok: false, message: `Supply detenido por el usuario en "${targetPlayer}"` };
    }

    const res = this.resources;
    if (!res) {
      this.supplyManualActive = false;
      return { ok: false, message: 'Sin recursos disponibles' };
    }

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
      if (!cfg.maxAmount || cfg.maxAmount <= 0) continue;
      const totalCaravans = Math.ceil(r.amount / cfg.maxAmount);
      entries.push({ name: r.name, amount: totalCaravans * cfg.maxAmount });
    }

    if (entries.length === 0) {
      this.supplyManualActive = false;
      return { ok: false, message: 'Sin recursos para enviar' };
    }

    this.actions.pause();
    this.supplyPending = entries;
    this.supplyBusy = false;
    this.supplyCurrentTarget = targetPlayer;
    const summary = entries.map(e => `${e.name} ${(e.amount / 1e6).toFixed(1)}M`).join(', ');
    this.bot.log(`[SUPPLY-MANUAL] Pausando acciones, enviando a "${targetPlayer}": ${summary}`);

    await this.sendCaravanBatch(true);
    if (this.supplyStoppedByUser) {
      this.supplyStoppedByUser = false;
      this.supplyStopRequested = false;
      return { ok: false, message: `Supply detenido por el usuario en "${targetPlayer}"` };
    }
    if (this.supplyManualFailed) {
      this.supplyManualFailed = false;
      return { ok: false, message: `Supply abortado para "${targetPlayer}" (ver log: gremio/ubicación/mapa)` };
    }
    return { ok: true, message: `Supply enviado a "${targetPlayer}": ${summary}` };
  }

  /**
   * Botón "Parar": corta el lote de supply de ESTA cuenta.
   * Limpia la cola, corta la espera del ack 2453 y el bucle de caravanas
   * termina en la siguiente vuelta (waitForSupplySlot ve la cola vacía).
   */
  stopSupply(): { stopped: boolean; message: string } {
    const active = this.supplyBusy || this.supplyManualActive || this.supplyPending.length > 0;
    if (!active) return { stopped: false, message: 'No hay supply en curso en esta cuenta' };

    this.supplyStopRequested = true;
    if (this.supplyManualActive) this.supplyStoppedByUser = true;
    this.supplyPending = [];

    const resolveAck = this.supplyCaravanAckResolve;
    if (resolveAck) {
      this.supplyCaravanAckResolve = null;
      resolveAck();
    }
    const wake = this.supplyStopWakeup;
    if (wake) wake();

    this.bot.log(`[SUPPLY] Parar solicitado: cancelando lote (${this.supplyInFlight.length} caravanas en vuelo)`);
    return { stopped: true, message: 'Supply detenido (las caravanas ya en vuelo siguen su curso)' };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Igual que sleep(), pero si llega un stopSupply() durante la espera
   * se despierta de inmediato (el botón "Parar" no tiene que esperar al timer).
   */
  private stopAwareSleep(ms: number): Promise<void> {
    if (!this.supplyStopRequested) {
      return new Promise(resolve => {
        const timer = setTimeout(resolve, ms);
        this.supplyStopWakeup = () => { clearTimeout(timer); this.supplyStopWakeup = null; resolve(); };
      });
    }
    return Promise.resolve();
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
      await this.stopAwareSleep(waitSec * 1000);
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
          // exchangedTs es legacy (el canje vive en la DB, LuckyExchangeClaim):
          // se preserva el que ya trae el archivo para no perder la migración
          luckyCards: {
            ...original.luckyCards,
            exchangedTs: this.config.luckyCards?.exchangedTs || original.luckyCards?.exchangedTs || 0,
          },
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
          await this.stopAwareSleep(1200);
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
