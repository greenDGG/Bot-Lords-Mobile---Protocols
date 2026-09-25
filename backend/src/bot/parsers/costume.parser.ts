export interface CostumeItem {
  id: number;
  grade: number;
  gemLevel1: number;
  gemLevel2: number;
  gemLevel3: number;
  stealthLevel1: number;
  gemId1: number;
  gemId2: number;
  gemId3: number;
  stealthId1: number;
  index: number;
  end: number;
  raw: string;
}

export interface CostumeHeader {
  start: number;
  timestamp: number;
  timestampSeparator: number;
  separator: number;
  count: number;
}

export interface CostumeParseResult {
  header: CostumeHeader | null;
  hasHeader: boolean;
  items: CostumeItem[];
  remaining: string;
}

const HEADER_SIZE = 13;
const ITEM_SIZE = 19;

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\/\/.*$/gm, '').replace(/\s+/g, '');
  if (clean.length % 2 !== 0) {
    throw new Error(`Invalid hex string length: ${clean.length} (must be even)`);
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function readUint16LE(buf: Uint8Array, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8);
}

function readUint32LE(buf: Uint8Array, offset: number): number {
  return (
    buf[offset] |
    (buf[offset + 1] << 8) |
    (buf[offset + 2] << 16) |
    (buf[offset + 3] << 24)
  );
}

function readBytes(buf: Uint8Array, offset: number, size: number): Uint8Array {
  return buf.slice(offset, offset + size);
}

function parseItems(buf: Uint8Array, offset: number, count: number): CostumeItem[] {
  const items: CostumeItem[] = [];
  let off = offset;

  for (let i = 0; i < count; i++) {
    if (off + ITEM_SIZE > buf.length) break;

    const itemOff = off;
    const id = readUint16LE(buf, off); off += 2;
    const grade = buf[off]; off += 1;
    const gemLevel1 = buf[off]; off += 1;
    const gemLevel2 = buf[off]; off += 1;
    const gemLevel3 = buf[off]; off += 1;
    const stealthLevel1 = buf[off]; off += 1;
    const gemId1 = readUint16LE(buf, off); off += 2;
    const gemId2 = readUint16LE(buf, off); off += 2;
    const gemId3 = readUint16LE(buf, off); off += 2;
    const stealthId1 = readUint16LE(buf, off); off += 2;
    const index = readUint16LE(buf, off); off += 2;
    const end = readUint16LE(buf, off); off += 2;

    items.push({
      id,
      grade,
      gemLevel1,
      gemLevel2,
      gemLevel3,
      stealthLevel1,
      gemId1,
      gemId2,
      gemId3,
      stealthId1,
      index,
      end,
      raw: bytesToHex(readBytes(buf, itemOff, ITEM_SIZE)),
    });
  }

  return items;
}

export function parseCostumePacket(body: Buffer): CostumeParseResult {
  const buf = new Uint8Array(body);

  if (buf.length === 0) {
    return { header: null, hasHeader: false, items: [], remaining: '' };
  }

  const hasHeader =
    buf.length >= HEADER_SIZE &&
    (buf.length - HEADER_SIZE) % ITEM_SIZE === 0;

  let off = 0;
  let header: CostumeHeader | null = null;

  if (hasHeader) {
    const start = buf[0]; off += 1;
    const timestamp = readUint32LE(buf, off); off += 4;
    const timestampSeparator = readUint32LE(buf, off); off += 4;
    const separator = readUint16LE(buf, off); off += 2;
    const count = readUint16LE(buf, off); off += 2;

    header = { start, timestamp, timestampSeparator, separator, count };
  }

  const itemBytes = buf.length - off;
  const itemCount = Math.floor(itemBytes / ITEM_SIZE);
  const remainingBytes = itemBytes - itemCount * ITEM_SIZE;

  const items = parseItems(buf, off, itemCount);

  const remaining = remainingBytes > 0
    ? bytesToHex(readBytes(buf, off + itemCount * ITEM_SIZE, remainingBytes))
    : '';

  return { header, hasHeader, items, remaining };
}
