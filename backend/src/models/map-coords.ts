export interface TileCoord {
  x: number;
  y: number;
}

export interface EncodedTileCoord extends TileCoord {
  xi: number;
  yi: number;
  id: number;
  bytes: [number, number, number];
}

export interface MapTile {
  coord: TileCoord;
  xi: number;
  yi: number;
  id: number;
  type?: number;
  level?: number;
  owner?: string;
  guildTag?: string;
}

export interface MapRegion {
  id: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  tiles: MapTile[];
}

/**
 * 3 bytes del tile: [b0][b1][b2]
 *   xi (8 bits) = b0[3:0] + b2[3:0]      → x = xi*2 + p
 *   yi (15 bits) = b1[7:0] + b0[7:4] + b2[7:5] → y = yi*2 + p
 *   p (1 bit) = b2[4]                    → paridad: x e y SIEMPRE la comparten
 *
 * El bit de paridad es lo que separa dos posiciones distintas DENTRO de la misma
 * celda: (446,56) y (447,57) son dos tiles diferentes con el mismo (xi,yi).
 * Sin él, ambos caen en la misma coordenada y se les resta 1 a los impares.
 */
export function encodeCoord(x: number, y: number): [number, number, number] {
  const xi = Math.floor(x / 2);
  const yi = Math.floor(y / 2);
  const p = (x & 1) | (y & 1);
  const byte0 = (((yi >> 3) & 0x0F) << 4) | ((xi >> 4) & 0x0F);
  const byte1 = yi >> 7;
  const byte2 = (((yi & 0x07) << 5) | (xi & 0x0F) | (p << 4)) & 0xFF;
  return [byte0 & 0xFF, byte1 & 0xFF, byte2 & 0xFF];
}

export function decodeCoordBytes(bytes: [number, number, number]): EncodedTileCoord {
  const [byte0, byte1, byte2] = bytes;
  const xiHigh = byte0 & 0x0F;
  const xiLow = byte2 & 0x0F;
  const yiLow = byte2 >> 5;
  const yiMid = (byte0 >> 4) & 0x0F;
  const yiHigh = byte1;
  const xi = (xiHigh << 4) | xiLow;
  const yi = (yiHigh << 7) | (yiMid << 3) | yiLow;
  const p = (byte2 >> 4) & 1;
  const x = xi * 2 + p;
  const y = yi * 2 + p;
  const id = (byte0 << 16) | (byte1 << 8) | byte2;
  return { x, y, xi, yi, id, bytes };
}

export function encodeCoordId(x: number, y: number): number {
  const [b0, b1, b2] = encodeCoord(x, y);
  return (b0 << 16) | (b1 << 8) | b2;
}

export function decodeCoordId(id: number): EncodedTileCoord {
  const byte0 = (id >> 16) & 0xFF;
  const byte1 = (id >> 8) & 0xFF;
  const byte2 = id & 0xFF;
  return decodeCoordBytes([byte0, byte1, byte2]);
}

export function coordToBytes(x: number, y: number): Buffer {
  const [b0, b1, b2] = encodeCoord(x, y);
  return Buffer.from([b0, b1, b2]);
}

export function bytesToCoord(buf: Buffer, offset = 0): EncodedTileCoord {
  return decodeCoordBytes([buf[offset]!, buf[offset + 1]!, buf[offset + 2]!]);
}

export function regionTiles(centerX: number, centerY: number, radius: number): { xi: number; yi: number }[] {
  const tiles: { xi: number; yi: number }[] = [];
  const cxi = Math.floor(centerX / 2);
  const cyi = Math.floor(centerY / 2);
  const r = Math.floor(radius / 2);
  for (let yi = cyi - r; yi <= cyi + r; yi++) {
    for (let xi = cxi - r; xi <= cxi + r; xi++) {
      tiles.push({ xi, yi });
    }
  }
  return tiles;
}

export function regionTileCoords(centerX: number, centerY: number, radius: number): TileCoord[] {
  return regionTiles(centerX, centerY, radius).map(t => ({ x: t.xi * 2, y: t.yi * 2 }));
}

export function regionTileIds(centerX: number, centerY: number, radius: number): number[] {
  return regionTiles(centerX, centerY, radius).map(t => encodeCoordId(t.xi * 2, t.yi * 2));
}

export function xyToBlock(x: number, y: number, blockSize = 40): { bx: number; by: number; blockIndex: number } {
  const xi = Math.floor(x / 2);
  const yi = Math.floor(y / 2);
  const bx = Math.floor(xi / blockSize);
  const by = Math.floor(yi / blockSize);
  return { bx, by, blockIndex: by * 1000 + bx };
}

export function blockToBounds(bx: number, by: number, blockSize = 40): { minX: number; minY: number; maxX: number; maxY: number } {
  const minXi = bx * blockSize;
  const minYi = by * blockSize;
  const maxXi = minXi + blockSize - 1;
  const maxYi = minYi + blockSize - 1;
  return {
    minX: minXi * 2,
    minY: minYi * 2,
    maxX: maxXi * 2,
    maxY: maxYi * 2,
  };
}

export function blockTileIds(bx: number, by: number, blockSize = 40): number[] {
  const ids: number[] = [];
  const minXi = bx * blockSize;
  const minYi = by * blockSize;
  for (let yi = minYi; yi < minYi + blockSize; yi++) {
    for (let xi = minXi; xi < minXi + blockSize; xi++) {
      ids.push(encodeCoordId(xi * 2, yi * 2));
    }
  }
  return ids;
}

export function gatherRegionQueryPacket(centerX: number, centerY: number, radius: number): Buffer {
  const tiles = regionTiles(centerX, centerY, radius);
  const buf = Buffer.alloc(4 + tiles.length * 3);
  buf.writeUInt16LE(tiles.length, 0);
  let off = 4;
  for (const t of tiles) {
    const [b0, b1, b2] = encodeCoord(t.xi * 2, t.yi * 2);
    buf[off++] = b0;
    buf[off++] = b1;
    buf[off++] = b2;
  }
  return buf;
}

export function parseTileData(buf: Buffer, offset = 0): { tile: MapTile; bytesRead: number } {
  if (offset + 3 > buf.length) throw new Error('Insufficient data for tile');
  const coord = bytesToCoord(buf, offset);
  const tile: MapTile = {
    coord: { x: coord.x, y: coord.y },
    xi: coord.xi,
    yi: coord.yi,
    id: coord.id,
  };
  let read = 3;
  if (offset + 4 <= buf.length) {
    tile.type = buf[offset + 3];
    read = 4;
  }
  if (offset + 5 <= buf.length) {
    tile.level = buf[offset + 4];
    read = 5;
  }
  return { tile, bytesRead: read };
}

export function parseTiles(buf: Buffer, offset = 0, count?: number): MapTile[] {
  const tiles: MapTile[] = [];
  const maxCount = count ?? Math.floor((buf.length - offset) / 3);
  let off = offset;
  for (let i = 0; i < maxCount; i++) {
    if (off + 3 > buf.length) break;
    try {
      const { tile, bytesRead } = parseTileData(buf, off);
      tiles.push(tile);
      off += bytesRead;
    } catch {
      break;
    }
  }
  return tiles;
}
