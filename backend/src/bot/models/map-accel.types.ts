import type { MapMarch } from './map-march.types';

/**
 * 2220 variante "aceleramiento" (record 0x12, 31 B): una marcha fue
 * acelerada con un item de velocidad. El body observado en logs es SIEMPRE
 * un record de 31 B suelto (Len=35), pero el parser recorre la pila de
 * records por si viniera apilado con una marcha.
 *
 * Framing (igual que todos los records 2220 salvo el 0x0f):
 *   [kind 1][serial u32 LE][4B ceros][u16 tamaño][payload]  …o no: el 0x12
 *   NO lleva el u16 de tamaño, es de 31 B fijos (igual que el 0x0f de 15 B).
 *
 *   [0]      0x12
 *   [1..4]   serial u32 LE (auto-incremental del servidor)
 *   [5..8]   00000000            ← validación
 *   [9..14]  BLOQUE 6 B = la misma clave que arranca el payload de la marcha
 *            (coordA 3B + coordB 3B). ES la clave foránea: identifica a qué
 *            marcha apunta este record (139/151 muestras casan con una marcha
 *            visible; 0/716 bloques de marcha se repiten → 1 record por marcha)
 *   [15..18] T u32 LE            ← referencia temporal (ver identidad abajo)
 *   [19..22] 00000000            ← validación (convención de timestamps)
 *   [23..26] f1 u32 LE           ← NUEVA LLEGADA = hora de RECV + f1
 *            (confirmado con el experimento del usuario: acel a las 03:46:09
 *            con f1=5 → el juego mostró llegada 03:46:14 = 03:46:09 + 5)
 *   [27..30] f2 u32 LE           ← identidad observada 147/151: f2 = RECV − T
 *            (es decir T + f1 + f2 = nueva llegada; f2 no aporta info nueva)
 *
 * Validaciones (sólo estructurales, sin reloj — el test replaya logs viejos):
 * ceros en [5..8] y [19..22], coordB gruesa (byte[14] == 0 en 151/151), T en
 * rango unix, f1/f2 ≤ 30 días. Un falso positivo metería una "aceleración"
 * fantasma, así que el parser sólo mira cuerpos de ≤ 500 B (nunca entregas).
 */
export const ACCEL_RECORD_SIZE = 31;
const ACCEL_KIND = 0x12;
/** Nunca se observó un record 0x12 en cuerpos grandes (entregas de mapa). */
const ACCEL_MAX_BODY = 500;

export interface MapAccel {
  /** u32 [1..4] serial del record (orden/duplicados) */
  serial: number;
  /** Hex 12 chars de [9..14]: clave foránea hacia la marcha acelerada */
  block: string;
  /** u32 [15..18] unix (T) — ver identidad f2 = RECV − T */
  t: number;
  /** u32 [23..26] segundos restantes tras acelerar → llegada = RECV + f1 */
  f1: number;
  /** u32 [27..30] = RECV − T (identidad observada) */
  f2: number;
}

export interface MapAccelHit {
  accel: MapAccel;
  /** Offset del record dentro del body */
  offset: number;
  /** Fin (exclusivo) del record: por ahí sigue el resto del body */
  end: number;
}

/**
 * Escanea la pila de records del body en busca de records 0x12 válidos.
 * Devuelve [] si el cuerpo no puede contenerlos (> 500 B) o si ningún record
 * pasa las validaciones.
 */
export function parseMapAccels(buf: Buffer): MapAccelHit[] {
  const out: MapAccelHit[] = [];
  if (buf.length < ACCEL_RECORD_SIZE || buf.length > ACCEL_MAX_BODY) return out;
  let off = 0;
  while (off + ACCEL_RECORD_SIZE <= buf.length) {
    const len = recordLenAt(buf, off);
    if (len === null) break;
    if (buf[off] === ACCEL_KIND && len === ACCEL_RECORD_SIZE) {
      const accel = readAccelAt(buf, off);
      if (accel) out.push({ accel, offset: off, end: off + ACCEL_RECORD_SIZE });
    }
    off += len;
  }
  return out;
}

/** Fin (exclusivo) del último record 0x12 → el resto del body se re-procesa. */
export function accelTailOffset(hits: MapAccelHit[]): number {
  return hits.length > 0 ? hits[hits.length - 1]!.end : 0;
}

/** Inicio del primer 0x12 → lo que venga antes (p.ej. una marcha) se procesa aparte. */
export function accelHeadOffset(hits: MapAccelHit[]): number {
  return hits.length > 0 ? hits[0]!.offset : 0;
}

/**
 * Longitud del record que empieza en `off` según el framing 2220
 * (sólo el 0x0f de 15 B y el 0x12 de 31 B son de tamaño fijo), o null si
 * el framing se rompe (cuerpo que no es una pila de records).
 */
function recordLenAt(buf: Buffer, off: number): number | null {
  const kind = buf[off];
  if (kind === undefined) return null;
  let len: number;
  if (kind === 0x0f) len = 15;
  else if (kind === ACCEL_KIND) len = ACCEL_RECORD_SIZE;
  else {
    if (off + 11 > buf.length) return null;
    len = 11 + buf.readUInt16LE(off + 9);
  }
  if (len < 11 || off + len > buf.length) return null;
  return len;
}

function readAccelAt(buf: Buffer, off: number): MapAccel | null {
  if (buf.readUInt32LE(off + 5) !== 0) return null;
  if (buf[off + 14] !== 0) return null; // coordB gruesa: b2 == 0 en 151/151
  if (buf.readUInt32LE(off + 19) !== 0) return null;
  const t = buf.readUInt32LE(off + 15);
  const f1 = buf.readUInt32LE(off + 23);
  const f2 = buf.readUInt32LE(off + 27);
  if (t < 1_600_000_000 || t > 2_000_000_000) return null;
  if (f1 > 30 * 24 * 3600 || f2 > 30 * 24 * 3600) return null;
  return {
    serial: buf.readUInt32LE(off + 1),
    block: buf.toString('hex', off + 9, off + 15),
    t,
    f1,
    f2,
  };
}

export type AccelOutcome =
  | 'no-march'   // ninguna marcha en mapMarches con ese bloque
  | 'stale'      // la marcha ya llegó (record viejo)
  | 'no-gain'    // la acel no adelanta la llegada conocida (preview/ráfaga)
  | 'applied';   // marcha.eta actualizada

export interface AccelResult {
  outcome: AccelOutcome;
  /** Llegada nueva (unix) cuando outcome === 'applied' */
  eta?: number;
  /** Llegada conocida antes de aplicar (unix) si había marcha */
  previous?: number;
}

/**
 * Aplica el record a su marcha: `eta = ahora + f1`, SIN RELOJ compartido con
 * el parser (el `now` lo pasa el caller para poder testear con logs viejos).
 *
 * Sólo se acepta si adelanta la llegada conocida (`eta < previous`): una
 * aceleración nunca retrasa. Esto descarta los records de ráfaga cuyo f1
 * viene más grande que la llegada ya conocida (el experimento del usuario
 * dejó claro además que el 2º record de la ráfaga no cambió la llegada).
 * Si `previous` ya pasó (marcha llegó), el record es viejo y se ignora.
 */
export function applyAccel(march: MapMarch | undefined, accel: MapAccel, now: number): AccelResult {
  if (!march) return { outcome: 'no-march' };
  const originalArrival = march.startTime + march.duration;
  const previous = march.eta ?? originalArrival;
  if (now >= previous) return { outcome: 'stale', previous };
  const eta = now + accel.f1;
  if (eta >= previous) return { outcome: 'no-gain', previous };
  march.eta = eta;
  march.acceleratedAt = now;
  return { outcome: 'applied', eta, previous };
}
