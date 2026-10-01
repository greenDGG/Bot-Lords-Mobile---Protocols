/**
 * Dump completo de muestras 2414 con marchas tomadas de logs/bot_*.log.
 * Uso: npx ts-node scripts/dump-2414-samples.ts
 */
import * as fs from 'fs';
import * as path from 'path';

const logsDir = path.join(__dirname, '..', '..', 'logs');

// file:line → (entry índice dentro del paquete, o null = todos)
const targets: { file: string; line: number; only?: number }[] = [
  { file: 'bot_858715903_20260722_150652.log', line: 52 },        // state=01 (rico)
  { file: 'bot_1311557395_20260722_150638.log', line: 47 },       // state=03
  { file: 'bot_1761012733_20260723_144253.log', line: 49 },       // state=02 (5 entries)
  { file: 'bot_699200412_20260725_141455.log', line: 53 },        // state=04
  { file: 'bot_1297816148_20260726_094059.log', line: 57 },       // state=15 (0x15)
  { file: 'bot_699200412_20260730_134133.log', line: 55 },        // state=0f
];

const re = /\[RECV #\d+\] Proto=2414 Len=(\d+) header=\w+ body=([0-9a-f]+)/;

const ascii = (b: Buffer): string => Array.from(b).map(c => (c >= 32 && c < 127 ? String.fromCharCode(c) : '.')).join('');

for (const t of targets) {
  const p = path.join(logsDir, t.file);
  if (!fs.existsSync(p)) { console.log(`FALTA ${t.file}`); continue; }
  const lines = fs.readFileSync(p, 'utf-8').split('\n');
  const raw = lines[t.line - 1] ?? '';
  const m = re.exec(raw);
  if (!m) { console.log(`NO MATCH ${t.file}:${t.line}`); continue; }
  const body = Buffer.from(m[2]!, 'hex');
  console.log(`\n===== ${t.file}:${t.line} (body ${body.length} B) =====`);
  console.log(`cab: limit=${body[0]} count=${body[1]}`);
  const count = body[1]!;
  for (let i = 0; i < count; i++) {
    const off = 2 + i * 150;
    const idx = body[off]!;
    const corp = body.subarray(off + 1, off + 150);
    console.log(`--- entry ${i} (index=${idx}) ---`);
    for (let j = 0; j < corp.length; j += 16) {
      const row = corp.subarray(j, j + 16);
      const hex = Array.from(row).map(x => x.toString(16).padStart(2, '0')).join(' ');
      console.log(`  ${String(j).padStart(3)}  ${hex.padEnd(47)}  ${ascii(row)}`);
    }
  }
}
