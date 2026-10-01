import { BUILDING_DB, BUILDING_EFFECTS } from './data/building-db';

export interface BuildingStatItem {
  id: number;
  name: string;
  level: number;
  value: number;
}

export interface BuildingStat {
  key: string;
  name: string;
  unit: string;
  scope: 'local' | 'global';
  total: number;
  count: number;
  buildings: BuildingStatItem[];
}

/**
 * Stats acumulados por construcción: agrupa por efecto (nombre + unidad) y suma
 * el valor del nivel actual de cada edificio (uno por item: puede haber varias
 * construcciones del mismo tipo).
 *
 * El valor de buildup_new_m es el total del edificio a ese nivel (no un
 * incremento), así que no hay que acumular niveles. Los efectos con valor 0
 * (desbloqueos) se descartan.
 *
 * Las construcciones `temporal` (Altar) se omiten: sus efectos sólo se aplican
 * al ejecutar a un líder capturado, no son un bonus pasivo.
 */
export function computeBuildingStats(
  buildings: { id: number; level: number }[] | undefined,
): BuildingStat[] {
  const map = new Map<string, BuildingStat>();
  if (!Array.isArray(buildings)) return [];

  for (const b of buildings) {
    if (!b || b.level <= 0) continue;
    const def = BUILDING_DB[b.id];
    if (!def || def.temporal) continue;
    const lvl = def.levels[b.level];
    if (!lvl) continue;

    for (const ref of lvl.effects) {
      if (!ref.value) continue;
      const fx = BUILDING_EFFECTS[ref.id];
      if (!fx) continue;
      const name = fx.name || `Efecto ${ref.id}`;
      const unit = fx.unit || '';
      const key = `${name}|${unit}`;
      let entry = map.get(key);
      if (!entry) {
        entry = { key, name, unit, scope: fx.scope || 'global', total: 0, count: 0, buildings: [] };
        map.set(key, entry);
      }
      entry.total += ref.value;
      entry.count += 1;
      entry.buildings.push({ id: b.id, name: def.name, level: b.level, value: ref.value });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
