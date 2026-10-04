import './emojis.json'; // hace que tsc copie emojis.json a dist
import * as fs from 'fs';
import * as path from 'path';

/**
 * Emoticonos del chat.
 *
 * El wire usa el id de `EMOJI.txt` del cliente (`pagina*128 + n`):
 *   - 3003 (recibido): num8 = 109, msgLen = 4, payload = [u16 id][u16 idx]
 *   - 3001 (enviado):  [canal][0x6D][0x00][u16 4][u16 id][u16 idx]
 * El `idx` es el orden del emoji dentro de su pagina (EMOJI.txt +4).
 *
 * Los 40 basicos (paginas 0-4) no tienen item ni nombre en el cliente: van
 * en el JSON con `itemId: 0` (siempre disponibles) y `name: null`; los otros
 * 195 se desbloquean con su `itemId` en el inventario.
 * Regenerar: python backend/scripts/gen-emojis.py --gameassets <dir> --out <json>
 */
export interface EmojiDef {
  /** id que viaja por el wire */
  id: number;
  /** pagina del panel (0..24) */
  page: number;
  /** orden del emoji dentro de su pagina (segundo u16 del payload) */
  idx: number;
  w: number;
  h: number;
  /** item que lo desbloquea (Item.txt, u16@20 = este id) */
  itemId: number;
  name: string | null;
  nameEn: string | null;
}

interface EmojisDoc {
  source?: string;
  emojis?: EmojiDef[];
}

const DOC: EmojisDoc = (() => {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'emojis.json'), 'utf-8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
})();

export const EMOJIS: EmojiDef[] = Array.isArray(DOC.emojis) ? DOC.emojis : [];

export const EMOJI_BY_ID: Record<number, EmojiDef> = (() => {
  const out: Record<number, EmojiDef> = {};
  for (const e of EMOJIS) out[e.id] = e;
  return out;
})();

export function getEmoji(id: number): EmojiDef | undefined {
  return EMOJI_BY_ID[id];
}

/** Nombre (es) del emoji, con fallback para los que no tienen nombre. */
export function emojiName(id: number, english = false): string {
  const e = EMOJI_BY_ID[id];
  if (!e) return `Emoticono #${id}`;
  const name = english ? e.nameEn || e.name : e.name || e.nameEn;
  return name || `Emoticono #${id}`;
}

/** idx a mandar junto al id (orden del emoji en su pagina). */
export function emojiIdx(id: number): number {
  return EMOJI_BY_ID[id]?.idx ?? 0;
}

/**
 * ¿La cuenta puede usar este emoticono? Los basicos (`itemId: 0`) siempre;
 * el resto sólo si su item está en el inventario.
 */
export function emojiAvailable(e: EmojiDef, inventory?: Map<number, number> | null): boolean {
  return e.itemId === 0 || (inventory?.get(e.itemId) ?? 0) > 0;
}

/**
 * Emoticono aleatorio entre los que la cuenta tiene, para la mision diaria
 * de "enviar 1 emoticono". Sin `inventory` elige de cualquiera.
 */
export function randomEmoji(inventory?: Map<number, number> | null): EmojiDef | null {
  const pool = inventory ? EMOJIS.filter(e => emojiAvailable(e, inventory)) : EMOJIS;
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
