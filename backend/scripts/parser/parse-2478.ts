#!/usr/bin/env npx ts-node
/**
 * Parser de prueba para packet 2478 (guerras a castillos).
 * Uso: npx ts-node tools/parse-2478.ts <hex>
 * El hex es solo el body (sin el header de 4 bytes del MessagePacket).
 */

const hex = process.argv[2];
if (!hex) {
  console.log('Uso: npx ts-node tools/parse-2478.ts <hex-body>');
  console.log('El hex debe ser SOLO el body del paquete 2478 (sin header de 4 bytes).');
  process.exit(1);
}

const payload = Buffer.from(hex, 'hex');
console.log(`\n=== PARSE 2478 ===`);
console.log(`Body total: ${payload.length} bytes`);
console.log(`Body hex:   ${payload.toString('hex')}`);
console.log();

// Header
const count = payload.readUInt16LE(0);
const hdrPad1 = payload.readUInt16LE(2);
const hdrPad2 = payload.readUInt16LE(4);
console.log(`Header [0-5]: count=${count} pad1=${hdrPad1} pad2=${hdrPad2}`);
console.log(`Header hex: ${payload.subarray(0, 6).toString('hex')}`);
console.log();

// Parser actual (el mismo que handle2478)
let off = 6;
let entryIdx = 0;

while (off < payload.length) {
  const entryStart = off;
  console.log(`--- Entry #${entryIdx} @ offset ${off} ---`);

  if (off + 17 > payload.length) {
    console.log(`  No hay suficientes bytes para campos fijos (necesito 17, tengo ${payload.length - off})`);
    break;
  }

  // [0-3] timestamp
  const ts = payload.readUInt32LE(off);
  console.log(`  [${off}-${off + 3}] timestamp = ${ts} (0x${ts.toString(16)}) hex=${payload.subarray(off, off + 4).toString('hex')}`);
  off += 4;

  // [4-7] padding
  const pad1 = payload.readUInt32LE(off);
  console.log(`  [${off}-${off + 3}] padding1 = ${pad1} (0x${pad1.toString(16)}) hex=${payload.subarray(off, off + 4).toString('hex')}`);
  off += 4;

  // [8-11] timeRemaining
  const timeRem = payload.readInt32LE(off);
  console.log(`  [${off}-${off + 3}] timeRem = ${timeRem} hex=${payload.subarray(off, off + 4).toString('hex')}`);
  off += 4;

  // [12-13] coordX
  const cx = payload.readUInt16LE(off);
  console.log(`  [${off}-${off + 1}] coordX = ${cx} hex=${payload.subarray(off, off + 2).toString('hex')}`);
  off += 2;

  // [14-15] coordY
  const cy = payload.readUInt16LE(off);
  console.log(`  [${off}-${off + 1}] coordY = ${cy} hex=${payload.subarray(off, off + 2).toString('hex')}`);
  off += 2;

  // [16] padding
  const padByte = payload[off];
  console.log(`  [${off}] paddingByte = ${padByte} (0x${padByte.toString(16)})`);
  off += 1;

  // Nombre 1 (null-terminated)
  const name1Start = off;
  while (off < payload.length && payload[off] !== 0) off++;
  const name1 = payload.toString('ascii', name1Start, off);
  console.log(`  [${name1Start}-${off - 1}] name1 = "${name1}" hex=${payload.subarray(name1Start, off).toString('hex')}`);
  if (off < payload.length) {
    console.log(`  [${off}] null-term = 0x${payload[off].toString(16)}`);
    off++;
  }

  const afterName1 = off;
  console.log(`  -- Después de name1: offset=${off} --`);

  // Los 15 bytes de padding que salta el código actual
  const skipBytes = 15;
  if (off + skipBytes <= payload.length) {
    console.log(`  [${off}-${off + skipBytes - 1}] skip15 = ${payload.subarray(off, off + skipBytes).toString('hex')}`);
  }
  off += skipBytes;

  // Nombre 2 (null-terminated)
  const name2Start = off;
  while (off < payload.length && payload[off] !== 0) off++;
  const name2 = payload.toString('ascii', name2Start, off);
  console.log(`  [${name2Start}-${off - 1}] name2 = "${name2}" hex=${payload.subarray(name2Start, off).toString('hex')}`);
  if (off < payload.length) {
    console.log(`  [${off}] null-term = 0x${payload[off].toString(16)}`);
    off++;
  }

  console.log(`  Total entry: ${off - entryStart} bytes (offset final: ${off})`);
  console.log(`  => ts=${ts} timeRem=${timeRem}s coord=[${cx},${cy}] rally="${name1}" enemy="${name2}"`);

  // Si todo es ceros, parar
  if (!name1 && cx === 0 && cy === 0 && timeRem === 0) {
    console.log(`  [STOP] Entrada vacía, terminando.`);
    break;
  }

  console.log();
  entryIdx++;
}

if (off < payload.length) {
  console.log(`\n[WARN] Quedan ${payload.length - off} bytes sin parsear: ${payload.subarray(off).toString('hex')}`);
} else {
  console.log(`\n[OK] Todos los bytes fueron parseados.`);
}

// Ahora probar con diferentes cantidades de padding después de name1
console.log(`\n\n=== PRUEBA DE PADDING ALTERNATIVO ===`);
console.log(`Probando valores de skip desde 0 hasta 20 bytes después del null de name1...\n`);

for (let skip = 0; skip <= 20; skip++) {
  let o = 6;
  const results: string[] = [];
  let valid = true;

  for (let e = 0; e < 5 && o < payload.length; e++) {
    if (o + 17 > payload.length) { valid = false; break; }

    const ts = payload.readUInt32LE(o); o += 4;
    o += 4; // padding
    const timeRem = payload.readInt32LE(o); o += 4;
    const cx = payload.readUInt16LE(o); o += 2;
    const cy = payload.readUInt16LE(o); o += 2;
    o += 1; // padding byte

    // name1
    const n1s = o;
    while (o < payload.length && payload[o] !== 0) o++;
    const name1 = payload.toString('ascii', n1s, o);
    if (o < payload.length) o++;

    // skip variable
    o += skip;

    // name2
    const n2s = o;
    while (o < payload.length && payload[o] !== 0) o++;
    const name2 = payload.toString('ascii', n2s, o);
    if (o < payload.length) o++;

    if (!name1 && cx === 0 && cy === 0 && timeRem === 0) break;

    const tsDate = new Date(ts * 1000);
    const ok = timeRem >= 0 && timeRem < 86400 * 30 && cx > 0 && cx < 1000 && cy > 0 && cy < 1000 && name1.length > 0;
    const flag = ok ? '✓' : '✗';
    results.push(`${flag} [${cx},${cy}] t=${timeRem}s "${name1}"->"${name2}" ts=${tsDate.toISOString().slice(0, 16)}`);
  }

  const everyNameValid = results.every(r => r.startsWith('✓'));
  const marker = everyNameValid && results.length > 0 ? ' <<<<<' : '';
  console.log(`skip=${String(skip).padStart(2)}: ${results.length > 0 ? results.join(' | ') : '(sin entradas)'}${marker}`);
}
