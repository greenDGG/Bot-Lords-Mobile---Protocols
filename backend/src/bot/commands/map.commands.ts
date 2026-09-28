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
 * Ventanas 2201 (2×2 celdas) que tapan (cx±radio, cy±radio) sin huecos,
 * de más cercana a más lejana al centro.
 *
 * La celda mide 33 en X y 16 en Y (ver worldToGrid) y la ventana cubre la
 * celda base y la siguiente en ambos ejes, así que se avanza de a 2 en cada
 * índice para que las ventanas queden contiguas entre sí.
 *
 * gx está limitado a 0..15 (índice lineal = gy × 16 + gx; con gx ≥ 16 el
 * índice caería en la fila siguiente) y gy a 0..511.
 */
export function buildScanWindows(cx: number, cy: number, radius: number): { x: number; y: number }[] {
  const gx0 = Math.max(0, Math.floor((cx - radius - 8) / 33));
  const gx1 = Math.min(15, Math.floor((cx + radius - 8) / 33));
  const gy0 = Math.max(0, Math.floor((cy - radius - 8) / 16));
  const gy1 = Math.min(511, Math.floor((cy + radius - 8) / 16));
  const nx = Math.max(1, Math.floor((gx1 - gx0) / 2) + 1);
  const ny = Math.max(1, Math.floor((gy1 - gy0) / 2) + 1);
  const windows: { x: number; y: number }[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      windows.push({ x: 8 + 33 * (gx0 + 2 * i), y: 8 + 16 * (gy0 + 2 * j) });
    }
  }
  windows.sort((a, b) => (a.x - cx) ** 2 + (a.y - cy) ** 2 - ((b.x - cx) ** 2 + (b.y - cy) ** 2));
  return windows;
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

/** Cooldown 2201/2202/2452 por conexión: si van pegados el servidor responde 2453 con 0x0e (rate limit). */
export const MAP_PROTO_COOLDOWN_MS = 1000;
const lastMapProtoAt = new WeakMap<BotEngine, number>();

/** Reserva y espera el turno de envío de un 2201/2202/2452 en ESTA conexión (≥1 s desde la anterior). */
export async function waitMapProtoCooldown(bot: BotEngine): Promise<void> {
  const now = Date.now();
  const start = Math.max(now, lastMapProtoAt.get(bot) ?? 0);
  lastMapProtoAt.set(bot, start + MAP_PROTO_COOLDOWN_MS);
  if (start > now) await new Promise(resolve => setTimeout(resolve, start - now));
}

/** Tanda 2201 en curso por conexión: una petición nueva del MISMO bot cancela la anterior. */
const requestGen = new WeakMap<BotEngine, number>();

export function requestMapData(bot: BotEngine, x: number, y: number): void {
  const gen = (requestGen.get(bot) ?? 0) + 1;
  requestGen.set(bot, gen);
  const packets = requestMapDataPackets(x, y);
  void (async () => {
    for (let i = 0; i < packets.length; i++) {
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, i * REQUEST_COOLDOWN_MS));
        if (gen !== requestGen.get(bot)) return;
      }
      await waitMapProtoCooldown(bot);
      if (gen !== requestGen.get(bot)) return;
      bot.sendCommandPacket(2201, packets[i]!, true);
    }
  })();
}

export async function refreshMapCoord(bot: BotEngine, coordBytes: Buffer): Promise<void> {
  const payload = Buffer.alloc(3);
  coordBytes.copy(payload, 0);
  await waitMapProtoCooldown(bot);
  bot.sendCommandPacket(2202, payload, true);
}
