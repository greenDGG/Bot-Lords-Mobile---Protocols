// Test: Parse 7315 fortress wars
// Usage: node scripts/test-parse-7315.js

const raw = '000000000044d4956a000000002c01000026021d290049204c6f76652041646f0000000e04b09b040030202300cf042602bb050100';
const payload = Buffer.from(raw, 'hex');

console.log('=== 7315 PAYLOAD ===');
console.log('Total:', payload.length, 'bytes');
console.log();

for (let i = 0; i < payload.length; i++) {
  const b = payload[i];
  const ch = (b >= 0x20 && b <= 0x7e) ? String.fromCharCode(b) : '.';
  process.stdout.write(`${i.toString().padStart(4)}: ${b.toString(16).padStart(2, '0')} '${ch}'  `);
  if ((i + 1) % 8 === 0) console.log();
}
console.log();
console.log();

console.log('=== ENTRIES ===');
let off = 0;
let count = 0;

while (off + 35 <= payload.length) {
  const startOff = off;
  const pad1 = payload.readUInt32LE(off); off += 4;
  const sep1 = payload[off]; off += 1;
  const ts = payload.readUInt32LE(off); off += 4;
  const pad2 = payload.readUInt32LE(off); off += 4;
  const timeRem = payload.readUInt16LE(off); off += 2;
  const pad3 = payload.readUInt16LE(off); off += 2;
  const iconType = payload.readUInt16LE(off); off += 2;
  const iconId = payload.readUInt16LE(off); off += 2;

  const rawName = payload.toString('ascii', off, off + 13);
  const enemyName = rawName.replace(/\0+$/, '');
  off += 13;
  const sep2 = payload[off]; off += 1;

  let subType = 0, troopsCurrent = 0, troopsMax = 0, kingdom = 0;
  let loc0 = 0, loc1 = 0, loc2 = 0, level = 0;

  if (off + 2 <= payload.length) { subType = payload.readUInt16LE(off); off += 2; }
  if (off + 4 <= payload.length) { troopsCurrent = payload.readUInt32LE(off); off += 4; }
  if (off + 4 <= payload.length) { troopsMax = payload.readUInt32LE(off); off += 4; }
  if (off + 2 <= payload.length) { kingdom = payload.readUInt16LE(off); off += 2; }
  if (off < payload.length) { loc0 = payload[off]; off += 1; }
  if (off < payload.length) { loc1 = payload[off]; off += 1; }
  if (off < payload.length) { loc2 = payload[off]; off += 1; }
  if (off < payload.length) { level = payload[off]; off += 1; }
  off += 2;

  if (!enemyName && timeRem === 0 && ts === 0) break;

  const date = ts > 0 ? new Date(ts * 1000).toISOString() : 'invalid';
  console.log(`  [${count}] name="${enemyName}"`);
  console.log(`       timeRem=${timeRem}s (${Math.floor(timeRem/60)}m ${timeRem%60}s)`);
  console.log(`       ts=${ts} (${date})`);
  console.log(`       iconType=0x${iconType.toString(16)} iconId=0x${iconId.toString(16)}`);
  console.log(`       subType=0x${subType.toString(16)}`);
  console.log(`       troops=${troopsCurrent}/${troopsMax}`);
  console.log(`       kingdom=${kingdom} level=${level}`);
  console.log(`       loc=[${loc0},${loc1},${loc2}]`);
  console.log();
  count++;
}

if (count === 0) {
  console.log('  No entries parsed');
} else {
  console.log(`  Total: ${count} entries`);
}
