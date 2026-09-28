/**
 * Catálogo de monstruos por ID de especie.
 *
 * El id de 6 bytes del tile type 0x0a (proto 2220/2488) es
 *   [u16 id especie][00][u16 contador de aparición][10][00]
 * El u16[0] (LE) es el ID de especie: identifica QUÉ bicho es.
 *
 * `debilidad` dice con qué hex hay que golpearlo (config hunt.levels[].payloadHexMagia
 * o payloadHexFisico). Los IDs se cargaron mirando el mapa en el juego.
 */

export type HuntAttackType = 'magia' | 'fisico';

export interface MonsterInfo {
  /** u16[0] (LE) del id de 6 bytes del tile */
  id: number;
  nombre: string;
  /** tipo de ataque contra el que es débil; null = desconocido / no aplica */
  debilidad: HuntAttackType | null;
  /** no es monstruo (cofre de evento): nunca entra en la caza */
  cofre?: boolean;
}

export const MONSTERS: Record<number, MonsterInfo> = {
  8: { id: 8, nombre: 'Terrospín', debilidad: 'fisico' },
  10: { id: 10, nombre: 'Noceros', debilidad: 'magia' },
  15: { id: 15, nombre: 'Titán de Marea', debilidad: 'magia' },
  16: { id: 16, nombre: 'Bon Appeti', debilidad: 'fisico' },
  231: { id: 231, nombre: 'Bon Appeti especial de Astra', debilidad: 'fisico' },
  217: { id: 217, nombre: 'Cofre Carta de la Suerte', debilidad: null, cofre: true },
};

/** id de especie desde el id hex de 6 bytes del tile */
export function monsterIdFromHex(idHex: string): number | null {
  const clean = (idHex || '').replace(/\s/g, '');
  if (clean.length < 4 || clean.length % 2 !== 0) return null;
  const buf = Buffer.from(clean, 'hex');
  if (buf.length < 2) return null;
  return buf.readUInt16LE(0);
}

/** acepta el id numérico de especie o el id hex del tile */
export function getMonster(id: number | string): MonsterInfo | null {
  const key = typeof id === 'number' ? id : monsterIdFromHex(id);
  if (key === null) return null;
  return MONSTERS[key] ?? null;
}

export function getMonsterDebilidad(id: number | string): HuntAttackType | null {
  return getMonster(id)?.debilidad ?? null;
}

export function isMonsterChest(id: number | string): boolean {
  return getMonster(id)?.cofre === true;
}

/** nombre para logs; si no está en el catágo, dice el id */
export function monsterName(id: number | string): string {
  const info = getMonster(id);
  if (info) return info.nombre;
  const key = typeof id === 'number' ? id : monsterIdFromHex(id);
  return key === null ? 'monstruo' : `monstruo id ${key}`;
}
