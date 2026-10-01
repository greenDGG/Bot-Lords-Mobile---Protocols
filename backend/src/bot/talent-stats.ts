import { TALENT_DB, TALENT_EFFECTS } from './data/talent-db';

export interface TalentStatItem {
  id: number;
  name: string;
  level: number;
  maxLevel: number;
  branch: number;
  value: number;
}

export interface TalentStat {
  key: string;
  name: string;
  unit: string;
  total: number;
  count: number;
  talents: TalentStatItem[];
}

/**
 * Stats acumulados por talentos activos: agrupa por efecto (varios talentos
 * comparten effectId, p. ej. Vel. construcción I y II) y suma el valor del
 * nivel actual de cada talento.
 *
 * El valor de talentlv es el total a ese nivel (monotono), así que no hay que
 * acumular niveles: sólo se toma `levels[nivel]`. Los talentos en nivel 0 no
 * aportan nada.
 */
export function computeTalentStats(
  talents: { levels: number[] } | undefined,
): TalentStat[] {
  const map = new Map<string, TalentStat>();
  const levels = talents?.levels;
  if (!levels || !levels.length) return [];

  const items = Object.keys(TALENT_DB)
    .map(Number)
    .sort((a, b) => a - b);

  for (const id of items) {
    const def = TALENT_DB[id];
    const level = levels[id - 1] || 0;
    if (level <= 0) continue;
    const value = def.levels[level];
    if (!value) continue;
    const fx = TALENT_EFFECTS[def.effectId];
    const name = (fx && fx.name) || `Efecto ${def.effectId}`;
    const unit = (fx && fx.unit) || '';
    const key = `${name}|${unit}`;
    let entry = map.get(key);
    if (!entry) {
      entry = { key, name, unit, total: 0, count: 0, talents: [] };
      map.set(key, entry);
    }
    entry.total += value;
    entry.count += 1;
    entry.talents.push({
      id,
      name: def.name,
      level,
      maxLevel: def.maxLevel,
      branch: def.branch,
      value,
    });
  }

  for (const entry of map.values()) {
    entry.talents.sort(
      (a, b) => a.branch - b.branch || TALENT_DB[a.id].row - TALENT_DB[b.id].row,
    );
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
