import { decodeCoordId, encodeCoordId, encodeCoord } from '../../models/map-coords';

export interface ParsedMapTile {
  id: number;
  x: number;
  y: number;
  /** Byte tipo del tile (offset 3 del record): 8 = jugador/nido, 0x0a = recurso, resto = vacío/especial */
  type: number;
  /** Nombre (13 bytes, null-terminated) */
  name: string;
  /** Tag de gremio (3 bytes, null-terminated) */
  guild: string;
  /** Recursos/veta: tipo (1-5), nivel y cantidad (solo types 1-5) */
  resource?: { type: number; level: number; amount: number };
  /** Monstruo (type 0x0a): nivel, id y HP% (float32 LE) */
  monster?: { level: number; id: string; hp: number };
  /** Castillo/nido (type 8): reino (u16 LE @20), nivel @22, escudo @23 y skin (2B raw @28) */
  castle?: { kingdom: number; level: number; darkness: boolean; shield: boolean; skin: string };
  empty: boolean;
  rawData: Buffer;
  /** Compat: nombre */
  text?: string;
  /** Compat: byte tipo */
  entityType?: number;
}

export interface ParsedMapPacket {
  header: Buffer;
  raw: Buffer;
  tiles: ParsedMapTile[];
}

/** Tipos de veta de recurso (byte tipo del tile) */
export const RESOURCE_NAMES: Record<number, string> = {
  1: 'Trigo',
  2: 'Piedra',
  3: 'Mineral',
  4: 'Madera',
  5: 'Oro',
};

/** Cabecera del primer paquete 2220 (tras pedir 2201): 25 bytes */
const HEADER_SIZE = 25;
/** Cabecera de los paquetes de continuación 2220: 3 bytes */
const CONTINUATION_HEADER_SIZE = 3;
/** Cabecera de los updates 2220 (tile individual que se mueve/aparece/desaparece): 11 bytes */
const UPDATE_HEADER_SIZE = 11;
/** Cada tile es un registro fijo de 51 bytes */
export const MAP_TILE_SIZE = 51;

/**
 * Detecta el tamaño de cabecera por longitud: el body es header + N×51.
 * Cabeceras posibles:
 *  - 3          = continuación sin eco de celdas
 *  - 3 + n*10 + 2 = 5 + n*10 = eco de n celdas pedidas: 15/25/35/45/55/...
 * Como difieren en valores no múltiplos de 51, a lo sumo una divide exacta
 * (excepción: n=10 → 105 ≡ 3 mod 51; se omite porque el bot nunca pide
 * 10 celdas — los tamaños de ventana son 1,4,9,16,25,36,49...).
 */
export function detectMapHeaderSize(buf: Buffer): number {
  const candidates: number[] = [CONTINUATION_HEADER_SIZE];
  for (let n = 1; n <= 40; n++) {
    if (n === 10) continue;
    candidates.push(5 + n * 10);
  }
  for (const h of candidates) {
    const rem = buf.length - h;
    if (rem < MAP_TILE_SIZE || rem % MAP_TILE_SIZE !== 0) continue;
    if (h !== CONTINUATION_HEADER_SIZE && !echoedCellsLookValid(buf, h)) continue;
    return h;
  }
  // Sin división exacta (tail parcial): primera candidata cuyo primer record decodifica
  for (const h of candidates) {
    if (buf.length - h < MAP_TILE_SIZE) continue;
    const id = (buf[h]! << 16) | (buf[h + 1]! << 8) | buf[h + 2]!;
    if (id === 0) continue;
    try {
      decodeCoordId(id);
      return h;
    } catch {}
  }
  return HEADER_SIZE;
}

/**
 * Validez del eco de celdas de una cabecera 5+n*10: cada registro es
 * [u16 cellIndex][u32][u32] y el índice de celda va de 0 a 4095 (16×256).
 * Descarta largos que coinciden por casualidad con 5+n*10 (p. ej. un
 * tail parcial de n celdas reales + bytes sueltos).
 */
function echoedCellsLookValid(buf: Buffer, headerSize: number): boolean {
  const n = (headerSize - 5) / 10;
  if (n < 1) return false;
  for (let i = 0; i < n; i++) {
    const cell = buf.readUInt16LE(3 + i * 10);
    if (cell > 4095) return false;
  }
  return true;
}

function readCStr(buf: Buffer, offset: number, maxLen: number): string {
  const end = buf.indexOf(0, offset);
  const limit = end >= 0 ? Math.min(end, offset + maxLen) : offset + maxLen;
  return buf.toString('utf8', offset, Math.min(limit, buf.length)).trim();
}

/**
 * Parsea un registro de tile de 51 bytes (coord + type + datos).
 * Común para updates individuales y segmentos multi-tile.
 */
function parseTileRecord(rec: Buffer): ParsedMapTile | null {
  if (rec.length < MAP_TILE_SIZE) return null;
  const b0 = rec[0]!;
  const b1 = rec[1]!;
  const b2 = rec[2]!;
  const id = (b0 << 16) | (b1 << 8) | b2;
  let coord;
  try {
    coord = decodeCoordId(id);
  } catch {
    return null;
  }
  const type = rec[3]!;
  const isVein = type >= 1 && type <= 5;
  const isMonster = type === 0x0a;
  let name = '';
  let guild = '';
  let resource: { type: number; level: number; amount: number } | undefined;
  let monster: { level: number; id: string; hp: number } | undefined;
  let castle: { kingdom: number; level: number; darkness: boolean; shield: boolean; skin: string } | undefined;
  let empty: boolean;

  if (isVein) {
    name = RESOURCE_NAMES[type] || `Recurso ${type}`;
    resource = { type, level: rec[22]!, amount: rec.readUInt32LE(23) };
    empty = false;
  } else if (isMonster) {
    name = `Monstruo`;
    monster = {
      level: rec[4]!,
      id: rec.subarray(5, 11).toString('hex'),
      hp: rec.readFloatLE(11),
    };
    empty = false;
  } else if (type === 8) {
    name = readCStr(rec, 4, 13);
    guild = readCStr(rec, 17, 3);
    castle = {
      kingdom: rec.readUInt16LE(20),
      level: rec[22]!,
      darkness: name.toLowerCase().includes('dark'),
      shield: rec.readUInt16LE(23) !== 0,
      skin: rec.subarray(28, 30).toString('hex'),
    };
    empty = false;
  } else {
    name = readCStr(rec, 4, 13);
    guild = readCStr(rec, 17, 3);
    empty = true;
  }

  return {
    id,
    x: coord.x,
    y: coord.y,
    type,
    name,
    guild,
    resource,
    monster,
    castle,
    empty,
    rawData: Buffer.from(rec),
    text: name || undefined,
    entityType: type,
  };
}

/**
 * Parsea un paquete 2220 (update de mapa).
 * El body se divide en segmentos de 62 bytes: [11 header][51 tile].
 * Soporta single-tile (62 bytes) y multi-tile (N×62).
 * Devuelve array de tiles parseados.
 */
export function parse2220(buf: Buffer): ParsedMapTile[] {
  const SEGMENT_SIZE = UPDATE_HEADER_SIZE + MAP_TILE_SIZE; // 62
  if (buf.length === 0 || buf.length % SEGMENT_SIZE !== 0) return [];

  const tiles: ParsedMapTile[] = [];
  for (let offset = 0; offset < buf.length; offset += SEGMENT_SIZE) {
    const rec = buf.subarray(offset + UPDATE_HEADER_SIZE, offset + SEGMENT_SIZE);
    const tile = parseTileRecord(rec);
    if (tile) tiles.push(tile);
  }
  return tiles;
}

/**
 * Parsea un tile individual de update 2220 (header 11 bytes + 1 tile de 51).
 * Devuelve null si el paquete no tiene este formato.
 */
export function parseMapUpdate(buf: Buffer): ParsedMapTile | null {
  if (buf.length !== UPDATE_HEADER_SIZE + MAP_TILE_SIZE) return null;
  const rec = buf.subarray(UPDATE_HEADER_SIZE, UPDATE_HEADER_SIZE + MAP_TILE_SIZE);
  return parseTileRecord(rec);
}

export function parseMapPacket(buf: Buffer): ParsedMapPacket | null {
  const headerSize = detectMapHeaderSize(buf);
  if (buf.length < headerSize + MAP_TILE_SIZE) return null;
  const header = buf.subarray(0, headerSize);
  const tiles: ParsedMapTile[] = [];
  const count = Math.floor((buf.length - headerSize) / MAP_TILE_SIZE);

  for (let i = 0; i < count; i++) {
    const offset = headerSize + i * MAP_TILE_SIZE;
    const rec = buf.subarray(offset, offset + MAP_TILE_SIZE);
    const b0 = rec[0]!;
    const b1 = rec[1]!;
    const b2 = rec[2]!;
    const id = (b0 << 16) | (b1 << 8) | b2;
    let coord;
    try {
      coord = decodeCoordId(id);
    } catch {
      continue;
    }
    const type = rec[3]!;
    const isVein = type >= 1 && type <= 5;
    const isMonster = type === 0x0a;
    let name = '';
    let guild = '';
    let resource: { type: number; level: number; amount: number } | undefined;
    let monster: { level: number; id: string; hp: number } | undefined;
    let castle: { kingdom: number; level: number; darkness: boolean; shield: boolean; skin: string } | undefined;
    let empty: boolean;

    if (isVein) {
      // Veta: [coord][type][18 ceros][nivel][cantidad u32 LE]
      name = RESOURCE_NAMES[type] || `Recurso ${type}`;
      resource = { type, level: rec[22]!, amount: rec.readUInt32LE(23) };
      empty = false;
    } else if (isMonster) {
      // Monstruo: [coord][0a][nivel][id 6B][hp% float32 LE]
      name = `Monstruo`;
      monster = {
        level: rec[4]!,
        id: rec.subarray(5, 11).toString('hex'),
        hp: rec.readFloatLE(11),
      };
      empty = false;
    } else if (type === 8) {
      // Castillo o nido: [coord][08][nombre 13B][guild 3B][reino u16 LE][nivel]
      name = readCStr(rec, 4, 13);
      guild = readCStr(rec, 17, 3);
      castle = {
        kingdom: rec.readUInt16LE(20),
        level: rec[22]!,
        darkness: name.toLowerCase().includes('dark'),
        shield: rec.readUInt16LE(23) !== 0,
        skin: rec.subarray(28, 30).toString('hex'),
      };
      empty = false;
    } else {
      name = readCStr(rec, 4, 13);
      guild = readCStr(rec, 17, 3);
      empty = true;
    }

    tiles.push({
      id,
      x: coord.x,
      y: coord.y,
      type,
      name,
      guild,
      resource,
      monster,
      castle,
      empty,
      rawData: Buffer.from(rec),
      text: name || undefined,
      entityType: type,
    });
  }

  return { header, raw: buf, tiles };
}


/**
 * Payload del proto 2201 (_MSG_REQUEST_MAPDATA).
 * La coordenada se codifica como los 3 bytes del tile (encodeCoord), NO como X u16 / Y u32.
 * Formato: [02][coord 3 bytes][27 bytes de ceros] = 31 bytes totales.
 */
export function requestMapDataPacket(x = 0, y = 0): Buffer {
  const payload = Buffer.alloc(31);
  payload[0] = 0x02;
  // Coord fija para test (db 00 eb = castillo principal)
  payload[1] = 0xdb;
  payload[2] = 0x00;
  payload[3] = 0xeb;
  return payload;
}
