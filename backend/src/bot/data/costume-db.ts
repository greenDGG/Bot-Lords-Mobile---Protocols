import { CostumeDef } from './costume-buffs';

/**
 * Costume Database — Mapa de trajes del juego.
 *
 * Cada entrada: ID del traje → { name, buffs por grade }
 * Agregar trajes conforme se capturen del juego.
 *
 * Formato:
 *   [id decimal]: {
 *     id: [id decimal],
 *     name: 'Nombre del Traje',
 *     buffs: {
 *       [grade]: [
 *         { buffId: [buff def id], value: [valor] },
 *       ],
 *     },
 *   },
 */
export const COSTUME_DB: Record<number, CostumeDef> = {
  // === EJEMPLOS — reemplazar con datos reales ===
  4414: {
    id: 4414,
    name: 'Caballero Oscuro',
    buffs: {
      5: [
        { buffId: 1, value: 15 },
        { buffId: 2, value: 15 },
      ],
    },
  },
  4464: {
    id: 4464,
    name: 'Señor de la Guerra',
    buffs: {
      4: [
        { buffId: 10, value: 10 },
        { buffId: 20, value: 10 },
      ],
      5: [
        { buffId: 10, value: 15 },
        { buffId: 20, value: 15 },
      ],
    },
  },
  4715: {
    id: 4715,
    name: 'Explorador',
    buffs: {
      3: [
        { buffId: 50, value: 5 },
        { buffId: 51, value: 5 },
      ],
    },
  },
  4725: {
    id: 4725,
    name: 'Guardián',
    buffs: {
      3: [
        { buffId: 2, value: 10 },
        { buffId: 3, value: 10 },
      ],
    },
  },
  4746: {
    id: 4746,
    name: 'Maestro de Armas',
    buffs: {
      4: [
        { buffId: 1, value: 10 },
        { buffId: 10, value: 5 },
        { buffId: 11, value: 5 },
        { buffId: 12, value: 5 },
      ],
    },
  },
  4717: {
    id: 4717,
    name: 'Yelmo de Caza',
    buffs: {
      1: [
        { buffId: 90, value: 0.8 },
        { buffId: 91, value: 450 },
        { buffId: 100, value: 1.5 },
      ],
      2: [
        { buffId: 90, value: 1.35 },
        { buffId: 91, value: 900 },
        { buffId: 100, value: 2.5 },
      ],
      3: [
        { buffId: 90, value: 2 },
        { buffId: 91, value: 1400 },
        { buffId: 100, value: 4 },
      ],
      4: [
        { buffId: 90, value: 3 },
        { buffId: 91, value: 1950 },
        { buffId: 100, value: 6 },
      ],
      5: [
        { buffId: 90, value: 5 },
        { buffId: 91, value: 3000 },
        { buffId: 100, value: 10 },
      ],
      6: [
        { buffId: 90, value: 7 },
        { buffId: 91, value: 4200 },
        { buffId: 100, value: 14 },
      ],
    },
  },
  4760: {
    id: 4760,
    name: 'Puño de Dragón',
    buffs: {
      1: [
        { buffId: 12, value: 3.5 },
        { buffId: 3, value: 3.2 },
      ],
      2: [
        { buffId: 12, value: 6.85 },
        { buffId: 3, value: 6.2 },
      ],
      3: [
        { buffId: 12, value: 10.35 },
        { buffId: 3, value: 9.4 },
      ],
      4: [
        { buffId: 12, value: 14 },
        { buffId: 3, value: 13 },
      ],
      5: [
        { buffId: 12, value: 22 },
        { buffId: 3, value: 20 },
      ],
      6: [
        { buffId: 12, value: 30.8 },
        { buffId: 3, value: 28 },
      ],
    },
  },
  4792: {
    id: 4792,
    name: 'Zancada de Campeonato',
    buffs: {
      1: [
        { buffId: 12, value: 6.4 },
        { buffId: 1, value: 1.5 },
        { buffId: 3, value: 3.5 },
        { buffId: 50, value: 8 },
      ],
      2: [
        { buffId: 12, value: 12.4 },
        { buffId: 1, value: 2.5 },
        { buffId: 3, value: 6.85 },
        { buffId: 50, value: 15.5 },
      ],
      3: [
        { buffId: 12, value: 18.8 },
        { buffId: 1, value: 4 },
        { buffId: 3, value: 10.35 },
        { buffId: 50, value: 23.5 },
      ],
      4: [
        { buffId: 12, value: 26 },
        { buffId: 1, value: 6 },
        { buffId: 3, value: 14 },
        { buffId: 50, value: 31.5 },
      ],
      5: [
        { buffId: 12, value: 40 },
        { buffId: 1, value: 10 },
        { buffId: 3, value: 22 },
        { buffId: 50, value: 50 },
      ],
      6: [
        { buffId: 12, value: 56 },
        { buffId: 1, value: 14 },
        { buffId: 3, value: 30.8 },
        { buffId: 50, value: 70 },
      ],
    },
  },
  // TODO: agregar valores por grade
  4794: {
    id: 4794,
    name: 'Terremoto',
    buffs: {
      1: [{ buffId: 90, value: 0 }, { buffId: 91, value: 0 }, { buffId: 100, value: 0 }, { buffId: 50, value: 0 }],
      2: [{ buffId: 90, value: 0 }, { buffId: 91, value: 0 }, { buffId: 100, value: 0 }, { buffId: 50, value: 0 }],
      3: [{ buffId: 90, value: 0 }, { buffId: 91, value: 0 }, { buffId: 100, value: 0 }, { buffId: 50, value: 0 }],
      4: [{ buffId: 90, value: 0 }, { buffId: 91, value: 0 }, { buffId: 100, value: 0 }, { buffId: 50, value: 0 }],
      5: [{ buffId: 90, value: 0 }, { buffId: 91, value: 0 }, { buffId: 100, value: 0 }, { buffId: 50, value: 0 }],
      6: [{ buffId: 90, value: 0 }, { buffId: 91, value: 0 }, { buffId: 100, value: 0 }, { buffId: 50, value: 0 }],
    },
  },
  // TODO: agregar valores por grade
  4747: {
    id: 4747,
    name: 'Guardián Rayo',
    buffs: {
      1: [{ buffId: 84, value: 0 }, { buffId: 60, value: 0 }, { buffId: 51, value: 0 }],
      2: [{ buffId: 84, value: 0 }, { buffId: 60, value: 0 }, { buffId: 51, value: 0 }],
      3: [{ buffId: 84, value: 0 }, { buffId: 60, value: 0 }, { buffId: 51, value: 0 }],
      4: [{ buffId: 84, value: 0 }, { buffId: 60, value: 0 }, { buffId: 51, value: 0 }],
      5: [{ buffId: 84, value: 0 }, { buffId: 60, value: 0 }, { buffId: 51, value: 0 }],
      6: [{ buffId: 84, value: 0 }, { buffId: 60, value: 0 }, { buffId: 51, value: 0 }],
    },
  },
};

export function getCostumeName(id: number): string {
  return COSTUME_DB[id]?.name || `Traje ${id}`;
}

export function getCostumeBuffs(id: number, grade: number): { buffName: string; value: number; unit: string }[] {
  const def = COSTUME_DB[id];
  if (!def) return [];
  const gradeBuffs = def.buffs[grade];
  if (!gradeBuffs) return [];
  const { BUFF_DEFS } = require('./costume-buffs');
  return gradeBuffs.map(b => {
    const buffDef = BUFF_DEFS[b.buffId];
    return {
      buffName: buffDef?.name || `Buff ${b.buffId}`,
      value: b.value,
      unit: buffDef?.unit || '',
    };
  });
}
