import { computeResearchStats, ResearchStat } from '../research-stats';
import { computeCostumeStats, CostumeStat } from '../costume-stats';
import { computeBuildingStats, BuildingStat } from '../building-stats';
import { computeTalentStats, TalentStat } from '../talent-stats';
import { computeFamiliarStats, FamiliarStat } from '../familiar-stats';
import { computeArtifactStats, ArtifactStat } from '../artifact-stats';
import { computeHeroStats, HeroStat } from '../hero-stats';
import { ENERGY_MAX_BASE } from '../energy';
import type { CostumeItem } from '../parsers/costume.parser';
import type { FamiliarsData } from '../models/familiars.types';
import type { ArtifactsData } from '../models/artifacts.types';
import type { HeroEntry } from '../models/heroes.types';

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
  /** Id del efecto del juego si se conoce (hoy sólo de investigación). */
  effectId?: number;
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
 * Hoy: investigación (la que más aporta), trajes equipados, construcciones,
 * talentos, pasivas de monstruitos, pasivas de héroes y artefactos; el resto
 * (gremio, ...) se suma acá.
 */
export function computePlayerStats(bot: {
  research?: { techLevels: number[] };
  equippedCostumes?: CostumeItem[];
  buildingState?: { buildings: { id: number; level: number }[] };
  talents?: { levels: number[] };
  familiars?: FamiliarsData;
  heroes?: HeroEntry[];
  artifacts?: ArtifactsData;
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
    const st = ensure(r.key, r.name, r.unit);
    st.effectId ??= r.effectId;
    addContribution(st, {
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

  const familiars: FamiliarStat[] = computeFamiliarStats(bot.familiars);
  for (const f of familiars) {
    addContribution(ensure(f.key, f.name, f.unit), {
      source: 'familiar',
      label: 'Monstruitos',
      total: f.total,
      count: f.count,
      unit: f.unit,
      items: f.skills.map(s => ({
        id: s.skillId,
        name: `${s.petName} · ${s.skillName}`,
        level: s.level,
        value: s.value,
        unit: f.unit,
      })),
    });
  }

  const heroes: HeroStat[] = computeHeroStats(bot.heroes);
  for (const h of heroes) {
    addContribution(ensure(h.key, h.name, h.unit), {
      source: 'hero',
      label: 'Héroes',
      scope: h.scope,
      total: h.total,
      count: h.count,
      unit: h.unit,
      items: h.skills.map(s => ({
        id: s.heroId,
        name: `${s.heroName} · ${s.skillName} (Grado ${s.grade})`,
        value: s.value,
        unit: h.unit,
      })),
    });
  }

  const artifacts: ArtifactStat[] = computeArtifactStats(bot.artifacts);
  for (const a of artifacts) {
    addContribution(ensure(a.key, a.name, a.unit), {
      source: 'artifact',
      label: 'Artefactos',
      total: a.total,
      count: a.count,
      unit: a.unit,
      items: a.artifacts.map(x => ({
        id: x.artifactId,
        name: x.name,
        level: x.level,
        value: x.value,
        unit: a.unit,
      })),
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

/** Nombre del stat de tope de energía (efecto 319 "Energía +"). */
export const ENERGY_CAP_STAT = 'Energía +';

/**
 * Tope de energía = 15000 de base + total del stat "Energía +" (investigación
 * "Límite de energía I/II/III" + pasivas de héroes tipo "Potenc. energía
 * máx."; si otra fuente aporta el mismo efecto, se suma sola).
 * Ej.: 83 nv10 + 84 nv10 = 22250 → 37250.
 */
export function getEnergyCap(stats?: PlayerStat[]): number {
  const stat = stats?.find(s => s.name === ENERGY_CAP_STAT);
  return ENERGY_MAX_BASE + (stat?.total || 0);
}

/** Nombre del stat de velocidad de entrenamiento (efecto "Vel. entrenamiento +"). */
export const TRAIN_SPEED_STAT = 'Vel. entrenamiento +';

/**
 * Velocidad de entrenamiento en % (35730 centésimas = 357.3%). Sale de todas
 * las fuentes (investigación + construcciones + talentos + héroes + artefactos).
 * 0 si aún no hay datos (no debería pasarse a calcTimeSeconds como negativo).
 */
export function getTrainSpeedPct(stats?: PlayerStat[]): number {
  const stat = stats?.find(s => s.name === TRAIN_SPEED_STAT);
  return stat && stat.total > 0 ? stat.total / 100 : 0;
}

/** Nombre del stat de capacidad de cuartel (efecto 266 + % "Expansión de cuarteles"). */
export const BARRACKS_CAPACITY_STAT = 'Capacidad del cuartel +';

/**
 * Capacidad del cuartel (pods máximos de la cola de entrenamiento) = total del
 * stat "Capacidad del cuartel +" (cuarteles + Expansión de cuarteles, ya
 * combinados por mergeFlatPercent). 0 si aún no hay datos de construcciones.
 */
export function getBarracksCapacity(stats?: PlayerStat[]): number {
  const stat = stats?.find(s => s.name === BARRACKS_CAPACITY_STAT);
  return stat && stat.total > 0 ? stat.total : 0;
}

/**
 * Efecto de subsidio por unidad (techs 95-114, efectos 280-295), indexado como
 * [tipo][tier]: 0=Infantería 1=Caballería 2=Artillería 3=Asedio, tiers 0-3.
 * Unidades de Lords Mobile (orden por tier):
 *   T1 Grunt/Archer/Cataphract/Ballista · T2 Gladiator/Sharpshooter/Reptilian Rider/Catapult
 *   T3 Royal Guard/Stealth Sniper/Royal Cavalry/Fire Trebuchet
 *   T4 Heroic Fighter/Heroic Cannoneer/Ancient Drake Rider/Destroyer
 */
const SUBSIDY_EFFECT_IDS: number[][] = [
  [280, 284, 288, 292], // Infantería
  [282, 286, 290, 294], // Caballería
  [281, 285, 289, 293], // Artillería (Range)
  [283, 287, 291, 295], // Asedio
];

/**
 * Reducción de coste de la unidad a entrenar en % (4000 centésimas = 40%).
 * Vienen sólo de investigación; sin datos devuelve 0 (coste completo).
 */
export function getSubsidyPct(stats: PlayerStat[] | undefined, troopType: number, tier: number): number {
  const effectId = SUBSIDY_EFFECT_IDS[troopType]?.[tier];
  if (effectId === undefined) return 0;
  const total = (stats || []).filter(s => s.effectId === effectId).reduce((sum, s) => sum + s.total, 0);
  return total > 0 ? total / 100 : 0;
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
