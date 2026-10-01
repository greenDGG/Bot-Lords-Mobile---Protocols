import './buildings.json'; // hace que tsc copie buildings.json a dist
import * as fs from 'fs';
import * as path from 'path';
import { EFFECT_DEFS, EffectDef } from './effect-db';

export type BuildingCostKey = 'food' | 'stone' | 'timber' | 'ore' | 'gold';

export interface BuildingEffectRef {
  id: number;
  value: number;
}

export interface BuildingLevel {
  /** segundos hasta completar la subida a este nivel */
  time: number;
  costs: Record<BuildingCostKey, number>;
  might: number;
  effects: BuildingEffectRef[];
}

export interface BuildingDef {
  id: number;
  /** etiqueta visible (la que ya usa el frontend) */
  name: string;
  /** nombre en español del cliente (fallback para ids sin etiqueta propia) */
  nameTable?: string;
  nameTableEn?: string;
  maxLevel: number;
  /**
   * true = sus efectos no son pasivos: el cliente los describe como
   * potenciadores temporales (p. ej. el Altar, que sólo se aplican al
   * ejecutar a un líder capturado). No se cuentan en Player Stats.
   */
  temporal?: boolean;
  levels: Record<number, BuildingLevel>;
}

export type BuildingEffectDef = EffectDef;

interface BuildingsDoc {
  source?: string;
  costKeys?: string[];
  buildings?: Record<string, BuildingDef>;
}

/** buildings.json generado por scripts/gen-buildings.py desde Table.unity3d. */
const DOC: BuildingsDoc = (() => {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'buildings.json'), 'utf-8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
})();

/** Orden de los costos: [comida, piedra, madera, mineral, oro]. */
export const COST_KEYS: BuildingCostKey[] = (DOC.costKeys as BuildingCostKey[]) || [
  'food',
  'stone',
  'timber',
  'ore',
  'gold',
];

export const COST_LABELS: Record<BuildingCostKey, string> = {
  food: 'Comida',
  stone: 'Piedra',
  timber: 'Madera',
  ore: 'Mineral',
  gold: 'Oro',
};

/**
 * effectId -> nombre/unidad/alcance: catálogo único de effects.json
 * (ver effect-db.ts). Los ids sin nombre en la tabla quedan con name vacío;
 * building-stats.ts aplica el fallback.
 */
export const BUILDING_EFFECTS: Record<number, BuildingEffectDef> = EFFECT_DEFS;

/** Construcciones por id, con todos sus niveles. */
export const BUILDING_DB: Record<number, BuildingDef> = (() => {
  const out: Record<number, BuildingDef> = {};
  for (const [key, value] of Object.entries(DOC.buildings || {})) {
    const id = Number(key);
    const levels: Record<number, BuildingLevel> = {};
    for (const [lvKey, lv] of Object.entries(value.levels || {})) {
      levels[Number(lvKey)] = lv;
    }
    out[id] = { ...value, id, levels, maxLevel: value.maxLevel || 0 };
  }
  return out;
})();

export function getBuildingName(id: number): string {
  const def = BUILDING_DB[id];
  return def?.name || def?.nameTable || `ID ${id}`;
}

export function getBuildingEffect(id: number): BuildingEffectDef | undefined {
  return BUILDING_EFFECTS[id];
}

export function getBuildingLevel(id: number, level: number): BuildingLevel | null {
  return BUILDING_DB[id]?.levels[level] || null;
}

/** Nivel siguiente a `level` (costo/tiempo/poder de la subida), o null si está al tope. */
export function getNextLevel(id: number, level: number): { level: number; data: BuildingLevel } | null {
  const def = BUILDING_DB[id];
  if (!def) return null;
  const next = def.levels[level + 1];
  return next ? { level: level + 1, data: next } : null;
}
