import { FAMILIAR_DEFS, SKILL_DEFS } from './data/familiars-db';
import type { FamiliarsData } from './models/familiars.types';

export interface FamiliarStatSkill {
  petId: number;
  petName: string;
  skillId: number;
  skillName: string;
  level: number;
  maxLevel: number;
  value: number;
}

export interface FamiliarStat {
  key: string;
  name: string;
  unit: string;
  total: number;
  count: number;
  skills: FamiliarStatSkill[];
}

/**
 * Stats del jugador por pasivas de monstruitos: cada skill type='passive' con
 * nivel >= 1 aporta el valor de su nivel actual, agrupado por efecto
 * (Effect.String_infoID + Effect.ValueID) con el mismo formato de key
 * (`${name}|${unit}`) que usan investigación y talentos, así se suman todos
 * en la misma fila del panel de stats.
 *
 * Escalas: los valores de PetSkillValue ya están en la escala nativa del stat
 * (unit 0 = % en centésimas, como los efectos de investigación; unit 1 =
 * cantidad entera). Los segundos (unit 2) se convierten a minutos cuando el
 * efecto mide en 'minutos' (skill73: 1800 s = 30 min).
 */
export function computeFamiliarStats(
  familiars: FamiliarsData | undefined,
): FamiliarStat[] {
  const map = new Map<string, FamiliarStat>();
  if (!familiars || !familiars.pets || !familiars.pets.length) return [];

  for (const pet of familiars.pets) {
    const def = FAMILIAR_DEFS[pet.petId];
    if (!def) continue;
    pet.skills.forEach((state, i) => {
      const skillId = (def.skills && def.skills[i]) || 0;
      const sd = skillId ? SKILL_DEFS[skillId] : undefined;
      if (!sd || sd.type !== 'passive' || !sd.values || !sd.values.length || !sd.effectText) return;
      const level = Math.min(state.level || 0, sd.values.length);
      if (level <= 0) return;
      const raw = sd.values[level - 1];
      if (!raw) return;
      const unit = (sd.effectUnit || '').trim();
      const value = sd.unit === 2 && /minuto/i.test(unit) ? Math.round(raw / 60) : raw;
      if (!value) return;
      const name = sd.effectText;
      const key = `${name}|${unit}`;
      let entry = map.get(key);
      if (!entry) {
        entry = { key, name, unit, total: 0, count: 0, skills: [] };
        map.set(key, entry);
      }
      entry.total += value;
      entry.count += 1;
      entry.skills.push({
        petId: pet.petId,
        petName: def.name,
        skillId,
        skillName: sd.name,
        level,
        maxLevel: sd.maxLevel,
        value,
      });
    });
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
