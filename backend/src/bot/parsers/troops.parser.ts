import { TroopBranch, TroopTraining } from '../models/troops.types';

// ── Troop Calc ──

const BASE_TIME = [15, 97, 194, 396.5];
const BASE_COST = [500_000, 1_000_000, 2_400_000, 16_200_000];
const BASE_GOLD = [0, 50_000, 170_000, 8_100_000];
const BRANCHES: TroopBranch[] = [TroopBranch.Infantry, TroopBranch.Cavalry, TroopBranch.Artillery, TroopBranch.Siege];
const BRANCH_NAMES = ['Infantería', 'Caballería', 'Artillería', 'Asedio'];
const BRANCH_SHORT = ['INF', 'CAB', 'ART', 'ASI'];

export function calcTimeSeconds(tier: number, boostPercent: number): number {
  if (tier < 0 || tier > 3) return 0;
  return BASE_TIME[tier] / (1 + boostPercent / 100);
}

export function calcCost(troopType: number, tier: number, count: number, subsidioPercent: number) {
  if (tier < 0 || tier > 3 || troopType < 0 || troopType > 3) return { wheat: 0, stone: 0, wood: 0, ore: 0, gold: 0 };
  const multiplier = Math.max(0, 1 - subsidioPercent / 100);
  const cost = Math.floor(BASE_COST[tier] * count * multiplier);
  const gold = Math.floor(BASE_GOLD[tier] * count * multiplier);
  const branch = BRANCHES[troopType];
  let w = 0, s = 0, wo = 0, o = 0, g = gold;
  if (branch === TroopBranch.Infantry) { w = cost; wo = cost; o = cost; }
  else if (branch === TroopBranch.Cavalry) { w = cost; s = cost; o = cost; }
  else if (branch === TroopBranch.Artillery) { w = cost; s = cost; wo = cost; }
  else if (branch === TroopBranch.Siege) { w = cost; s = cost; wo = cost; o = cost; }
  return { wheat: w, stone: s, wood: wo, ore: o, gold: g };
}

export function branchName(troopType: number): string {
  return BRANCH_NAMES[troopType] || '?';
}

export function branchShort(troopType: number): string {
  return BRANCH_SHORT[troopType] || '?';
}

// ── Troop Training Parser ──

export function parseTroopTraining(payload: Buffer): TroopTraining | null {
  if (payload.length < 18) return null;
  return {
    troopType: payload[0],
    tier: payload[1],
    count: payload.readUInt16LE(2),
    timestamp: payload.readUInt32LE(4),
    remainingSeconds: payload.readInt32LE(8),
  };
}
