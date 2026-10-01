import { BUFF_DEFS, COSTUME_DEFS, CostumeDef } from './costume-buffs';

/**
 * Costume Database — mapa de trajes (Lord Equipment) del juego.
 *
 * Datos reales: scripts/gen-costumes.py → data/costumes.json
 * (item → equipment_effect → effect, con stringtables del cliente).
 *
 * Formato de cada entrada:
 *   [id]: { id, name, buffs: { [grade]: [{ buffId: effectId, value }] } }
 *
 * Los valores son los del cliente (unidad '%' en centésimas: 640 = 6.40 %).
 */
export const COSTUME_DB: Record<number, CostumeDef> = COSTUME_DEFS;

export function getCostumeName(id: number): string {
  return COSTUME_DB[id]?.name || `Traje ${id}`;
}

export function getCostumeBuffs(id: number, grade: number): { buffName: string; value: number; unit: string }[] {
  const def = COSTUME_DB[id];
  if (!def) return [];
  const gradeBuffs = def.buffs[grade] || def.buffs[1];
  if (!gradeBuffs) return [];
  return gradeBuffs.map(b => {
    const buffDef = BUFF_DEFS[b.buffId];
    return {
      buffName: buffDef?.name || `Efecto ${b.buffId}`,
      value: b.value,
      unit: buffDef?.unit || '',
    };
  });
}
