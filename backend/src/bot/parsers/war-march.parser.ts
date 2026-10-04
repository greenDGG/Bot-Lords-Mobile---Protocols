/**
 * 2473 — confirmación del 2472 (envío de tropas a una agrupación/rally).
 * Ver `docs/protocols/2473.md` (15 muestras reales en `logs/`).
 *
 * Dos formas observadas:
 *   - `Len=5  body=03`            → rechazo (1 byte = código)
 *   - `Len=61/65 body=57/61 B`    → envío aceptado
 */

/** u16@0 sin determinar (observado 0x0000, 0x000f, 0x0100, 0x010f). */
const OFFSET_FLAGS = 0;
/** u32@2 inicio de la marcha (epoch s ≈ hora de RECV − 1). */
const OFFSET_START_TS = 2;
/** u32@6 siempre 0. */
const OFFSET_ZERO = 6;
/** u32@10 duración de la marcha en segundos. */
const OFFSET_DURATION = 10;
/** u64@14 timestamp cercano al inicio (13..74 s antes); se repite en el 2474. */
const OFFSET_ORDER_TS = 14;
/** u32@22 60 o 300 (¿ventana del rally?). */
const OFFSET_WINDOW = 22;
/** u16@26 / u16@28 pareados sin determinar. */
const OFFSET_PAIR_A = 26;
const OFFSET_PAIR_B = 28;
/** u32@30 30 o 35 (sin determinar). */
const OFFSET_FIELD30 = 30;
/** nombre 13 B ascii null-padded = líder de la agrupación (el mismo del 2472). */
const OFFSET_NAME = 36;
const NAME_SIZE = 13;
/** Cuerpo mínimo para leer todos los campos fijos (49 = fin del nombre). */
const MIN_DATA_SIZE = 49;

export interface WarMarchConfirm {
  /** false = rechazo o cuerpo no reconocido */
  ok: boolean;
  /** body de 1 B: código de rechazo (ej. 0x03) */
  code?: number;
  flags?: number;
  /** inicio de la marcha (epoch s) */
  startTs?: number;
  /** duración de la marcha (s) */
  durationSec?: number;
  /** u64@14 (epoch s) */
  orderTs?: number;
  windowSec?: number;
  pairA?: number;
  pairB?: number;
  unknown30?: number;
  /** líder de la agrupación destino */
  rallyLeader?: string;
  /** startTs + durationSec (epoch s): cuándo llega nuestra marcha */
  arrivalTs?: number;
}

function fail(body: Buffer): WarMarchConfirm {
  return { ok: false, code: body.length ? body.readUInt8(0) : -1 };
}

export function parse2473(body: Buffer): WarMarchConfirm {
  if (body.length < MIN_DATA_SIZE) return fail(body);

  const startTs = body.readUInt32LE(OFFSET_START_TS);
  const durationSec = body.readUInt32LE(OFFSET_DURATION);
  const name = body.toString('ascii', OFFSET_NAME, OFFSET_NAME + NAME_SIZE).replace(/\0+$/, '');

  if (startTs === 0 || durationSec === 0) return { ok: false };

  return {
    ok: true,
    flags: body.readUInt16LE(OFFSET_FLAGS),
    startTs,
    durationSec,
    orderTs: Number(body.readBigUInt64LE(OFFSET_ORDER_TS)),
    windowSec: body.readUInt32LE(OFFSET_WINDOW),
    pairA: body.readUInt16LE(OFFSET_PAIR_A),
    pairB: body.readUInt16LE(OFFSET_PAIR_B),
    unknown30: body.readUInt32LE(OFFSET_FIELD30),
    rallyLeader: name,
    arrivalTs: startTs + durationSec,
  };
}

/**
 * Estado de la marcha propia enviada a una agrupación (tras el 2473),
 * comparado contra el cierre de la agrupación (timeRemaining del 7315).
 */
export interface OwnWarMarch {
  /** índice de la agrupación en la lista de guerra (2478/6611/7315) */
  warIndex: number;
  rallyLeader: string;
  startTs: number;
  durationSec: number;
  arrivalTs: number;
  /** cierre de la agrupación (epoch s) = hora del cálculo + restante del 7315 */
  deadlineTs: number;
  /** segundos que falta acelerar (>0 = nuestra marcha llega tarde) */
  gapSec: number;
  /** true = no encontramos la agrupación en la lista (no se pudo comparar) */
  unknownWar?: boolean;
  at: Date;
}
