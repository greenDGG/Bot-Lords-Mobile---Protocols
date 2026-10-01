import './costumes.json'; // hace que tsc copie costumes.json a dist
import * as fs from 'fs';
import * as path from 'path';
import { EFFECT_DEFS } from './effect-db';

export interface CostumeBuff {
  id: number;
  name: string;
  unit: string;
}

export interface CostumeGradeBuffs {
  [grade: number]: { buffId: number; value: number }[];
}

export interface CostumeDef {
  id: number;
  name: string;
  nameEn?: string;
  buffs: CostumeGradeBuffs;
}

interface CostumesDoc {
  source?: string;
  grade6Multiplier?: number;
  costumes?: Record<string, CostumeDef>;
}

/** costumes.json generado por scripts/gen-costumes.py desde Table.unity3d. */
const DOC: CostumesDoc = (() => {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'costumes.json'), 'utf-8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
})();

/** Multíplicador de grade 6 (Mítico) sobre el valor de grade 5. */
export const GRADE6_MULTIPLIER: number = DOC.grade6Multiplier || 1.4;

/**
 * effectId de traje -> { id, name, unit } (nombres reales del cliente).
 * El catálogo es único (effects.json, 550 ids); BUFF_DEFS lo expone con el
 * fallback de nombre para los ids sin texto en la tabla.
 */
export const BUFF_DEFS: Record<number, CostumeBuff> = (() => {
  const out: Record<number, CostumeBuff> = {};
  for (const [id, value] of Object.entries(EFFECT_DEFS)) {
    out[Number(id)] = { id: value.id, name: value.name || `Efecto ${id}`, unit: value.unit };
  }
  return out;
})();

/** Trajes por id, con los buffs de cada grade (1..6). */
export const COSTUME_DEFS: Record<number, CostumeDef> = (() => {
  const out: Record<number, CostumeDef> = {};
  for (const [key, value] of Object.entries(DOC.costumes || {})) {
    const id = Number(key);
    out[id] = { ...value, id };
  }
  return out;
})();
