const { parseRivals, parseColiseum } = require('../dist/models/coliseum');

// Exact hex from user capture (body of 5201, after 4-byte wire header)
const raw = '
                                                                                                                                        a20055140400010047756172642e313439340000000000006a05000001001802013f14001802013f1c001802013f06001802013f04001802013f1d0047756172642e31363333000000000000800500001d001502013f18001502013f13001502013f1a001502013f02001502013f0c0047756172642e30303939000000000000890500000c003105033f1b003105033f04003105033f0e003105033f0f00
aa0e00000100140003000600040000000285336a00000000fc3100001e00577561736f736b6920393939004c794d3d0e00001d003c08053f12003c08053f0d003c08053f05003c08050f17003c08053f2a003043656e747572793000000000453935520e00001d003c08053f12003c08053f30003c08033f17003c08053f02003c08053f01006c656f68656e676f3032350000686533790e000001003605011f03003906050704003905051f05003704011f09003905010f090500d0e5666a000000002000230029003c001000d0e5666a000000001a003c0024004b00df00000000';
const body = Buffer.from(raw, 'hex');

console.log('=== BYTE ANALYSIS ===');
console.log('Total body:', body.length, 'bytes');
console.log();

// Show each byte at key offsets
for (let i = 0; i < Math.min(90, body.length); i++) {
  const b = body[i];
  const ch = (b >= 0x20 && b <= 0x7e) ? String.fromCharCode(b) : '.';
  if (i >= 30) process.stdout.write(`${i.toString().padStart(3)}: ${b.toString(16).padStart(2,'0')} '${ch}'\n`);
}

console.log();
console.log('=== PARSE COLISEUM ===');
const state = parseColiseum(body);
console.log('Rank:', state.rank, '  Fights:', state.fightsDone, '  Gems:', state.gems);
console.log('Rivals:', state.rivals.length);
for (const r of state.rivals) {
  const nameHex = Buffer.from(r.name, 'ascii').toString('hex');
  console.log(`  "${r.name}" (len=${r.name.length}, hex=${nameHex}) tag="${r.guildTag}" heroId=${r.heroId}`);
}

// Show raw bytes at offset 63 (where ASKALXX should start)
console.log();
console.log('=== RAW BYTES at offsets 58-90 ===');
for (let i = 58; i < Math.min(95, body.length); i++) {
  const b = body[i];
  const ch = (b >= 0x20 && b <= 0x7e) ? String.fromCharCode(b) : '.';
  process.stdout.write(`${i.toString().padStart(3)}: ${b.toString(16).padStart(2,'0')} '${ch}' `);
  if ((i - 58) % 10 === 9) console.log();
}
console.log();
