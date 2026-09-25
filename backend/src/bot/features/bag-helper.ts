import itemsData from '../data/items.json';

type BagDefs = { wheat: [number, number][]; stone: [number, number][]; wood: [number, number][]; mineral: [number, number][]; gold: [number, number][] };
const BAG_ITEMS: BagDefs = itemsData.BAG_ITEMS as unknown as BagDefs;

const BAG_RESOURCE_MAP: Record<string, [number, number][]> = {
  wheat: BAG_ITEMS.wheat,
  stone: BAG_ITEMS.stone,
  wood: BAG_ITEMS.wood,
  mineral: BAG_ITEMS.mineral,
  gold: BAG_ITEMS.gold,
};

/** Retorna el valor total disponible en la bolsa para un tipo de recurso */
export function getBagTotalValue(inventory: Map<number, number>, resourceType: string): number {
  const defs = BAG_RESOURCE_MAP[resourceType];
  if (!defs) return 0;
  let total = 0;
  for (const [id, value] of defs) {
    const qty = inventory.get(id) || 0;
    total += qty * value;
  }
  return total;
}

function fillItems(defs: [number, number][], need: number, inventory: Map<number, number>, result: Array<[number, number]>): number {
  if (need === 0) return 0;
  const sorted = [...defs].sort((a, b) => b[1] - a[1]);
  let remaining = need;
  const used = new Map<number, number>();

  const avail = (id: number): number => Math.max(0, (inventory.get(id) || 0) - (used.get(id) || 0));

  for (const [id, value] of sorted) {
    if (remaining <= 0) break;
    const have = avail(id);
    if (have === 0) continue;
    if (value > remaining) continue;
    const useQty = Math.min(have, Math.floor(remaining / value));
    if (useQty > 0) {
      result.push([id, useQty]);
      used.set(id, (used.get(id) || 0) + useQty);
      remaining -= useQty * value;
    }
  }

  if (remaining > 0) {
    for (const [id, value] of [...sorted].reverse()) {
      if (remaining <= 0) break;
      const have = avail(id);
      if (have === 0) continue;
      const useQty = Math.min(have, Math.ceil(remaining / value));
      if (useQty > 0) {
        result.push([id, useQty]);
        used.set(id, (used.get(id) || 0) + useQty);
        remaining -= useQty * value;
      }
    }
  }

  return need - Math.max(0, remaining);
}

export function buildItemBytes(inventory: Map<number, number>, wheat: number, wood: number, stone: number, ore: number, gold: number): Buffer {
  const items: Array<[number, number]> = [];
  fillItems(BAG_ITEMS.wheat, wheat, inventory, items);
  fillItems(BAG_ITEMS.wood, wood, inventory, items);
  fillItems(BAG_ITEMS.stone, stone, inventory, items);
  fillItems(BAG_ITEMS.mineral, ore, inventory, items);
  fillItems(BAG_ITEMS.gold, gold, inventory, items);

  const map = new Map<number, number>();
  for (const [id, qty] of items) map.set(id, (map.get(id) || 0) + qty);
  const consolidated = Array.from(map.entries());

  if (consolidated.length === 0) return Buffer.alloc(0);

  const result = Buffer.alloc(consolidated.length * 4 + 2);
  for (let i = 0; i < consolidated.length; i++) {
    const [id, qty] = consolidated[i];
    result.writeUInt16LE(qty, i * 4);
    result.writeUInt16LE(id, i * 4 + 2);
  }
  result[result.length - 2] = 0x01;
  result[result.length - 1] = 0x00;
  return result;
}
