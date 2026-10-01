import type { HuntAttackType } from '../bot/data/monsters';

export interface BotConfig {
  autoStart: boolean;
  dailyResetTime: string;
  limitTrain: number;
  reconnectTime: number;
  sendHelp: boolean;
  proxy: string;
  warMode: boolean;
  costumeWar: number;
  costumeNormal: number;
  train: TrainConfig;
  shield: ShieldConfig;
  giftDaily: GiftDailyConfig;
  mysteryBox: MysteryBoxConfig;
  ship: ShipConfig;
  forgeGift: ForgeGiftConfig;
  chestVip: ChestVipConfig;
  artifactFair: ArtifactFairConfig;
  refineMana: RefineManaConfig;
  openGuildChest: OpenGuildChestConfig;
  eternalTreasure: EternalTreasureConfig;
  treasureChamber: TreasureChamberConfig;
  adminQuest: QuestConfig;
  guildQuest: QuestConfig;
  resourceLimit: ResourceLimitConfig;
  supply: SupplyConfig;
  events: EventsConfig;
  coliseum: ColiseumConfig;
  sweep: SweepConfig;
  missions: MissionConfig;
  hunt: HuntConfig;
  luckyCards: LuckyCardsConfig;
}

export interface TrainConfig {
  enable: boolean;
  type: string;
  velTrain: number;
  subsidiosPorcentaje: number;
}

export interface ShieldConfig {
  enable: boolean;
  type: string;
  redeployTime: string;
}

export interface GiftDailyConfig {
  autoreclaim: boolean;
  next: number;
  index: number;
}

export interface MysteryBoxConfig {
  enable: boolean;
  next: number;
}

export interface ShipConfig {
  intercambio: boolean;
  next: number;
  reclaim: boolean;
  lastExchangedTs: number;
}

export interface ForgeGiftConfig {
  enable: boolean;
  next: number;
}

export interface ChestVipConfig {
  enable: boolean;
}

export interface ArtifactFairConfig {
  enable: boolean;
  reset: number;
}

export interface RefineManaConfig {
  enable: boolean;
}

export interface OpenGuildChestConfig {
  enable: boolean;
}

export interface EternalTreasureConfig {
  enable: boolean;
}

export interface TreasureChamberConfig {
  enable: boolean;
}

export interface QuestConfig {
  enable: boolean;
}

export interface ResourceLimitConfig {
  wheat: number;
  wood: number;
  stone: number;
  ore: number;
  gold: number;
}

export interface SupplyConfig {
  enable: boolean;
  targetPlayer: string;
  threshold: number;
  /** Capacidad por caravana: NO es config, sale del stat "Capacidad de suministro +" (ver getSupplyCapacity). */
  caravanLimit: number;
}

/**
 * Config de supply leída de Mongo/JSON: defaults + lo guardado, descartando
 * claves viejas (`maxAmount`, que era el intento de adivinar la capacidad por
 * caravana antes de tener el stat "Capacidad de suministro +").
 */
export function pickSupply(raw: any): SupplyConfig {
  const { maxAmount: _legacyMaxAmount, ...rest } = raw && typeof raw === 'object' ? raw : {};
  return { enable: false, targetPlayer: '', threshold: 7000000, caravanLimit: 4, ...rest };
}

/** Borra de un config (in-place) las claves que ya no existen. */
export function stripLegacyConfig(config: any): void {
  if (config?.supply && typeof config.supply === 'object') delete config.supply.maxAmount;
}

export interface EventsConfig {
  enable: boolean;
}

export interface ColiseumConfig {
  reclaimGems: boolean;
  autoAttack: boolean;
  hero0: number;
  hero1: number;
  hero2: number;
  hero3: number;
  hero4: number;
}

export function getColiseumHeroes(coliseum: ColiseumConfig): number[] {
  return [coliseum.hero0, coliseum.hero1, coliseum.hero2, coliseum.hero3, coliseum.hero4];
}

export interface SweepConfig {
  enable: boolean;
  payload: string;
}

export interface MissionConfig {
  autoEliminate: boolean;
  wantedMissionIds: number[];
}

/**
 * Caza de monstruos (proto 2488 _MSG_REQUEST_SENDMONSTER).
 *
 * Cada nivel define DOS hex de payload SIN la coord:
 *   2488 body = [coord 3B (encodeCoord)][payloadHex]
 * El que se usa depende de contra qué es débil el bicho (monsters.ts):
 *   débil contra magia  → payloadHexMagia
 *   débil contra físico  → payloadHexFisico
 * El payload incluye los 5 héroes (u16 LE) y el trailer tal cual se capturó.
 *
 * El costo de energía NO se configura: se calcula con la base del nivel
 * (3000/5000/8000/14000/18000, ver energy.ts) menos el ahorro de las
 * investigaciones (efecto 318 "Ahorro de energía").
 */
export interface HuntLevelConfig {
  level: number;
  payloadHexMagia: string;
  payloadHexFisico: string;
  /** legacy: configs guardadas antes de tener los dos campos */
  payloadHex?: string;
  /** legacy: configs guardadas antes de que el costo se calculara solo */
  energyCost?: number;
}

export interface HuntSquadConfig {
  /** false → exclusión estricta: 1 bot por bicho (los demás van a otro) */
  enable: boolean;
  /** máximo de bots que pueden golpear el mismo bicho */
  max: number;
}

export interface HuntConfig {
  enable: boolean;
  /** segundos entre golpes al mismo bicho */
  cooldown: number;
  /** radio (tiles) del escaneo automático del mapa alrededor del castillo */
  scanRadius: number;
  /** squad compartido: cuántos bots van al mismo bicho según el HP restante */
  squad: HuntSquadConfig;
  levels: HuntLevelConfig[];
}

export function getHuntLevel(hunt: HuntConfig, level: number): HuntLevelConfig | null {
  return hunt.levels.find(l => l.level === level) ?? null;
}

/**
 * Hex del 2488 a usar para un bicho con la debilidad dada.
 * Tolera configs viejas: si falta el específico, cae al `payloadHex` legacy.
 */
export function getHuntPayloadHex(level: HuntLevelConfig, debilidad: HuntAttackType | null): string {
  const clean = (v?: string) => (v ?? '').replace(/\s/g, '');
  const especifico =
    debilidad === 'magia' ? level.payloadHexMagia :
    debilidad === 'fisico' ? level.payloadHexFisico :
    '';
  return clean(especifico) || clean(level.payloadHex) || clean(level.payloadHexMagia) || clean(level.payloadHexFisico) || '';
}

/** Política de squad tolerando configs guardadas antes de que existiera `squad`. */
export function getHuntSquad(hunt: HuntConfig): HuntSquadConfig {
  const s = hunt?.squad;
  return { enable: s?.enable ?? true, max: Math.max(1, s?.max ?? 5) };
}

/**
 * Evento "Carta de la Suerte": cofres de especie 217 en el mapa.
 * El bot consulta cada cofre (2202), y si dice `NOT` manda la tropa (9866)
 * a buscar la carta. Sólo puede haber UNA búsqueda por cuenta a la vez.
 */
export interface LuckyCardsConfig {
  /** buscar cartas automáticamente cuando hay cofres en el mapa */
  enable: boolean;
  /** segundos mínimos entre ciclos de búsqueda */
  intervalSec: number;
  /** cofres a reclamar como máximo por ciclo */
  maxPerCycle: number;
  /**
   * @deprecated u32 ts del evento en el que ya se canjeó (0 = nunca).
   * El estado real vive en la DB (`LuckyExchangeClaim.reclaimed`): este campo
   * sólo se conserva para migrar las cuentas que ya canjearon — ver 9865.md.
   */
  exchangedTs: number;
}

/** Config de cartas tolerando configs guardadas antes de que existiera la sección. */
export function getLuckyCardsConfig(config: BotConfig): LuckyCardsConfig {
  const c = config?.luckyCards;
  return {
    enable: c?.enable ?? true,
    intervalSec: Math.max(5, c?.intervalSec ?? 30),
    maxPerCycle: Math.max(1, c?.maxPerCycle ?? 3),
    exchangedTs: c?.exchangedTs ?? 0,
  };
}

export function isHuntPayloadValid(hex: string): boolean {
  const clean = hex.replace(/\s/g, '');
  return clean.length >= 2 && clean.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(clean);
}

export function parseSweepPayload(hex: string): { tipo: number; etapa: number; capitulo: number } | null {
  const clean = hex.replace(/\s/g, '');
  if (clean.length < 10) return null;
  const buf = Buffer.from(clean, 'hex');
  if (buf.length < 5) return null;
  return {
    tipo: buf[0],
    etapa: buf[1],
    capitulo: buf[2],
  };
}

export function sweepResistenciaCost(tipo: number, etapa: number): number {
  const base = etapa === 1 ? 6 : 12;
  return tipo === 2 ? base * 10 : base;
}

export function defaultBotConfig(proxy?: string): BotConfig {
  return {
    autoStart: true,
    dailyResetTime: '00:00',
    limitTrain: 0,
    reconnectTime: 30,
    sendHelp: true,
    proxy: proxy || '',
    warMode: false,
    costumeWar: 1,
    costumeNormal: 0,
    train: { enable: false, type: '', velTrain: 0, subsidiosPorcentaje: 0 },
    shield: { enable: true, type: '1d', redeployTime: '1h' },
    giftDaily: { autoreclaim: true, next: 0, index: 0 },
    mysteryBox: { enable: true, next: 0 },
    ship: { intercambio: true, next: 0, reclaim: true, lastExchangedTs: 0 },
    forgeGift: { enable: true, next: 0 },
    chestVip: { enable: true },
    artifactFair: { enable: false, reset: 0 },
    refineMana: { enable: false },
    openGuildChest: { enable: false },
    eternalTreasure: { enable: true },
    treasureChamber: { enable: false },
    adminQuest: { enable: true },
    guildQuest: { enable: true },
    resourceLimit: { wheat: 1_000_000_000, wood: 1_000_000_000, stone: 1_000_000_000, ore: 1_000_000_000, gold: 1_000_000_000 },
    supply: { enable: false, targetPlayer: '', threshold: 7000000, caravanLimit: 4 },
    events: { enable: true },
    coliseum: { reclaimGems: false, autoAttack: false, hero0: 1, hero1: 3, hero2: 6, hero3: 5, hero4: 23 },
    sweep: { enable: false, payload: '0202010001' },
    missions: { autoEliminate: false, wantedMissionIds: [] },
    hunt: {
      enable: false,
      cooldown: 8,
      scanRadius: 50,
      squad: { enable: true, max: 5 },
      levels: [{ level: 2, payloadHexMagia: '0110001400060004000500022700', payloadHexFisico: '0110001400060004000500022700' }],
    },
    luckyCards: { enable: true, intervalSec: 30, maxPerCycle: 3, exchangedTs: 0 },
  };
}
