#!/usr/bin/env node
const hex = process.argv[2];
if (!hex) { console.log('Uso: node tools/parse-nurse.js <hex>'); process.exit(1); }
const body = Buffer.from(hex, 'hex');

const TYPE_NAMES = ['Infantry', 'Ranged', 'Cavalry', 'Siege'];

console.log(`Body: ${body.length} bytes\n`);

if (body.length < 172) {
  console.log(`[ERROR] Necesita 172 bytes mínimo, tiene ${body.length}`);
  process.exit(1);
}

let off = 0;

// 1. 16 uint32 — injured T1-T4 (4 tiers × 4 types)
const injuredT1T4 = [];
for (let i = 0; i < 16; i++) {
  injuredT1T4.push(body.readUInt32LE(off));
  off += 4;
}

// 2. 16 uint32 — healing T1-T4
const healingT1T4 = [];
for (let i = 0; i < 16; i++) {
  healingT1T4.push(body.readUInt32LE(off));
  off += 4;
}

// 3. finishTimestamp
const finishTimestamp = body.readUInt32LE(off);
off += 4;

// 4. rawUnknown
const rawUnknown = body.readUInt32LE(off);
off += 4;

// 5. totalHealingSeconds
const totalHealingSeconds = body.readUInt32LE(off);
off += 4;

// 6. 4 uint32 — injured T5
const injuredT5 = [];
for (let i = 0; i < 4; i++) {
  injuredT5.push(body.readUInt32LE(off));
  off += 4;
}

// 7. 4 uint32 — healing T5
const healingT5 = [];
for (let i = 0; i < 4; i++) {
  healingT5.push(body.readUInt32LE(off));
  off += 4;
}

// Print
console.log('=== INJURED T1-T4 (16 values) ===');
const TYPE_ORDER = [0, 1, 2, 3]; // Infantry, Ranged, Cavalry, Siege
let idx = 0;
for (const type of TYPE_ORDER) {
  for (let tier = 1; tier <= 4; tier++) {
    console.log(`  ${TYPE_NAMES[type]} T${tier}: ${injuredT1T4[idx]}`);
    idx++;
  }
}

console.log('\n=== HEALING T1-T4 (16 values) ===');
idx = 0;
for (const type of TYPE_ORDER) {
  for (let tier = 1; tier <= 4; tier++) {
    console.log(`  ${TYPE_NAMES[type]} T${tier}: ${healingT1T4[idx]}`);
    idx++;
  }
}

console.log('\n=== T5 ===');
for (let i = 0; i < 4; i++) {
  console.log(`  ${TYPE_NAMES[i]} T5 injured=${injuredT5[i]} healing=${healingT5[i]}`);
}

console.log('\n=== METADATA ===');
console.log(`  finishTimestamp     = ${finishTimestamp} (${new Date(finishTimestamp * 1000).toISOString()})`);
console.log(`  rawUnknown          = ${rawUnknown} (0x${rawUnknown.toString(16)})`);
console.log(`  totalHealingSeconds = ${totalHealingSeconds} (${Math.floor(totalHealingSeconds/60)}m ${totalHealingSeconds%60}s)`);

// Summary
let totalInjured = 0, totalHealing = 0;
for (const v of injuredT1T4) totalInjured += v;
for (const v of healingT1T4) totalHealing += v;
for (const v of injuredT5) totalInjured += v;
for (const v of healingT5) totalHealing += v;

console.log(`\n=== RESUMEN ===`);
console.log(`  Total heridos:  ${totalInjured}`);
console.log(`  Curándose:      ${totalHealing}`);

if (off < body.length) {
  console.log(`\n[WARN] ${body.length - off} bytes sobrantes: ${body.subarray(off).toString('hex')}`);
}
