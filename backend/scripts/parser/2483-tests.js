'use strict';

/**
 * Protocol 2483 — War Participants
 *
 * Takes real captured hex, runs it through the current parser,
 * and dumps every byte + parsed result.
 * No invented data. No assumptions. Just show what the parser sees.
 */

const TROOP_TYPE_MAP = {
  0x0001: { type: 'infantry', tier: 5 },
  0x0002: { type: 'artillery', tier: 5 },
  0x0004: { type: 'cavalry', tier: 5 },
  0x0010: { type: 'infantry', tier: 4 },
  0x0020: { type: 'artillery', tier: 4 },
  0x0040: { type: 'cavalry', tier: 4 },
  0x0080: { type: 'siege', tier: 4 },
  0x0100: { type: 'infantry', tier: 3 },
  0x0200: { type: 'artillery', tier: 3 },
  0x0400: { type: 'cavalry', tier: 3 },
  0x1000: { type: 'infantry', tier: 2 },
  0x2000: { type: 'artillery', tier: 2 },
  0x4000: { type: 'cavalry', tier: 2 },
  0x10000: { type: 'infantry', tier: 1 },
  0x20000: { type: 'artillery', tier: 1 },
  0x40000: { type: 'cavalry', tier: 1 },
};

function parse2483(body) {
  const participants = [];
  let off = 0;

  while (off + 37 <= body.length) {
    const index = body.readUInt32LE(off); off += 4;
    const rawName = body.toString('ascii', off, off + 13);
    const name = rawName.replace(/\0+$/, '');
    off += 13;
    const status = body[off]; off += 1;
    const tier = body[off]; off += 1;
    const timestamp = body.readUInt32LE(off); off += 4;
    const unknownField = body.readUInt32LE(off); off += 4;
    off += 6;
    const mask = body.readUInt32LE(off); off += 4;

    const troops = [];
    const bits = Object.keys(TROOP_TYPE_MAP).map(Number).sort((a, b) => a - b);
    for (const bit of bits) {
      if (mask & bit) {
        if (off + 4 > body.length) break;
        const count = body.readUInt32LE(off); off += 4;
        const info = TROOP_TYPE_MAP[bit];
        troops.push({ type: info.type, tier: info.tier, count });
      }
    }

    const rawHex = body.subarray(off - (4 + troops.length * 4), off).toString('hex');
    participants.push({ name, index, mask, troops, raw: rawHex });

    if (!name && mask === 0) break;
  }

  return participants;
}

// ---------------------------------------------------------------------------
// Real captured hex
// ---------------------------------------------------------------------------

const REAL_HEX = '02000000477961727520537175616400000d01e09ca96a000000001a00000000000000000000400000400d0300';
const buf = Buffer.from(REAL_HEX, 'hex');

console.log('=== Proto 2483 — Real hex dump ===\n');
console.log(`Hex (${buf.length} bytes): ${REAL_HEX}\n`);

console.log('Byte-by-byte:');
const fields = [
  [0, 3, 'index'],
  [4, 16, 'name'],
  [17, 17, 'status'],
  [18, 18, 'tier'],
  [19, 22, 'timestamp'],
  [23, 26, 'unknown'],
  [27, 32, 'pad?'],
  [33, 36, 'mask'],
];

let fi = 0;
for (let i = 0; i < buf.length; i++) {
  const b = buf[i];
  const ascii = (b >= 32 && b < 127) ? String.fromCharCode(b) : '.';
  let label = '';
  if (fi < fields.length && i >= fields[fi][0]) {
    if (i === fields[fi][0]) label = fields[fi][2];
    if (i === fields[fi][1]) fi++;
  }
  console.log(`  ${String(i).padStart(2)}: 0x${b.toString(16).padStart(2, '0')} (${String(b).padStart(3)}) ${ascii}  ${label}`);
}

console.log('\nParsed result:');
const result = parse2483(buf);
if (result.length === 0) {
  console.log('  (nothing parsed)');
} else {
  for (const p of result) {
    console.log(`  name: "${p.name}"  index: ${p.index}  mask: 0x${p.mask.toString(16)}  troops: ${p.troops.length}`);
    for (const t of p.troops) {
      console.log(`    ${t.type} T${t.tier} x${t.count}`);
    }
  }
}

console.log(`\nConsumed: bytes up to the end of last parse`);
console.log(`Leftover: ${buf.length - 37} bytes (from offset 37): ${buf.subarray(37).toString('hex')}`);
