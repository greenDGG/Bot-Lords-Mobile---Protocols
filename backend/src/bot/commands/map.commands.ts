import { BotEngine } from '../engine/bot-engine';

/**
 * Posición mundial → grilla de celdas.
 *
 * Fórmula experimental verificada:
 *   gridX = floor((X - 8) / 33)   // celdas de 33 de ancho, origen en X = 8
 *   gridY = floor((Y - 8) / 16)   // celdas de 16 de alto,  origen en Y = 8
 *
 * Confirmaciones: X=100→2, X=107→3, X=140→4, X=200→5, X=208→6,
 *                 Y=9→0, Y=100→5, Y=200→12, Y=300→18, Y=406→24, Y=488→30
 */
export function worldToGrid(x: number, y: number): { gridX: number; gridY: number } {
  const gridX = Math.floor((x - 8) / 33);
  const gridY = Math.floor((y - 8) / 16);
  return { gridX: Math.max(0, gridX), gridY: Math.max(0, gridY) };
}

/**
 * Índice lineal de celda (16 columnas):
 *   index = fila * 16 + columna
 */
export function gridToIndex(gridX: number, gridY: number): number {
  return gridY * 16 + gridX;
}

/**
 * Ventana 2×2 alrededor de la celda base:
 *
 *   base      base + 1
 *   base + 16 base + 17
 *
 * Ejemplo X=100, Y=100 → grid (2,5) → base 82 → [82, 83, 98, 99]
 */
export function getMapWindow(
  x: number,
  y: number,
): { gridX: number; gridY: number; base: number; cells: number[] } {
  const { gridX, gridY } = worldToGrid(x, y);
  const base = gridToIndex(gridX, gridY);
  return { gridX, gridY, base, cells: [base, base + 1, base + 16, base + 17] };
}

/**
 * Selección de celdas a enviar, separada del cálculo de la ventana.
 *
 * El cliente real no siempre manda la ventana completa: se observaron
 * count=4 (mayoría de capturas) y count=2 (casos parciales, ej. X=107,Y=100
 * → [83,99] y X=100,Y=200 → [194,195]). La regla exacta del cliente no está
 * determinada, así que por defecto se envía la ventana completa.
 *
 * `known` permite omitir celdas ya cargadas cuando el caller las trackea;
 * si la selección quedara vacía se vuelve a la ventana completa (count=0
 * nunca se envía).
 */
export function selectCells(
  cells: number[],
  known: ReadonlySet<number> = new Set(),
): number[] {
  const needed = cells.filter((c) => !known.has(c));
  return needed.length > 0 ? needed : cells;
}

/**
 * Máximo de celdas por llamada 2201 (máximo observado en capturas = 4).
 * Una ventana 2×2 (4 celdas) cabe en un único paquete.
 */
export const MAX_CELLS_PER_REQUEST = 4;

/**
 * Body del 2201: 45 bytes fijos.
 * [count u8][count × uint16 LE][relleno en ceros]
 */
export const MAP_REQUEST_PAYLOAD_SIZE = 45;

function mapCellPayload(cells: number[]): Buffer {
  const payload = Buffer.alloc(MAP_REQUEST_PAYLOAD_SIZE);
  payload[0] = cells.length;
  cells.forEach((cell, i) => payload.writeUInt16LE(cell, 1 + i * 2));
  return payload;
}

/** Payload 2201 por tanda: [count u8][count × uint16 LE][zeros], count ≤ 4. */
export function requestMapDataPackets(
  x: number,
  y: number,
  maxCells = MAX_CELLS_PER_REQUEST,
): Buffer[] {
  const cells = selectCells(getMapWindow(x, y).cells);
  const packets: Buffer[] = [];
  for (let i = 0; i < cells.length; i += maxCells) {
    packets.push(mapCellPayload(cells.slice(i, i + maxCells)));
  }
  return packets;
}

/** Cooldown entre tandas del mismo 2201 (el servidor las quiere en llamadas separadas). */
export const REQUEST_COOLDOWN_MS = 3000;

/** Cooldown compartido 2201/2202/2452: si van pegados el servidor responde 2453 con 0x0e (rate limit). */
export const MAP_PROTO_COOLDOWN_MS = 1000;
let lastMapProtoAt = 0;

/** Reserva y espera el turno de envío de un 2201/2202/2452 (≥1 s desde el anterior). */
export async function waitMapProtoCooldown(): Promise<void> {
  const now = Date.now();
  const start = Math.max(now, lastMapProtoAt);
  lastMapProtoAt = start + MAP_PROTO_COOLDOWN_MS;
  if (start > now) await new Promise(resolve => setTimeout(resolve, start - now));
}

let requestGen = 0;

export function requestMapData(bot: BotEngine, x: number, y: number): void {
  const gen = ++requestGen;
  const packets = requestMapDataPackets(x, y);
  void (async () => {
    for (let i = 0; i < packets.length; i++) {
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, i * REQUEST_COOLDOWN_MS));
        if (gen !== requestGen) return;
      }
      await waitMapProtoCooldown();
      if (gen !== requestGen) return;
      bot.sendCommandPacket(2201, packets[i]!, true);
    }
  })();
}

export async function refreshMapCoord(bot: BotEngine, coordBytes: Buffer): Promise<void> {
  const payload = Buffer.alloc(3);
  coordBytes.copy(payload, 0);
  await waitMapProtoCooldown();
  bot.sendCommandPacket(2202, payload, true);
}
