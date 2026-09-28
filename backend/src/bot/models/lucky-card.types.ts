import { bytesToCoord } from '../../models/map-coords';

/**
 * Evento "Carta de la Suerte": cofres en el mapa (especie 217, `cofre: true`
 * en data/monsters.ts) que dan una carta con dígito 0-9.
 *
 * Flujo confirmado en capturas:
 *   2202 coord → 2220 (60 B) con `NOT`/`YES` = sin reclamar / ya reclamado
 *   9866 coord → 9867 (17 B) ack con la duración de la búsqueda (6 s)
 *   2220 (73 B) = marcha de la tropa (variante "march" ya parseada)
 *   9861 = estado completo (login + reset 05:00 UTC): cartas en mano y
 *          inicio/duración del evento (para saber si ya se canjeó)
 *   9862 = carta recibida: [dígito, flag 01 = entró al top 10 / 00 = no entró]
 *   9868 = estado de la marcha (01 yendo / 02 terminada), SIN dígito
 *   3439 = aviso con la cola `88 01 00 00 00 <dígito>` (sin handler en el bot)
 *
 * Sólo puede haber UNA búsqueda por cuenta hasta que la tropa vuelve.
 */

/** Resultado del 2202 → 2220 (body de 60 B): estado del tile consultado. */
export interface TileInfoResult {
  x: number;
  y: number;
  /** true = ya reclamado por esta cuenta, false = reclamable, null = sin flag */
  claimed: boolean | null;
  /** u32 del body (offset 1): serial que crece dentro de la sesión; NO es estado */
  serial: number;
}

/** Respuesta del 9866 → 9867 (body de 17 B). */
export interface LuckySearchAck {
  x: number;
  y: number;
  /** segundos que tarda la búsqueda (ida); la vuelta tarda lo mismo */
  durationSec: number;
  /** unix seconds del ack */
  eventTime: number;
}

export interface LuckySearchResult {
  /** 0 = aceptada; otro valor = rechazada (no sale ninguna marcha) */
  status: number;
  /** sólo cuando status === 0 */
  ack: LuckySearchAck | null;
}

const TILE_INFO_BODY_SIZE = 60;

/**
 * Cola del aviso de carta: `88 01 00 00 00 <dígito>`.
 * Vive en el proto **3439** (`_MSG_RESP_NOTICEINFO`), NO en el 9868: en 2286
 * logs ningún 9868 contiene esta cola (los 9868 miden 15 B y traen `01`/`02`).
 */
export const CARD_TAIL = Buffer.from('8801000000', 'hex');

/**
 * 2220 body 60 B (packet 64 B) = respuesta al 2202 de consulta de tile.
 *
 *   [0]      0x0c (variante)
 *   [1..4]   serial u32 LE (crece por sesión)
 *   [5..8]   0
 *   [9..10]  0x0031 fijo
 *   [11..13] coord eco (3 B)
 *   [14..17] `YES\0` = reclamado, `NOT\0` = sin reclamar (sólo en cofres)
 */
export function parseTileInfo(body: Buffer): TileInfoResult | null {
  if (body.length !== TILE_INFO_BODY_SIZE || body[0] !== 0x0c) return null;
  const coord = bytesToCoord(body, 11);
  const flag = body.toString('latin1', 14, 18);
  const claimed = flag === 'YES\0' ? true : flag === 'NOT\0' ? false : null;
  return { x: coord.x, y: coord.y, claimed, serial: body.readUInt32LE(1) };
}

/**
 * 9867 body 17 B = `_MSG_RESP_LUCKYCARD_MARCHING`:
 *   [0] status | [1..3] coord | [4] 0 | [5..8] ts | [9..12] 0 | [13..16] duración
 *
 * status 0x00 = aceptada. En las dos muestras de rechazo (mandar otro 9866
 * antes de que la tropa anterior volviera) el status es 0x03 y el resto del
 * body no sigue el layout del ack, así que no se intenta parsear.
 */
export function parseLuckySearchAck(body: Buffer): LuckySearchResult | null {
  if (body.length < 17) return null;
  const status = body[0]!;
  if (status !== 0x00) return { status, ack: null };
  const coord = bytesToCoord(body, 1);
  return {
    status,
    ack: {
      x: coord.x,
      y: coord.y,
      eventTime: body.readUInt32LE(5),
      durationSec: body.readUInt32LE(13),
    },
  };
}

/** Cartas en mano según el 9861 (conjunto real del servidor). */
export interface LuckyCardInfo {
  /** u32 de [0..3]: ts de INICIO del evento (fijo para todo el evento) */
  eventTs: number;
  /** u32 de [8..11]: duración del evento en segundos (172740 ≈ 2 días) */
  duration: number;
  /** cantidad de cartas (0..14) */
  cardCount: number;
  /** dígitos 0-9, uno por carta, en el orden del paquete */
  cards: number[];
}

/** tope teórico: 7 bytes disponibles para 2 dígitos por byte */
const LUCKY_INFO_MAX_CARDS = 14;
/** cantidad + 7 bytes de dígitos = los últimos 8 bytes del body */
const LUCKY_INFO_TAIL = 8;

/**
 * 9861 = `_MSG_RESP_LUCKYCARD_INFO` (login y cuando cambia el estado).
 *
 *   [0..3]   u32 ts de INICIO del evento (fijo: 1790485200 = 2026-09-27T05:00Z)
 *   [8..11]  u32 duración del evento en segundos (172740 = 47 h 59 m ≈ 2 días)
 *   [20..21] u16 especie = 217 (el cofre de carta)
 *   ...      config constante `01 01 00 01 04` + ceros
 *   últimos 8 B: [cantidad][7 bytes de cartas, 2 dígitos por byte, nibble
 *                 alto primero]
 *
 * La cola se ancla al FINAL porque el body mide 40 ó 41 B según una muestra:
 * un byte intermedio opcional (0x00/0x04) se desplaza todo lo demás.
 *
 * Decodificado contrastando 4 muestras de la misma cuenta:
 *   0 cartas → `…00 00…`
 *   6 cartas → `06 74 26 95 …` = 7,4,2,6,9,5 (body de 40 B)
 *  10 cartas → `0a 74 26 95 55 85 …` = 7,4,2,6,9,5,5,5,8,5
 */
export function parseLuckyCardInfo(body: Buffer): LuckyCardInfo | null {
  if (body.length < LUCKY_INFO_TAIL + 8) return null;
  const base = body.length - LUCKY_INFO_TAIL;
  const cardCount = body[base]!;
  if (cardCount > LUCKY_INFO_MAX_CARDS) return null;
  const cards: number[] = [];
  for (let i = 0; i < cardCount; i++) {
    const byte = body[base + 1 + (i >> 1)]!;
    const digit = i % 2 === 0 ? byte >> 4 : byte & 0x0f;
    if (digit > 9) return null;
    cards.push(digit);
  }
  return {
    eventTs: body.readUInt32LE(0),
    duration: body.length >= 12 ? body.readUInt32LE(8) : 0,
    cardCount,
    cards,
  };
}

/**
 * Respuesta al 9864 (canje), body 10 B confirmado en una captura real
 * (`hex: 0e00892600da0300009338000004` → body = `00 da030000 93380000 04`):
 *
 *   [0]      status: 0x00 = canje aplicado
 *   [1..4]   u32 eco del número enviado en el 9864 (986 en la muestra)
 *   [5..8]   u32 balance TOTAL de gems tras el canje (14483 en la muestra;
 *            no es la recompensa del canje sino el nuevo saldo del jugador)
 *   [9]      byte final (04 en la muestra)
 */
export interface LuckyExchangeResult {
  status: number;
  /** número que el servidor entendió que se canjeó */
  echo: number;
  /** balance total de gems del jugador después del canje */
  gemsTotal: number;
  tail: number;
}

export function parseLuckyExchange(body: Buffer): LuckyExchangeResult | null {
  if (body.length < 6) return null;
  return {
    status: body[0]!,
    echo: body.readUInt32LE(1),
    gemsTotal: body.length >= 9 ? body.readUInt32LE(5) : 0,
    tail: body.length >= 10 ? body[9]! : 0,
  };
}

/**
 * 9862 body 2 B: `[dígito, flag]`. El flag dice si la carta entró al top 10 de
 * la mano: `01` = entró, `00` = reclamada pero no entró (la mano guarda sólo 10
 * cartas y pide un dígito estrictamente mayor que el menor de ellos). Verificado
 * 32/32 contra los logs (cuenta 858715903). Con `00` devuelve null y el handler
 * lo loguea crudo: esas cartas no están en la mano y no sirven para el canje.
 */
export function parseLuckyCard9862(body: Buffer): number | null {
  if (body.length !== 2 || body[1] !== 0x01) return null;
  const digit = body[0]!;
  return digit <= 9 ? digit : null;
}

/**
 * Busca la cola `88 01 00 00 00 <dígito>` dentro de un 9868.
 *
 * En los logs el 9868 mide 15 B (`01` yendo / `02` terminada) y **nunca** trae
 * esa cola, así que esto devuelve null en la práctica: el dígito real llega por
 * el 9862 (y el aviso con cola por el 3439, sin handler). Se conserva por si el
 * servidor manda un record extendido.
 */
export function parseLuckyCard9868(body: Buffer): number | null {
  const idx = body.lastIndexOf(CARD_TAIL);
  if (idx < 0 || idx + 6 > body.length) return null;
  const digit = body[idx + 5]!;
  return digit <= 9 ? digit : null;
}
