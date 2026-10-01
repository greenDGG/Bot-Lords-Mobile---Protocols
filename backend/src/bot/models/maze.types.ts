/**
 * Laberinto (proto 7004) — payload de 22 B, ver `docs/protocols/7004.md`.
 *
 * Cada golpe (7003) responde con un 7004. Layout de los kinds 00..03:
 *
 *   [0]     kind: 00 golpe · 01 ronda terminada · 02 gremblin aparece ·
 *                 03 gremblin se retira · 65 estrellas insuficientes ·
 *                 67 golpe duplicado
 *   [1]     tipo: 01 normal · 00 élite (x10)
 *   [2]     golpes de la ronda (1..10; 11..16 con gremblin activo)
 *   [3..6]  gemas u32 LE (0 sin gremblin; 300/400/500/600 con gremblin)
 *   [7..10] estrellas sagradas u32 LE (−100 golpe normal, −1000 élite)
 *   [11..14] sin identificar u32 LE (+9 por golpe habitual, por cuenta)
 *   [15..16] item id u16 LE
 *   [17]    cantidad (01 normal · 0b élite)
 *   [18]    siempre 00
 *   [19]    01 si el item es de la familia 4xxx, 00 si no
 *   [20]    tiradas gratis restantes (bendición divina): el golpe es gratis
 *           si el paquete ANTERIOR traía [20] > 0
 *   [21]    modo: 02 normal · 01 élite · 00 sin aclarar
 *
 * Los kinds 65/67 usan el byte [0] como código de error y NO siguen el
 * layout de arriba.
 */

export type MazeKindName =
  | 'golpe'
  | 'ronda'
  | 'gremblin'
  | 'retirada'
  | 'sin-estrellas'
  | 'duplicado'
  | 'desconocido';

export interface Maze7004 {
  kind: number;
  kindName: MazeKindName;
  /** true sólo para kinds 00..03: el resto de campos no aplica si es false */
  isHit: boolean;
  /** 01 normal · 00 élite */
  hitType: number | null;
  gol: number | null;
  gems: number | null;
  stars: number | null;
  unk1: number | null;
  itemId: number | null;
  qty: number | null;
  item4x: boolean | null;
  freeShots: number | null;
  mode: number | null;
  raw: string;
}

/** Longitud del body de todos los 7004 observados (Len=26 − header 4). */
export const MAZE_BODY_LEN = 22;

const HIT_KINDS: Record<number, MazeKindName> = {
  0: 'golpe',
  1: 'ronda',
  2: 'gremblin',
  3: 'retirada',
};

const ERROR_KINDS: Record<number, MazeKindName> = {
  0x65: 'sin-estrellas',
  0x67: 'duplicado',
};

/** Body → Maze7004. Devuelve null si el body no mide 22 B. */
export function parseMaze7004(buf: Buffer): Maze7004 | null {
  if (buf.length !== MAZE_BODY_LEN) return null;

  const kind = buf[0];
  const raw = buf.toString('hex');

  if (kind in HIT_KINDS) {
    return {
      kind,
      kindName: HIT_KINDS[kind],
      isHit: true,
      hitType: buf[1],
      gol: buf[2],
      gems: buf.readUInt32LE(3),
      stars: buf.readUInt32LE(7),
      unk1: buf.readUInt32LE(11),
      itemId: buf.readUInt16LE(15),
      qty: buf[17],
      item4x: buf[19] === 1,
      freeShots: buf[20],
      mode: buf[21],
      raw,
    };
  }

  return {
    kind,
    kindName: ERROR_KINDS[kind] ?? 'desconocido',
    isHit: false,
    hitType: null,
    gol: null,
    gems: null,
    stars: null,
    unk1: null,
    itemId: null,
    qty: null,
    item4x: null,
    freeShots: null,
    mode: null,
    raw,
  };
}
