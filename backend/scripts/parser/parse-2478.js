#!/usr/bin/env node
const hex = process.argv[2];
if (!hex) { console.log('Uso: node tools/parse-2478.js <hex>'); process.exit(1); }
const payload = Buffer.from(hex, 'hex');

function decodeCoordBytes(byte0, byte1, byte2) {
  const xiHigh = byte0 & 0x0F;
  const xiLow = byte2 & 0x0F;
  const yiLow = byte2 >> 5;
  const yiMid = (byte0 >> 4) & 0x0F;
  const yiHigh = byte1;
  const xi = (xiHigh << 4) | xiLow;
  const yi = (yiHigh << 7) | (yiMid << 3) | yiLow;
  return { x: xi * 2, y: yi * 2 };
}

console.log(`Body: ${payload.length}b\n`);
console.log('=== PARSEO 2478 CORREGIDO ===\n');

let off = 6; // skip 6-byte header
let idx = 0;

while (off < payload.length) {
  const entryStart = off;
  console.log(`--- Entry #${idx} @ offset ${off} ---`);

  if (off + 28 > payload.length) { console.log(`  Not enough bytes`); break; }

  const ts = payload.readUInt32LE(off); off += 4;
  const pad1 = payload.readUInt32LE(off); off += 4;
  const timeRem = payload.readUInt16LE(off); off += 2;
  const pad2 = payload.readUInt16LE(off); off += 2;

  // PointCode 3 bytes
  const b0 = payload[off], b1 = payload[off+1], b2 = payload[off+2];
  const coord = decodeCoordBytes(b0, b1, b2);
  off += 3;

  const unknown2b = payload.readUInt16LE(off); off += 2;

  // Name 13 bytes always
  const name1 = payload.toString('ascii', off, off + 13).replace(/\0+$/, '');
  off += 13;

  // Between 15 bytes (documented in guerra.md)
  const between = payload.subarray(off, off + 15);
  off += 15;

  // Name2 13 bytes always
  const name2 = payload.toString('ascii', off, off + 13).replace(/\0+$/, '');
  off += 13;

  console.log(`  timestamp = ${ts} (${new Date(ts * 1000).toISOString().slice(0,16)})`);
  console.log(`  timeRem   = ${timeRem}s (${Math.floor(timeRem/60)}m ${timeRem%60}s)`);
  console.log(`  PointCode = [${b0.toString(16)},${b1.toString(16)},${b2.toString(16)}] => x=${coord.x} y=${coord.y}`);
  console.log(`  unknown   = ${unknown2b} (0x${unknown2b.toString(16)})`);
  console.log(`  name1     = "${name1}"`);
  console.log(`  between   = ${between.toString('hex')}`);
  console.log(`  name2     = "${name2}"`);
  console.log(`  => [${coord.x},${coord.y}] "${name1}" -> "${name2}" (${timeRem}s)\n`);

  if (!name1 && coord.x === 0 && coord.y === 0 && timeRem === 0) break;
  idx++;
}

if (off < payload.length) {
  console.log(`[WARN] ${payload.length - off} bytes left: ${payload.subarray(off).toString('hex')}`);
}
