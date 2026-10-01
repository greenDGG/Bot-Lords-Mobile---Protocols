import './effects.json'; // hace que tsc copie effects.json a dist
import * as fs from 'fs';
import * as path from 'path';

/**
 * Alcance de un efecto:
 *  - 'local'  = sólo aplica dentro del reino (producción/almacenamiento de
 *               construcciones); en Player Stats se marca con el badge "Reino".
 *  - 'global' = afecta al jugador en cualquier parte (combate, investigación, ...).
 */
export interface EffectDef {
  id: number;
  name: string;
  nameEn?: string;
  /** '%' en centésimas (2000 = 20.00 %); vacío = valor entero */
  unit: string;
  scope: 'local' | 'global';
}

interface EffectsDoc {
  source?: string;
  effects?: Record<string, EffectDef>;
}

/**
 * Catálogo único de efectos del cliente (effect.bytes + stringtables).
 * effects.json generado por scripts/gen-effects.py; lo consumen
 * costume-buffs.ts (BUFF_DEFS) y building-db.ts (BUILDING_EFFECTS).
 *
 * Algunos ids de la tabla no tienen nombre (no los usa nadie): quedan con
 * name vacío y los consumidores aplican su propio fallback.
 */
const DOC: EffectsDoc = (() => {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'effects.json'), 'utf-8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
})();

export const EFFECT_DEFS: Record<number, EffectDef> = (() => {
  const out: Record<number, EffectDef> = {};
  for (const [key, value] of Object.entries(DOC.effects || {})) {
    const id = Number(key);
    out[id] = { ...value, id, unit: value.unit || '', scope: value.scope || 'global' };
  }
  return out;
})();

export function getEffect(id: number): EffectDef | undefined {
  return EFFECT_DEFS[id];
}
