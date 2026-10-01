import { TroopType, TroopTier } from '../../models/troop-state';

export const TYPE_ORDER: TroopType[] = [
  TroopType.Infantry,
  TroopType.Ranged,
  TroopType.Cavalry,
  TroopType.Siege,
];

export const TIER_MASK_VALUES: Record<number, TroopTier> = {
  1: TroopTier.T1,
  2: TroopTier.T2,
  4: TroopTier.T3,
  8: TroopTier.T4,
};

export interface MarchTroopEntry {
  type: TroopType;
  tier: TroopTier;
  count: number;
}

export interface MarchHeroEntry {
  heroId: number;
  rank: number;
  grade: number;
}

export interface MarchPacket {
  /** Byte 0 del 2446 (EWATCHTOWER_LINE_TYPE): 5 ataque, 8 exploración, 10 refuerzo, 12 rally. */
  lineType: number;
  rawHeader: Buffer;
  attackerName: string;
  guildTag: string;
  totalTroops: number;
  totalGroups: number;
  heroCount: number;
  tierMask: number;
  tiersPresent: TroopTier[];
  unknownFlag: number;
  leaderFlag: number;
  troops: MarchTroopEntry[];
  heroes: MarchHeroEntry[];
  rawBuffs: Buffer;
  rawT5Flags: Buffer;
  t5Troops: MarchTroopEntry[];
  rawFooter: Buffer;
}

export interface MarchIncomingPacket {
  marchId: number;
  marchType: number;
  startTimestamp: number;
  unknown2: number;
  seconds: number;
  rawTail: Buffer;
}

export interface MarchUpdatePacket {
  marchId: number;
  arrivalTimestamp: number;
  rawUnknown: number;
}

export interface MarchInfo {
  marchId: number;
  arrivalTimestamp: number;
  updated: boolean;
  arrived: boolean;
  countered: boolean;
  evaluated?: boolean;
  marchType?: number;
  packet?: MarchPacket;
  counterFormation?: number;
  timer?: NodeJS.Timeout;
}

export type OwnMarchStatus = 'flying' | 'arrived' | 'unknown';

export interface OwnMarch {
  /** Slot dentro del castillo (0-based). */
  index: number;
  /** Byte @0 del cuerpo: 06 = en vuelo, 01 = llegó (hipótesis abierta). */
  state: number;
  status: OwnMarchStatus;
  /** IDs de héroes (cuerpo @1..10, 5×u16; se omiten los slots en 0). */
  heroIds: number[];
  /**
   * Composición de tropas (cuerpo @11..74, 16×u32 LE). El índice del slot es
   * el mismo orden del 2401: type*4 + (tier-1) → Inf T1..T4, Rng T1..T4,
   * Cav T1..T4, Sie T1..T4. Solo slots con count > 0.
   */
  troops: MarchTroopEntry[];
  /** 3 bytes de la coordenada de destino (misma codificación que 2201). */
  destCoordBytes: [number, number, number];
  destX: number;
  destY: number;
  /** Nombre ASCII null-padded junto al ts (¿destino?). */
  name: string;
  /** Epoch s del inicio de la marcha (0 si llegó). */
  startAt: number;
  /** Duración en segundos (0 si llegó). */
  durationSec: number;
  /** u16 @106 sin decifrar: 0 en vuelo, 7689 al llegar (capturas). */
  unknown106: number;
}

export interface OwnMarchesData {
  /** Límite de marchas simultáneas del castillo. */
  limit: number;
  /** Cantidad de entries presentes en el paquete. */
  count: number;
  entries: OwnMarch[];
}
