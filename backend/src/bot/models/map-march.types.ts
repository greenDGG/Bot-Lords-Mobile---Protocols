import { decodeCoordId } from '../../models/map-coords';

/** Marcha visible en el mapa (proto 2220 variante march). */
export interface MapMarch {
  id: string;
  name: string;
  guild: string;
  /** Reino (uint16 LE, ej cf04 = 1231) */
  kingdom: number;
  origin: { x: number; y: number };
  destination: { x: number; y: number };
  /** Unix seconds */
  startTime: number;
  /** Segundos */
  duration: number;
  /** Progreso 0-1 al momento del parse */
  progress: number;
  /** Hex 12 chars del bloque de 6 bytes [11..17] del record: clave foránea
   *  que usa el record 0x12 (aceleramiento) para apuntar a esta marcha */
  block?: string;
  /** Llegada real (unix) tras una aceleración: si existe, manda sobre
   *  startTime + duration (ver map-accel.types.ts) */
  eta?: number;
  /** Unix de cuando se aplicó la aceleración */
  acceleratedAt?: number;
}

/**
 * Parser dedicado para la variante "march" de proto 2220.
 * Layout (muestra confirmada, 73 bytes):
 *   [0..8]    header 9B: kind 0x0E · serial u32 LE · 4B ceros
 *   [9..10]   u16 LE = 62 (tamaño del payload)
 *   [11..16]  BLOQUE 6 B = coordA 3B + coordB 3B — misma clave que arranca el
 *             payload de todos los records; el 0x12 (aceleramiento) lo repite
 *             para apuntar a esta marcha (ver map-accel.types.ts)
 *   [17..29]  nombre 13B null-terminated
 *   [30..32]  guild 3B
 *   [33..34]  reino 2B u16 LE (ej cf04 = 1231)
 *   [35..37]  origin coord 3B
 *   [38..40]  destination coord 3B
 *   [41..44]  startTime u32 LE
 *   [45..48]  00000000 — convención: todo timestamp u32 va seguido de 4 bytes en cero
 *   [49..52]  duration u32 LE
 *   [53..72]  datos 20B (SIN DESCIFRAR): 5×u32 LE = 0,0,N,0,0
 *
 * NO es múltiplo de 62 (formato tile). Devuelve null si no encaja.
 *
 * El header no tiene longitud fija: se observaron marchas con prefijo de
 * 17B (body de 73), 29B (85), 32B (88) y 47B (103) — un body puede traer
 * varias entradas apiladas (ej. 176 = 73 + 103). Por eso se prueban dos
 * anclas: el nombre de la PRIMERA entrada (offset 17 en los bodies de 73B)
 * y, si eso falla, el de la última (la cola fija de 56 bytes siempre cierra
 * el record: 88−56=32, 103−56=47).
 */
export function parseMapMarch(buf: Buffer): MapMarch | null {
  const off = marchNameOffset(buf);
  return off < 0 ? null : parseMarchAt(buf, off);
}

/**
 * Todas las marchas apiladas en el body: cada record cierra con la cola fija
 * de 56 bytes, así que el siguiente empieza justo después del del nombre.
 * Ejemplo real: 176B = record de 73 + record de 103.
 */
export function parseMapMarches(buf: Buffer): MapMarch[] {
  const out: MapMarch[] = [];
  let pos = 0;
  while (buf.length - pos >= 53) {
    const rest = buf.subarray(pos);
    const off = marchNameOffset(rest);
    if (off < 0) break;
    const march = parseMarchAt(rest, off);
    if (!march) break;
    out.push(march);
    const next = pos + off + 56;
    if (next <= pos) break;
    pos = next;
  }
  return out;
}

/** Offset del nombre de la primera marcha del body, o -1 si no encaja. */
function marchNameOffset(buf: Buffer): number {
  if (parseMarchAt(buf, 17)) return 17;
  const tailAnchor = buf.length - 56;
  if (tailAnchor > 17 && parseMarchAt(buf, tailAnchor)) return tailAnchor;
  return -1;
}

function parseMarchAt(buf: Buffer, nameOffset: number): MapMarch | null {
  if (buf.length < 53) return null;
  // Tiles/updates son múltiplos de 62; marchas observadas: 67/73/77
  if (buf.length % 62 === 0) return null;
  if (nameOffset < 0 || nameOffset + 21 > buf.length) return null;

  const nameEnd = buf.indexOf(0, nameOffset);
  const nameLimit = nameEnd >= 0 ? Math.min(nameEnd, nameOffset + 13) : nameOffset + 13;
  if (nameLimit <= nameOffset) return null;
  const name = buf.toString('utf8', nameOffset, nameLimit).trim();
  if (!name || !/^[\x20-\x7E]+$/.test(name)) return null;

  const guildOffset = nameOffset + 13;
  const guild = buf.toString('utf8', guildOffset, guildOffset + 3).replace(/\0/g, '').trim();

  const kingdomOffset = guildOffset + 3;
  const kingdom = buf.readUInt16LE(kingdomOffset);

  const afterGuild = kingdomOffset + 2;
  if (afterGuild + 12 > buf.length) return null;

  const originId = (buf[afterGuild]! << 16) | (buf[afterGuild + 1]! << 8) | buf[afterGuild + 2]!;
  const destOffset = afterGuild + 3;
  const destId = (buf[destOffset]! << 16) | (buf[destOffset + 1]! << 8) | buf[destOffset + 2]!;

  const origin = decodeCoordId(originId);
  const destination = decodeCoordId(destId);
  if (!isValidMapCoord(origin.x, origin.y) || !isValidMapCoord(destination.x, destination.y)) {
    return null;
  }

  const timeOffset = destOffset + 3;
  const startTime = buf.readUInt32LE(timeOffset);
  const durationOffset = timeOffset + 4 + 4; // skip padding
  if (durationOffset + 4 > buf.length) return null;
  const duration = buf.readUInt32LE(durationOffset);

  // Validaciones razonables para evitar falsos positivos en otros 2220
  if (duration <= 0 || duration > 30 * 24 * 3600) return null;
  if (startTime < 1_600_000_000 || startTime > 2_000_000_000) return null;

  const now = Math.floor(Date.now() / 1000);
  const elapsed = now - startTime;
  const progress = duration > 0 ? Math.min(1, Math.max(0, elapsed / duration)) : 0;

  const id = `${originId.toString(16)}_${destId.toString(16)}_${startTime}`;
  const block = readBlockHex(buf, nameOffset);
  return {
    id,
    name,
    guild,
    kingdom,
    origin: { x: origin.x, y: origin.y },
    destination: { x: destination.x, y: destination.y },
    startTime,
    duration,
    progress,
    ...(block ? { block } : {}),
  };
}

/**
 * Hex del bloque de 6 bytes [11..17] del record que contiene al nombre.
 * El record se localiza caminando el framing 2220 (id 9B + u16 tamaño), no
 * por aritmética con nameOffset: un body puede venir con un 0x0f de 15 B
 * adelante (88 B = 0x0f + marcha de 73), y ahí el bloque NO está en [11..17]
 * del body sino en 15 + 11. Devuelve null si el framing se rompe.
 */
function readBlockHex(buf: Buffer, nameOffset: number): string | null {
  let off = 0;
  while (off + 11 <= buf.length) {
    const kind = buf[off]!;
    let len: number;
    if (kind === 0x0f) len = 15;
    else if (kind === 0x12) len = 31;
    else len = 11 + buf.readUInt16LE(off + 9);
    if (len < 11 || off + len > buf.length) return null;
    if (nameOffset < off + len) {
      // Este record contiene al nombre: el bloque arranca en su payload (+11)
      if (kind === 0x0f || kind === 0x12 || off + 17 > buf.length) return null;
      if (buf.readUInt16LE(off + 9) < 6) return null;
      return buf.toString('hex', off + 11, off + 17);
    }
    off += len;
  }
  return null;
}

/** Heurística barata: ¿este 2220 parece una marcha (no tile)? */
export function isMapMarchPacket(buf: Buffer): boolean {
  return buf.length >= 53 && buf.length % 62 !== 0;
}

function isValidMapCoord(x: number, y: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x <= 65534 && y <= 65534;
}
