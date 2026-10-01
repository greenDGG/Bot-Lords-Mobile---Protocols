import { BUFF_DEFS, COSTUME_DEFS } from './data/costume-buffs';
import type { CostumeItem } from './parsers/costume.parser';

export interface CostumeStatItem {
  id: number;
  name: string;
  grade: number;
  value: number;
}

export interface CostumeStat {
  key: string;
  name: string;
  unit: string;
  total: number;
  count: number;
  costumes: CostumeStatItem[];
}

/**
 * Stats acumulados de los trajes equipados: agrupa por efecto (nombre + unidad)
 * y suma el valor del grade actual de cada traje equipado.
 */
export function computeCostumeStats(equipped: CostumeItem[] | undefined): CostumeStat[] {
  const map = new Map<string, CostumeStat>();
  if (!Array.isArray(equipped)) return [];

  for (const item of equipped) {
    const def = COSTUME_DEFS[item?.id];
    if (!def) continue;
    const grade = Math.max(1, Math.min(6, item.grade || 1));
    const buffs = def.buffs[grade] || def.buffs[1];
    if (!buffs) continue;

    for (const b of buffs) {
      if (!b.value) continue;
      const buffDef = BUFF_DEFS[b.buffId];
      const name = buffDef?.name || `Efecto ${b.buffId}`;
      const unit = buffDef?.unit || '';
      const key = `${name}|${unit}`;
      let entry = map.get(key);
      if (!entry) {
        entry = { key, name, unit, total: 0, count: 0, costumes: [] };
        map.set(key, entry);
      }
      entry.total += b.value;
      entry.count += 1;
      entry.costumes.push({ id: item.id, name: def.name, grade, value: b.value });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
