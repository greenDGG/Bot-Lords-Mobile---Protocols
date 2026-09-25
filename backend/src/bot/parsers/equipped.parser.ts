import type { CostumeItem } from './costume.parser';

const ITEM_SIZE = 19;

function readUint16LE(buf: Uint8Array, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function parseEquippedCostumes(body: Buffer): CostumeItem[] {
  const buf = new Uint8Array(body);
  const items: CostumeItem[] = [];
  let off = 0;

  while (off + ITEM_SIZE <= buf.length) {
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

    if (id === 0 && grade === 0 && gemLevel1 === 0 && gemLevel2 === 0) break;

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
      raw: bytesToHex(buf.slice(itemOff, itemOff + ITEM_SIZE)),
    });
  }

  return items;
}
