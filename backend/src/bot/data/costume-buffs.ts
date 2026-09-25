export interface CostumeBuff {
  id: number;
  name: string;
  unit: '%' | 'flat' | 'sec' | 'min';
}

export const BUFF_DEFS: Record<number, CostumeBuff> = {
  // Army stats
  1: { id: 1, name: 'ATK ejército', unit: '%' },
  2: { id: 2, name: 'DEF ejército', unit: '%' },
  3: { id: 3, name: 'HP ejército', unit: '%' },

  // Unit ATK
  10: { id: 10, name: 'ATK Infantería', unit: '%' },
  11: { id: 11, name: 'ATK Artillería', unit: '%' },
  12: { id: 12, name: 'ATK Caballería', unit: '%' },

  // Unit DEF
  20: { id: 20, name: 'DEF Infantería', unit: '%' },
  21: { id: 21, name: 'DEF Artillería', unit: '%' },
  22: { id: 22, name: 'DEF Caballería', unit: '%' },

  // Unit HP
  30: { id: 30, name: 'HP Infantería', unit: '%' },
  31: { id: 31, name: 'HP Artillería', unit: '%' },
  32: { id: 32, name: 'HP Caballería', unit: '%' },

  // Hero stats
  40: { id: 40, name: 'ATK Héroe', unit: '%' },
  41: { id: 41, name: 'DEF Héroe', unit: '%' },
  42: { id: 42, name: 'HP Héroe', unit: '%' },

  // Speed
  50: { id: 50, name: 'Vel. marcha', unit: '%' },
  51: { id: 51, name: 'Vel. recolección', unit: '%' },

  // Construction / Research / Training
  60: { id: 60, name: 'Vel. construcción', unit: '%' },
  61: { id: 61, name: 'Vel. investigación', unit: '%' },
  62: { id: 62, name: 'Vel. entrenamiento', unit: '%' },

  // Army capacity
  70: { id: 70, name: 'Cap. ejército', unit: 'flat' },

  // Resources
  80: { id: 80, name: 'Prod. trigo', unit: '%' },
  81: { id: 81, name: 'Prod. madera', unit: '%' },
  82: { id: 82, name: 'Prod. piedra', unit: '%' },
  83: { id: 83, name: 'Prod. mineral', unit: '%' },
  84: { id: 84, name: 'Prod. oro', unit: '%' },

  // Energy
  90: { id: 90, name: 'Ahorro energía caza', unit: '%' },
  91: { id: 91, name: 'Energía máx.', unit: 'flat' },

  // Monster damage
  100: { id: 100, name: 'Daño monstruos', unit: '%' },
};

export interface CostumeGradeBuffs {
  [grade: number]: { buffId: number; value: number }[];
}

export interface CostumeDef {
  id: number;
  name: string;
  buffs: CostumeGradeBuffs;
}
