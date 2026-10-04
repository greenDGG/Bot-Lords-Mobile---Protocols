import './data/techs.json'; // hace que tsc copie techs.json a dist
import * as fs from 'fs';
import * as path from 'path';

/**
 * Ritmo base de recuperación de energía: 1 punto cada 2 s = 0.5/s = 1800/h.
 * (Verificado: 0.5821/s medido ÷ 1.164 = 0.5/s exacto.)
 */
export const ENERGY_BASE_PER_SEC = 0.5;

/**
 * Efecto "Recuper. energía I/II" (id 317, aparece como "Reclu." en la tabla
 * de efectos): sube la tasa de recuperación en centésimas de % (1640 = 16.4%).
 */
export const ENERGY_REGEN_EFFECT_ID = 317;

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
 * Bonificación a la recuperación de energía (en centésimas de %) que dan las
 * investigaciones con el efecto 317. Hoy: "Recuperación de energía I" y "II".
 */
export function computeEnergyRegenBonusPct(techLevels?: number[]): number {
  return sumTechEffect(ENERGY_REGEN_EFFECT_ID, techLevels);
}

/**
 * Suma el valor del nivel actual de TODAS las investigaciones que tienen el
 * efecto dado (techs.json). 0 si no hay niveles cargados.
 */
function sumTechEffect(effectId: number, techLevels?: number[]): number {
  if (!Array.isArray(techLevels)) return 0;
  let total = 0;
  for (const key of Object.keys(TECHS)) {
    const t = TECHS[key];
    if (!t || !t.effect || t.effect.id !== effectId) continue;
    const id = Number(key);
    if (!Number.isFinite(id) || id < 1 || id > techLevels.length) continue;
    const level = techLevels[id - 1] || 0;
    if (level <= 0) continue;
    const values = t.effect.values;
    if (!Array.isArray(values) || values.length === 0) continue;
    total += values[Math.min(level, values.length) - 1] || 0;
  }
  return total;
}

/**
 * Tope de energía: 15000 de base + el stat "Energía +" (efecto 319, techs
 * "Límite de energía I/II/III"). Ej. de la cuenta real: 83 nv10 (9250) +
 * 84 nv10 (13000) = 22250 → tope 37250.
 */
export const ENERGY_MAX_BASE = 15000;
export const ENERGY_MAX_EFFECT_ID = 319;

export function computeEnergyMax(techLevels?: number[]): number {
  return ENERGY_MAX_BASE + sumTechEffect(ENERGY_MAX_EFFECT_ID, techLevels);
}

/**
 * Efecto "Ahorro de energía" (id 318, techs "Ahorro de energía I/II"):
 * reduce el costo por golpe de caza en centésimas de % (1600 = 16.0%).
 */
export const ENERGY_SAVER_EFFECT_ID = 318;

/**
 * Costo base de energía por golpe de caza según el nivel del monstruo
 * (Lords Mobile, wiki: 3000/5000/8000/14000/18000). Verificado contra una
 * cuenta con 31.95% de ahorro: nv1 2042, nv2 3403, nv3 5444, nv4 9527
 * (base × 0.6805 redondeado).
 */
export const HUNT_ENERGY_BASE: Record<number, number> = {
  1: 3000,
  2: 5000,
  3: 8000,
  4: 14000,
  5: 18000,
};

/**
 * Ahorro de energía (en centésimas de %) que dan las investigaciones con el
 * efecto 318. Hoy: "Ahorro de energía I" (tech 81) y "II" (tech 82).
 */
export function computeEnergySaverPct(techLevels?: number[]): number {
  return sumTechEffect(ENERGY_SAVER_EFFECT_ID, techLevels);
}

/**
 * Costo real de UN golpe de caza: base del nivel × (1 − ahorro de investigación).
 * Ej. con 31.95% de ahorro: nv1 → 2042, nv4 → 9527, nv5 → 12249.
 * Devuelve 0 si el nivel no está en la tabla (nivel desconocido = no cazar).
 */
export function computeHuntEnergyCost(level: number, techLevels?: number[]): number {
  const base = HUNT_ENERGY_BASE[level];
  if (!base) return 0;
  const saver = computeEnergySaverPct(techLevels);
  return Math.round(base * (1 - saver / 10000));
}

/** Recuperación de energía por hora con la investigación aplicada. */
export interface EnergyRegen {
  /** Ritmo actual por hora: basePerHour × (1 + bonusPct/10000). */
  perHour: number;
  /** Ritmo actual por segundo (perHour/3600). */
  perSec: number;
  /** Bonificación de investigación en centésimas (1640 = 16.4%). */
  bonusPct: number;
  /** Ritmo base por hora sin ninguna investigación (1800). */
  basePerHour: number;
}

/**
 * Recuperación de energía: 1800/h × (1 + bonus de investigación).
 * Ej.: con "Recuperación de energía I" nv8 (1640) → 2095/h (0.582/s).
 */
export function computeEnergyRegen(techLevels?: number[]): EnergyRegen {
  const bonusPct = computeEnergyRegenBonusPct(techLevels);
  const basePerHour = ENERGY_BASE_PER_SEC * 3600;
  const exactPerHour = basePerHour * (1 + bonusPct / 10000);
  return {
    perHour: Math.round(exactPerHour),
    perSec: Math.round((exactPerHour / 3600) * 10000) / 10000,
    bonusPct,
    basePerHour,
  };
}
