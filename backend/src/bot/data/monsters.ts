/**
 * Catálogo de monstruos por ID de especie.
 *
 * Fuente: `monsters-data.json`, generado por `scripts/gen-monsters.py` desde
 * `monster.bytes` + stringtables del cliente (Manual de monstruos).
 *
 * El id de 6 bytes del tile type 0x0a (proto 2220/2488) es
 *   [u16 id especie][00][u16 contador de aparición][10][00]
 * El u16[0] (LE) es el ID de especie: identifica QUÉ bicho es.
 *
 * `debilidad` dice con QUÉ hex hay que golpearlo (config hunt.levels[].payloadHexMagia
 * o payloadHexFisico). Sale de la columna de defensa del manual:
 *   "DEFF alta" → magia · "DEFM alta" → fisico · "Físico y mágico" → null
 * (null = sin debilidad marcada: getHuntPayloadHex cae al payload legacy).
 *
 * `heroes` / `heroesP2p` (nivel → 5 ids de héroes) salen de huntData.json:
 * escuadra recomendada por especie y nivel. Si el bot tiene los 5, la runtime
 * ataca con esa escuadra; si no, usa `debilidad` (ver hunt-squad.ts).
 */
import './monsters-data.json'; // hace que tsc copie monsters-data.json a dist
import * as fs from 'fs';
import * as path from 'path';

export type HuntAttackType = 'magia' | 'fisico';

export interface MonsterInfo {
  /** u16[0] (LE) del id de 6 bytes del tile */
  id: number;
  nombre: string;
  /** tipo de ataque contra el que es débil; null = desconocido / no aplica */
  debilidad: HuntAttackType | null;
  /** no es monstruo (cofre de evento): nunca entra en la caza */
  cofre?: boolean;
  /** huntData: escuadra recomendada (nivel → 5 ids de héroes) */
  heroes?: Record<string, number[]>;
  /** huntData: escuadra recomendada alternativa (pay-to-play) */
  heroesP2p?: Record<string, number[]>;
}

interface MonstersEntry {
  id?: number;
  nombre?: string;
  debilidad?: HuntAttackType | null;
  cofre?: boolean;
  heroes?: Record<string, number[]>;
  heroesP2p?: Record<string, number[]>;
}

interface MonstersDoc {
  source?: string;
  rule?: string;
  count?: number;
  monsters?: Record<string, MonstersEntry>;
}

const DOC: MonstersDoc = (() => {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'monsters-data.json'), 'utf-8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
})();

export const MONSTERS: Record<number, MonsterInfo> = (() => {
  const out: Record<number, MonsterInfo> = {};
  for (const [key, value] of Object.entries(DOC.monsters || {})) {
    const id = Number(key);
    if (!Number.isInteger(id) || !value) continue;
    out[id] = {
      id: value.id ?? id,
      nombre: value.nombre || '',
      debilidad: value.debilidad === 'magia' || value.debilidad === 'fisico' ? value.debilidad : null,
      ...(value.cofre ? { cofre: true } : {}),
      ...(value.heroes ? { heroes: value.heroes } : {}),
      ...(value.heroesP2p ? { heroesP2p: value.heroesP2p } : {}),
    };
  }
  return out;
})();

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

export interface MonsterSquad {
  /** nivel de huntData usado (si el nivel del tile no existe, el más cercano) */
  nivel: number;
  /** escuadra recomendada (5 ids) */
  heroes: number[];
  /** escuadra recomendada alternativa P2P (5 ids) */
  p2p: number[];
}

/**
 * Escuadra recomendada para (monstruo, nivel) según huntData.
 * Usa el nivel exacto o, si no existe, el nivel disponible más cercano
 * (prefiere 1..5 sobre el '0' de los bichos de evento). null = sin datos.
 */
export function getMonsterSquad(id: number | string, level: number): MonsterSquad | null {
  const info = getMonster(id);
  if (!info) return null;
  const heroesDoc = info.heroes;
  const p2pDoc = info.heroesP2p;
  if (!heroesDoc && !p2pDoc) return null;
  const niveles = new Set([...Object.keys(heroesDoc || {}), ...Object.keys(p2pDoc || {})]);
  if (!niveles.size) return null;
  let key = String(level);
  if (!niveles.has(key)) {
    key = [...niveles].sort((a, b) => {
      const d = Math.abs(Number(a) - level) - Math.abs(Number(b) - level);
      if (d) return d;
      return (a === '0' ? 1 : 0) - (b === '0' ? 1 : 0);
    })[0];
  }
  const heroes = heroesDoc?.[key] ?? [];
  const p2p = p2pDoc?.[key] ?? [];
  if (!heroes.length && !p2p.length) return null;
  return { nivel: Number(key), heroes, p2p };
}

/** nombre para logs; si no está en el catálogo, dice el id */
export function monsterName(id: number | string): string {
  const info = getMonster(id);
  if (info) return info.nombre;
  const key = typeof id === 'number' ? id : monsterIdFromHex(id);
  return key === null ? 'monstruo' : `monstruo id ${key}`;
}
