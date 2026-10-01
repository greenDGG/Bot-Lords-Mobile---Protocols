import { computeResearchStats, ResearchStat } from '../research-stats';
import { computeCostumeStats, CostumeStat } from '../costume-stats';
import { computeBuildingStats, BuildingStat } from '../building-stats';
import { computeTalentStats, TalentStat } from '../talent-stats';
import type { CostumeItem } from '../parsers/costume.parser';

export interface StatItem {
  id: number;
  name: string;
  level?: number;
  value: number;
  /** Unidad del efecto ('' = entero, '%' = centésimas). Necesaria en stats combinados. */
  unit?: string;
}

/** Aporte de una fuente concreta a un stat (investigación, héroe, equipo, talentos, ...) */
export interface StatContribution {
  source: string;
  label: string;
  /** 'local' = solo aplica dentro del reino (producción/almacenamiento de construcciones) */
  scope?: 'local' | 'global';
  total: number;
  count: number;
  items: StatItem[];
  /** Unidad del aporte (puede diferir de la del stat cuando está combinado). */
  unit?: string;
}

/** Stat del jugador agregado de todas las fuentes */
export interface PlayerStat {
  key: string;
  name: string;
  unit: string;
  total: number;
  count: number;
  contributions: StatContribution[];
  /** Sólo en stats combinados: valor base sin el bonus porcentual. */
  baseTotal?: number;
  /** Sólo en stats combinados: bonus en centésimas (1750 = 17.5%). */
  bonusPct?: number;
}

function addContribution(stat: PlayerStat, c: StatContribution): void {
  stat.total += c.total;
  stat.count += c.count;
  stat.contributions.push(c);
}

/**
 * Stats del jugador: junta el aporte de todas las fuentes.
 * Hoy: investigación (la que más aporta), trajes equipados, construcciones y
 * talentos; el resto (héroe, gremio, ...) se suma acá.
 */
export function computePlayerStats(bot: {
  research?: { techLevels: number[] };
  equippedCostumes?: CostumeItem[];
  buildingState?: { buildings: { id: number; level: number }[] };
  talents?: { levels: number[] };
}): PlayerStat[] {
  const byKey = new Map<string, PlayerStat>();

  const ensure = (key: string, name: string, unit: string): PlayerStat => {
    let stat = byKey.get(key);
    if (!stat) {
      stat = { key, name, unit, total: 0, count: 0, contributions: [] };
      byKey.set(key, stat);
    }
    return stat;
  };

  const research: ResearchStat[] = computeResearchStats(bot.research?.techLevels || []);
  for (const r of research) {
    addContribution(ensure(r.key, r.name, r.unit), {
      source: 'research',
      label: 'Investigación',
      total: r.total,
      count: r.count,
      unit: r.unit,
      items: r.techs.map(t => ({ id: t.id, name: t.name, level: t.level, value: t.value, unit: r.unit })),
    });
  }

  const costumes: CostumeStat[] = computeCostumeStats(bot.equippedCostumes);
  for (const c of costumes) {
    addContribution(ensure(c.key, c.name, c.unit), {
      source: 'costume',
      label: 'Trajes',
      total: c.total,
      count: c.count,
      unit: c.unit,
      items: c.costumes.map(t => ({ id: t.id, name: t.name, level: t.grade, value: t.value, unit: c.unit })),
    });
  }

  const buildings: BuildingStat[] = computeBuildingStats(bot.buildingState?.buildings);
  for (const b of buildings) {
    addContribution(ensure(b.key, b.name, b.unit), {
      source: 'building',
      label: 'Construcciones',
      scope: b.scope,
      total: b.total,
      count: b.count,
      unit: b.unit,
      items: b.buildings.map(t => ({ id: t.id, name: t.name, level: t.level, value: t.value, unit: b.unit })),
    });
  }

  const talents: TalentStat[] = computeTalentStats(bot.talents);
  for (const t of talents) {
    addContribution(ensure(t.key, t.name, t.unit), {
      source: 'talent',
      label: 'Talentos',
      total: t.total,
      count: t.count,
      unit: t.unit,
      items: t.talents.map(x => ({ id: x.id, name: x.name, level: x.level, value: x.value, unit: t.unit })),
    });
  }

  return mergeFlatPercent(Array.from(byKey.values()));
}

/** Nombre del stat de capacidad de suministro (efectos 272 base + 378 %). */
export const SUPPLY_CAPACITY_STAT = 'Capacidad de suministro +';

/**
 * Capacidad de suministro por caravana = total del stat "Capacidad de
 * suministro +" (base de Puesto Comercial + investigación "Bolsas más
 * grandes", más el % si lo hay). 0 si aún no hay datos.
 */
export function getSupplyCapacity(stats?: PlayerStat[]): number {
  const stat = stats?.find(s => s.name === SUPPLY_CAPACITY_STAT);
  return stat && stat.total > 0 ? stat.total : 0;
}

/**
 * Une en una sola fila los stats que comparten nombre pero no unidad, cuando
 * exactamente uno es el valor base (sin unidad) y el resto son porcentaje.
 * Ej.: "Capacidad del cuartel +" = 25050 (cuarteles) + 17.5% (Expansión de
 * cuarteles I/II) → 29434, con `baseTotal` = 25050 y `bonusPct` = 1750.
 */
function mergeFlatPercent(stats: PlayerStat[]): PlayerStat[] {
  const byName = new Map<string, PlayerStat[]>();
  for (const s of stats) {
    const group = byName.get(s.name);
    if (group) group.push(s);
    else byName.set(s.name, [s]);
  }

  const out: PlayerStat[] = [];
  for (const group of byName.values()) {
    const flat = group.filter(s => s.unit === '');
    const pct = group.filter(s => s.unit === '%');
    if (flat.length === 1 && pct.length >= 1) {
      const base = flat[0];
      const bonusPct = pct.reduce((a, s) => a + s.total, 0);
      out.push({
        ...base,
        total: Math.round(base.total * (1 + bonusPct / 10000)),
        baseTotal: base.total,
        bonusPct,
        count: group.reduce((a, s) => a + s.count, 0),
        contributions: group.flatMap(s => s.contributions),
      });
    } else {
      out.push(...group);
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
