import './data/techs.json'; // hace que tsc copie techs.json a dist
import * as fs from 'fs';
import * as path from 'path';

/** Tope base de resistencia (sin ninguna investigación). */
export const RESISTENCIA_BASE = 120;

/** Efecto "Máxima RES +" (Max STA +): sube el tope de resistencia. */
export const RESISTENCIA_EFFECT_ID = 347;

interface TechEntry {
  name: string;
  effect: { id: number; name: string; unit: string; values: number[] };
}

const TECHS: Record<string, TechEntry> = (() => {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'techs.json'), 'utf-8'));
    return (raw && raw.techs) || {};
  } catch {
    return {};
  }
})();

/**
 * Bonificación al tope de resistencia que dan las investigaciones con el efecto
 * 347 (hoy sólo el tech 153 "Límite de Resistencia": +3/+6/+9/+13/+17/+22/+28/
 * +35/+43/+60 según nivel).
 */
export function computeResistenciaBonus(techLevels?: number[]): number {
  if (!Array.isArray(techLevels)) return 0;
  let bonus = 0;
  for (const key of Object.keys(TECHS)) {
    const t = TECHS[key];
    if (!t || !t.effect || t.effect.id !== RESISTENCIA_EFFECT_ID) continue;
    const id = Number(key);
    if (!Number.isFinite(id) || id < 1 || id > techLevels.length) continue;
    const level = techLevels[id - 1] || 0;
    if (level <= 0) continue;
    const values = t.effect.values;
    if (!Array.isArray(values) || values.length === 0) continue;
    bonus += values[Math.min(level, values.length) - 1] || 0;
  }
  return bonus;
}

/** Tope real de resistencia = 120 + bonificación de investigación. */
export function computeResistenciaMax(techLevels?: number[]): number {
  return RESISTENCIA_BASE + computeResistenciaBonus(techLevels);
}
