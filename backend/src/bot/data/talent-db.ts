import './talents.json'; // hace que tsc copie talents.json a dist
import * as fs from 'fs';
import * as path from 'path';
import { EFFECT_DEFS, EffectDef } from './effect-db';

export interface TalentBranch {
  id: number;
  /** columna del árbol (0..3): así las agrupa la pestaña Talentos */
  slot: number;
  name: string;
  count: number;
  talents: number[];
}

export interface TalentDef {
  id: number;
  name: string;
  nameEn?: string;
  /** rama = columna del árbol (0..3) */
  branch: number;
  /** fila 1..13 dentro de la rama */
  row: number;
  slot: number;
  /** banderas u16 del talenttree: sin descifrar */
  flags?: number;
  maxLevel: number;
  /** efecto que modifica (el mismo effectId en todos sus niveles) */
  effectId: number;
  /** valor total acumulado a cada nivel (no es un incremento) */
  levels: Record<number, number>;
}

interface TalentsDoc {
  source?: string;
  branches?: TalentBranch[];
  talents?: Record<string, TalentDef>;
}

/** talents.json generado por scripts/gen-talents.py desde Table.unity3d. */
const DOC: TalentsDoc = (() => {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'talents.json'), 'utf-8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
})();

/** Ramas del árbol (las 4 columnas de talenttree.bytes). */
export const BRANCHES: TalentBranch[] = (DOC.branches || []).map(b => ({
  ...b,
  talents: b.talents || [],
}));

/** effectId -> nombre/unidad/alcance: catálogo único de effects.json. */
export const TALENT_EFFECTS: Record<number, EffectDef> = EFFECT_DEFS;

/** Talentos por id, con todos sus niveles. */
export const TALENT_DB: Record<number, TalentDef> = (() => {
  const out: Record<number, TalentDef> = {};
  for (const [key, value] of Object.entries(DOC.talents || {})) {
    const id = Number(key);
    const levels: Record<number, number> = {};
    for (const [lvKey, lv] of Object.entries(value.levels || {})) {
      levels[Number(lvKey)] = lv;
    }
    out[id] = { ...value, id, levels };
  }
  return out;
})();

/** Cantidad de talentos que manda el cliente: define el largo del 3801. */
export const TALENT_COUNT = Object.keys(TALENT_DB).length;

export function getTalentDef(id: number): TalentDef | undefined {
  return TALENT_DB[id];
}

export function getTalentName(id: number): string {
  const def = TALENT_DB[id];
  return def?.name || `Talento ${id}`;
}

export function getTalentEffect(id: number): EffectDef | undefined {
  const def = TALENT_DB[id];
  return def ? TALENT_EFFECTS[def.effectId] : undefined;
}

/** Valor total del talento a ese nivel (0 si el talento está en 0 o fuera de rango). */
export function getTalentValue(id: number, level: number): number {
  const def = TALENT_DB[id];
  if (!def || level <= 0) return 0;
  return def.levels[level] || 0;
}

export function getTalentBranch(id: number): TalentBranch | undefined {
  const def = TALENT_DB[id];
  return def ? BRANCHES.find(b => b.id === def.branch) : undefined;
}
