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
  maxAmount: number;
  caravanLimit: number;
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
    supply: { enable: false, targetPlayer: '', threshold: 7000000, maxAmount: 6000000, caravanLimit: 4 },
    events: { enable: true },
    coliseum: { reclaimGems: false, autoAttack: false, hero0: 1, hero1: 3, hero2: 6, hero3: 5, hero4: 23 },
    sweep: { enable: false, payload: '0202010001' },
    missions: { autoEliminate: false, wantedMissionIds: [] },
  };
}
