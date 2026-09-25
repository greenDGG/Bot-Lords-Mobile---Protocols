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
