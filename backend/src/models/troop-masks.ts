export interface TierMask {
  infantry: number;
  artillery: number;
  cavalry: number;
}

export interface TroopSelection {
  tier: number;
  infantry: boolean;
  artillery: boolean;
  cavalry: boolean;
  infantryCount: number;
  artilleryCount: number;
  cavalryCount: number;
  hasAny: boolean;
}

const TIERS: Record<number, TierMask> = {
  1: { infantry: 1, artillery: 2, cavalry: 4 },
  2: { infantry: 16, artillery: 32, cavalry: 64 },
  3: { infantry: 256, artillery: 512, cavalry: 1024 },
  4: { infantry: 4096, artillery: 8192, cavalry: 16384 },
  5: { infantry: 0, artillery: 0, cavalry: 0 },
};

export function calculateMask(selections: { tier: number; inf: boolean; art: boolean; cav: boolean }[]): number {
  let mask = 0;
  for (const { tier, inf, art, cav } of selections) {
    const t = TIERS[tier];
    if (!t) continue;
    if (inf) mask += t.infantry;
    if (art) mask += t.artillery;
    if (cav) mask += t.cavalry;
  }
  return mask;
}
