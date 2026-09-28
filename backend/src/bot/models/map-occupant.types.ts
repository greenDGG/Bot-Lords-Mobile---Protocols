import { decodeCoordId, encodeCoordId } from '../../models/map-coords';

/**
 * 2220 variante "ocupación de tile" (record 0x03): quién está parado en una
 * coordenada y cuánto recurso le queda al tile. En TODAS las muestras la coord
 * es un tile de recurso (types 1-5: Trigo/Piedra/Mineral/Madera/Oro), o sea que
 * el record es "actualización de tile de recurso: quién recolecta + restantes".
 * Nombre vacío = nadie visible recolectando (el tile sigue perdiendo cantidad).
 *
 * El body es una PILA de records con layout:
 *   [kind 1][serial u32][4 zeros][u16 tamaño][payload(tamaño)]
 * el único que NO lleva el u16 de tamaño es el 0x0f (15 B fijos).
 * Esta variante se reconoce porque el u16 del 0x03 es SIEMPRE 37
 * (= 48 - 11), o sea el record mide 48 B:
 *
 *   [0]      0x03
 *   [1..4]   serial u32 LE (auto-incremental del servidor)
 *   [5..8]   00000000
 *   [9..10]  u16 LE = 37 (tamaño del payload)
 *   [11..13] coord del tile (3 bytes, encodeCoord)
 *   [14..26] nombre 13 B null-terminated  → '' = sin ocupante visible
 *   [27..29] tag de gremio 3 B
 *   [30..31] reino u16 LE (0 cuando no hay ocupante)
 *   [32..35] u32 LE = RECURSOS RESTANTES del tile (CONFIRMADO: coincide al byte
 *            con `resource.amount` de las entregas de mapa; p.ej. 1575000 de un
 *            tile de Trigo y 1484108 cuando queda poco)
 *   [36..39] f32 LE SIN CONFIRMAR (0 sin ocupante; escala compatible con power o
 *            kills en millones, 0.12 … 403.79, pero varía para algunos jugadores)
 *   [40..43] u32 LE unix del update (0 cuando no hay ocupante)
 *   [44..47] siempre 00000000 (212/212 muestras)
 *
 * Body observados: 63 (0x0f + 0x03), 121/144/169 (1..3 records apilados) y
 * variantes con un 0x3f/0x0f adelante (78, 84, 105, 136, 142, 148, 151, 157).
 * Sin este parser los cuerpos de 63 B caían en 'delivery' y creaban un tile
 * fantasma en (64,0).
 */
export const OCCUPANT_RECORD_SIZE = 48;
const OCCUPANT_KIND = 0x03;
const OCCUPANT_PAYLOAD_SIZE = 37;
/** Nunca se observó un record 0x03 en cuerpos grandes (entregas de mapa). */
const OCCUPANT_MAX_BODY = 500;

export interface TileOccupant {
  x: number;
  y: number;
  /** encodeCoordId(x, y): clave de mapTiles */
  tileId: number;
  /** Jugador en el tile; '' = sin ocupante visible */
  name: string;
  guild: string;
  kingdom: number;
  /** u32 [32..35] recursos restantes del tile (confirmado contra resource.amount) */
  resourceAmount: number;
  /** f32 [36..39] sin confirmar (¿power del jugador en millones?) */
  unknownF32: number;
  /** u32 [40..43] unix del update; 0 si el tile quedó libre */
  time: number;
  /** u32 [1..4] serial del record (sirve para detectar orden/duplicados) */
  serial: number;
}

export interface TileOccupantHit {
  occupant: TileOccupant;
  /** Offset del record dentro del body */
  offset: number;
  /** Fin (exclusivo) del record: por ahí sigue el resto del body (p.ej. una marcha) */
  end: number;
}

/**
 * Escanea el body en busca de records 0x03 válidos.
 * Devuelve [] si el cuerpo no puede contenerlos (entregas grandes) o si no
 * pasa las validaciones (un falso positivo metería un tile fantasma en el mapa).
 */
export function parseTileOccupants(buf: Buffer): TileOccupantHit[] {
  const out: TileOccupantHit[] = [];
  if (buf.length < OCCUPANT_RECORD_SIZE || buf.length > OCCUPANT_MAX_BODY) return out;
  for (let off = 0; off + OCCUPANT_RECORD_SIZE <= buf.length; off++) {
    const occupant = readOccupantAt(buf, off);
    if (!occupant) continue;
    out.push({ occupant, offset: off, end: off + OCCUPANT_RECORD_SIZE });
    off += OCCUPANT_RECORD_SIZE - 1;
  }
  return out;
}

/** Último record del body → el resto (marcha, otro record…) se parsea aparte. */
export function occupantTailOffset(hits: TileOccupantHit[]): number {
  return hits.length > 0 ? hits[hits.length - 1]!.end : 0;
}

function readOccupantAt(buf: Buffer, off: number): TileOccupant | null {
  if (buf[off] !== OCCUPANT_KIND) return null;
  if (buf.readUInt16LE(off + 9) !== OCCUPANT_PAYLOAD_SIZE) return null;

  const id = (buf[off + 11]! << 16) | (buf[off + 12]! << 8) | buf[off + 13]!;
  const coord = decodeCoordId(id);
  if (coord.x > 8191 || coord.y > 8191) return null;

  const name = readName(buf, off + 14, 13);
  if (name === null) return null;

  const guild = readName(buf, off + 27, 3);
  if (guild === null) return null;

  const kingdom = buf.readUInt16LE(off + 30);
  const resourceAmount = buf.readUInt32LE(off + 32);
  const unknownF32 = buf.readFloatLE(off + 36);
  const time = buf.readUInt32LE(off + 40);
  if (!Number.isFinite(unknownF32) || unknownF32 < 0 || unknownF32 > 1e6) return null;
  if (buf.readUInt32LE(off + 44) !== 0) return null;

  if (name) {
    if (kingdom < 100 || kingdom > 4000) return null;
    if (time < 1_600_000_000) return null;
  } else {
    // Tile libre: en todas las muestras reino/time/f32 quedan en 0
    if (kingdom !== 0 || time !== 0 || unknownF32 !== 0) return null;
  }

  return {
    x: coord.x,
    y: coord.y,
    tileId: encodeCoordId(coord.x, coord.y),
    name,
    guild,
    kingdom,
    resourceAmount,
    unknownF32,
    time,
    serial: buf.readUInt32LE(off + 1),
  };
}

/**
 * C-string corto (nombre/guild) entre control: acepta ASCII imprimible y
 * bytes UTF-8 (>= 0x80), rechaza binario (bytes de control). Devuelve null si
 * el contenido no es texto.
 */
function readName(buf: Buffer, off: number, len: number): string | null {
  const slice = buf.subarray(off, off + len);
  let end = slice.indexOf(0);
  if (end < 0) end = len;
  for (let i = 0; i < end; i++) {
    const b = slice[i]!;
    if (b < 0x20 || b === 0x7f) return null;
  }
  if (end < len && slice.subarray(end).some(b => b !== 0)) return null;
  return slice.toString('utf8', 0, end).trim();
}
