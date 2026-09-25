export enum TroopType {
  Infantry = 0,
  Ranged = 1,
  Cavalry = 2,
  Siege = 3,
}

export enum TroopTier {
  T1 = 1,
  T2 = 2,
  T3 = 3,
  T4 = 4,
  T5 = 5,
}

export const TROOP_TYPE_ORDER = [
  TroopType.Infantry,
  TroopType.Ranged,
  TroopType.Cavalry,
  TroopType.Siege,
] as const;

export const TROOP_TIER_ORDER = [
  TroopTier.T1,
  TroopTier.T2,
  TroopTier.T3,
  TroopTier.T4,
  TroopTier.T5,
] as const;

export interface TroopInfo {
  type: TroopType;
  tier: TroopTier;
  count: number;
}

export class TroopState {
  troops: TroopInfo[] = [];

  get(type: TroopType, tier: TroopTier): TroopInfo | undefined {
    return this.troops.find(t => t.type === type && t.tier === tier);
  }

  getCount(type: TroopType, tier: TroopTier): number {
    return this.get(type, tier)?.count ?? 0;
  }

  getTotalByType(type: TroopType): number {
    let total = 0;
    for (const t of this.troops) {
      if (t.type === type) total += t.count;
    }
    return total;
  }

  getTotalByTier(tier: TroopTier): number {
    let total = 0;
    for (const t of this.troops) {
      if (t.tier === tier) total += t.count;
    }
    return total;
  }

  getTotalTroops(): number {
    let total = 0;
    for (const t of this.troops) {
      total += t.count;
    }
    return total;
  }
}

export function parse2401(body: Buffer): TroopState | null {
  if (body.length < 80) return null;
  const state = new TroopState();
  let idx = 0;
  for (const type of TROOP_TYPE_ORDER) {
    for (let ti = 0; ti < 4; ti++) {
      const tier = (ti + 1) as TroopTier;
      const count = body.readUInt32LE(idx * 4);
      state.troops.push({ type, tier, count });
      idx++;
    }
  }
  // T5: Infantry, Ranged, Cavalry, Siege
  for (const type of TROOP_TYPE_ORDER) {
    const count = body.readUInt32LE(idx * 4);
    state.troops.push({ type, tier: TroopTier.T5, count });
    idx++;
  }
  return state;
}
