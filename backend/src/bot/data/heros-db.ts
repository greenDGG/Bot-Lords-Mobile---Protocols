import './heros.json'; // hace que tsc copie heros.json a dist
import * as fs from 'fs';
import * as path from 'path';

export interface HeroSkillInfo {
  id: number;
  name: string;
  nameEn: string;
  desc: string;
}

export interface HeroDef {
  id: number;
  name: string;
  nameEn: string;
  altName: string;
  skills: HeroSkillInfo[];
  battleSkills: HeroSkillInfo[];
}

interface HerosDoc {
  source?: string;
  count?: number;
  heroes?: Record<string, HeroDef>;
}

/**
 * Catálogo de héroes del cliente (heros.bytes + skills.bytes + stringtables,
 * filtrado por heroplaylist.bytes). heros.json generado por scripts/gen-heros.py.
 *
 * Sólo incluye los 95 héroes jugables con nombre; los ids sin fila quedan
 * fuera y los consumidores aplican su propio fallback (`Héroe #<id>`).
 */
const DOC: HerosDoc = (() => {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'heros.json'), 'utf-8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
})();

export const HERO_DEFS: Record<number, HeroDef> = (() => {
  const out: Record<number, HeroDef> = {};
  for (const [key, value] of Object.entries(DOC.heroes || {})) {
    const id = Number(key);
    out[id] = {
      ...value,
      id,
      name: value.name || '',
      nameEn: value.nameEn || '',
      altName: value.altName || '',
      skills: Array.isArray(value.skills) ? value.skills : [],
      battleSkills: Array.isArray(value.battleSkills) ? value.battleSkills : [],
    };
  }
  return out;
})();

export function getHero(id: number): HeroDef | undefined {
  return HERO_DEFS[id];
}

/** Nombre ES del héroe (fallback `Héroe #<id>`). */
export function heroName(id: number): string {
  return HERO_DEFS[id]?.name || `Héroe #${id}`;
}

/** Nombre EN del héroe (fallback: nombre ES o `Héroe #<id>`). */
export function heroNameEn(id: number): string {
  const def = HERO_DEFS[id];
  return def?.nameEn || def?.name || `Héroe #${id}`;
}

/** Habilidades activas del héroe (nombre ES/EN; sin las skill 1 sin nombre). */
export function heroSkills(id: number): HeroSkillInfo[] {
  return HERO_DEFS[id]?.skills || [];
}

/** Battle skills del héroe (u16[46..49] de heros.bytes; vacío si no tiene). */
export function heroBattleSkills(id: number): HeroSkillInfo[] {
  return HERO_DEFS[id]?.battleSkills || [];
}

/** ids con nombre (para combos/fallbacks que esperan un Record<number, string>). */
export const HERO_IDS: Record<number, string> = (() => {
  const out: Record<number, string> = {};
  for (const def of Object.values(HERO_DEFS)) {
    if (def.name) out[def.id] = def.name;
  }
  return out;
})();
