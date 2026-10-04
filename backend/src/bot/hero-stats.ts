import { HERO_DEFS } from './data/heros-db';
import { getEffect } from './data/effect-db';
import type { HeroEntry } from './models/heroes.types';

export interface HeroStatSkill {
  heroId: number;
  heroName: string;
  skillId: number;
  skillName: string;
  grade: number;
  value: number;
}

export interface HeroStat {
  key: string;
  name: string;
  unit: string;
  /** 'local' = sólo aplica dentro del reino (mismo criterio que effects.json). */
  scope?: 'local' | 'global';
  total: number;
  count: number;
  skills: HeroStatSkill[];
}

/**
 * Efectos de batalla: NO entran en Player Stats porque sólo rinden peleando
 * (tropas mandadas o al recibir ataque), igual que ve el jugador en el panel:
 * 201..218 = ATQ/DEF/PS de tropa y de ejército, 313 = DEF de muralla,
 * 456..458 = refuerzos entre tipos de tropa.
 */
const COMBAT_EFFECT_IDS: number[] = (() => {
  const ids: number[] = [];
  for (let id = 201; id <= 218; id++) ids.push(id);
  return ids.concat([313, 456, 457, 458]);
})();

/** Valor de la pasiva por grado del héroe: Blanco, Verde, Azul, Morado, Oro. */
const GRADE_MULT = [1, 2, 4, 8, 20];

/**
 * Stats del jugador por pasivas de héroes: cada battle skill con efecto no
 * bélico de cada héroe contratado aporta su valor escalado al grado actual.
 *
 * Ej.: Sabio de Viento con "Potenciador construcción" (value 1000 = 1 % en
 * Blanco) a Grado 5 (Oro) → 1000 × 20 / 10 = 2000 centésimas = 20 %.
 *
 * Escalas: skills.bytes guarda el valor en milésimas de % para unit '%' y en
 * entero para unit '' (energía); Player Stats trabaja en centésimas de % como
 * investigación/talentos/monstruitos, por eso se divide entre 10.
 */
export function computeHeroStats(heroes?: HeroEntry[]): HeroStat[] {
  const map = new Map<string, HeroStat>();
  if (!heroes || !heroes.length) return [];

  const seen = new Set<number>();
  for (const hero of heroes) {
    if (!hero || !hero.heroId || seen.has(hero.heroId)) continue;
    seen.add(hero.heroId);
    const def = HERO_DEFS[hero.heroId];
    if (!def) continue;
    const grade = Math.min(Math.max(hero.grade || 0, 1), GRADE_MULT.length);
    const mult = GRADE_MULT[grade - 1] || 1;
    for (const skill of def.battleSkills) {
      const effectId = skill.effectId || 0;
      const raw = skill.value || 0;
      if (!effectId || !raw || COMBAT_EFFECT_IDS.indexOf(effectId) >= 0) continue;
      const effect = getEffect(effectId);
      if (!effect || !effect.name) continue;
      const unit = effect.unit || '';
      const value = unit === '%' ? Math.round((raw * mult) / 10) : raw * mult;
      if (!value) continue;
      const key = `${effect.name}|${unit}`;
      let entry = map.get(key);
      if (!entry) {
        entry = {
          key,
          name: effect.name,
          unit,
          scope: effect.scope === 'local' ? 'local' : 'global',
          total: 0,
          count: 0,
          skills: [],
        };
        map.set(key, entry);
      }
      entry.total += value;
      entry.count += 1;
      entry.skills.push({
        heroId: hero.heroId,
        heroName: def.name,
        skillId: skill.id,
        skillName: skill.name,
        grade,
        value,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
