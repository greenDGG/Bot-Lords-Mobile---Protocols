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

export interface HospitalTroop {
  type: TroopType;
  tier: TroopTier;
  injured: number;
  healing: number;
}

export interface HealingCost {
  wheat: number;
  wood: number;
  stone: number;
  mineral: number;
  gold: number;
}

const TIER_COST_BASE: Record<number, { resource: number; gold: number }> = {
  1: { resource: 12, gold: 0 },
  2: { resource: 24, gold: 2 },
  3: { resource: 42, gold: 3 },
  4: { resource: 280, gold: 140 },
  5: { resource: 280, gold: 140 },
};

function computeHealingCost(type: TroopType, tier: TroopTier, count: number): HealingCost {
  if (count <= 0) return { wheat: 0, wood: 0, stone: 0, mineral: 0, gold: 0 };
  const base = TIER_COST_BASE[tier] || TIER_COST_BASE[4];
  // Cavalry T4 special: 356 resources + 178 gold
  let resourceCost = base.resource;
  let goldCost = base.gold;
  if (type === TroopType.Cavalry && tier === TroopTier.T4) {
    resourceCost = 356;
    goldCost = 178;
  }
  const rCost = resourceCost * count;
  const gCost = goldCost * count;
  switch (type) {
    case TroopType.Infantry:
      return { wheat: rCost, wood: rCost, stone: 0, mineral: rCost, gold: gCost };
    case TroopType.Ranged:
      return { wheat: rCost, wood: rCost, stone: rCost, mineral: 0, gold: gCost };
    case TroopType.Cavalry:
      return { wheat: rCost, wood: 0, stone: rCost, mineral: rCost, gold: gCost };
    case TroopType.Siege:
      return { wheat: rCost, wood: rCost, stone: rCost, mineral: rCost, gold: gCost };
  }
}

function sumCost(a: HealingCost, b: HealingCost): HealingCost {
  return {
    wheat: a.wheat + b.wheat,
    wood: a.wood + b.wood,
    stone: a.stone + b.stone,
    mineral: a.mineral + b.mineral,
    gold: a.gold + b.gold,
  };
}

function computeTotalCost(troops: HospitalTroop[], field: 'injured' | 'healing'): HealingCost {
  let total: HealingCost = { wheat: 0, wood: 0, stone: 0, mineral: 0, gold: 0 };
  for (const t of troops) {
    total = sumCost(total, computeHealingCost(t.type, t.tier, t[field]));
  }
  return total;
}

export class HospitalState {
  troops: HospitalTroop[] = [];
  finishTimestamp = 0;
  totalHealingSeconds = 0;
  rawUnknown = 0;
  totalCost: HealingCost = { wheat: 0, wood: 0, stone: 0, mineral: 0, gold: 0 };
  healingCost: HealingCost = { wheat: 0, wood: 0, stone: 0, mineral: 0, gold: 0 };

  get isHealing(): boolean {
    return this.troops.some(t => t.healing > 0);
  }

  getInjured(type: TroopType, tier: TroopTier): number {
    return this.troops.find(t => t.type === type && t.tier === tier)?.injured ?? 0;
  }

  getHealing(type: TroopType, tier: TroopTier): number {
    return this.troops.find(t => t.type === type && t.tier === tier)?.healing ?? 0;
  }

  getTotalInjured(): number {
    let total = 0;
    for (const t of this.troops) total += t.injured;
    return total;
  }

  getTotalHealing(): number {
    let total = 0;
    for (const t of this.troops) total += t.healing;
    return total;
  }
}

const TYPE_ORDER = [
  TroopType.Infantry,
  TroopType.Ranged,
  TroopType.Cavalry,
  TroopType.Siege,
];

export function parseHospital(body: Buffer): HospitalState | null {
  if (body.length < 172) return null;

  const state = new HospitalState();
  let offset = 0;

  // 1. Leer 16 uint32 - tropas heridas T1-T4
  const injuredT1T4: number[] = [];
  for (let i = 0; i < 16; i++) {
    injuredT1T4.push(body.readUInt32LE(offset));
    offset += 4;
  }

  // 2. Leer 16 uint32 - tropas curándose T1-T4
  const healingT1T4: number[] = [];
  for (let i = 0; i < 16; i++) {
    healingT1T4.push(body.readUInt32LE(offset));
    offset += 4;
  }

  // 3. FinishTimestamp
  const finishTimestamp = body.readUInt32LE(offset);
  offset += 4;

  // 4. RawUnknown
  const rawUnknown = body.readUInt32LE(offset);
  offset += 4;

  // 5. TotalHealingSeconds
  const totalHealingSeconds = body.readUInt32LE(offset);
  offset += 4;

  // 6. Leer 4 uint32 - tropas heridas T5
  const injuredT5: number[] = [];
  for (let i = 0; i < 4; i++) {
    injuredT5.push(body.readUInt32LE(offset));
    offset += 4;
  }

  // 7. Leer 4 uint32 - tropas T5 curándose
  const healingT5: number[] = [];
  for (let i = 0; i < 4; i++) {
    healingT5.push(body.readUInt32LE(offset));
    offset += 4;
  }

  // Construir lista de tropas
  const troops: HospitalTroop[] = [];

  // T1-T4: 4 tipos × 4 tiers
  let idx = 0;
  for (const type of TYPE_ORDER) {
    for (let tierNum = 1; tierNum <= 4; tierNum++) {
      troops.push({
        type,
        tier: tierNum as TroopTier,
        injured: injuredT1T4[idx],
        healing: healingT1T4[idx],
      });
      idx++;
    }
  }

  // T5
  for (let i = 0; i < 4; i++) {
    troops.push({
      type: TYPE_ORDER[i],
      tier: TroopTier.T5,
      injured: injuredT5[i],
      healing: healingT5[i],
    });
  }

  state.troops = troops;
  state.finishTimestamp = finishTimestamp;
  state.rawUnknown = rawUnknown;
  state.totalHealingSeconds = totalHealingSeconds;
  state.totalCost = computeTotalCost(troops, 'injured');
  state.healingCost = computeTotalCost(troops, 'healing');

  return state;
}
