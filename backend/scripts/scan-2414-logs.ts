/**
 * Escanea logs/bot_*.log en busca de Proto=2414 con marchas (count>0),
 * parsea las entries y muestra la firma de bytes no nulos de cada una
 * (para cazar dónde se guarda la composición tropa/tier/cantidad).
 * Uso: npx ts-node scripts/scan-2414-logs.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { parse2414 } from '../src/bot/parsers/marches.parser';

const logsDir = path.join(__dirname, '..', '..', 'logs');
const files = fs.readdirSync(logsDir).filter(f => f.startsWith('bot_') && f.endsWith('.log'));

const samples: { file: string; line: number; body: Buffer }[] = [];
const re = /\[RECV #\d+\] Proto=2414 Len=(\d+) header=\w+ body=([0-9a-f]+)/;

for (const f of files) {
  const content = fs.readFileSync(path.join(logsDir, f), 'utf-8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]!);
    if (!m) continue;
    const len = parseInt(m[1]!, 10);
    const hex = m[2]!;
    if (hex.length !== (len - 4) * 2) {
      console.log(`WARN ${f}:${i + 1} body truncado? Len=${len} hex=${hex.length / 2}B`);
      continue;
    }
    const body = Buffer.from(hex, 'hex');
    if (body[1]! > 0) samples.push({ file: f, line: i + 1, body });
  }
}

console.log(`muestras con marchas: ${samples.length}\n`);

// firma: bytes no nulos del cuerpo de cada entry
function signature(corp: Buffer): string {
  const parts: string[] = [];
  let run = -1;
  for (let j = 0; j < corp.length; j++) {
    if (corp[j] !== 0) { if (run < 0) run = j; }
    else if (run >= 0) { parts.push(`@${run}=${corp.subarray(run, j).toString('hex')}`); run = -1; }
  }
  if (run >= 0) parts.push(`@${run}=${corp.subarray(run).toString('hex')}`);
  return parts.join(' ');
}

const bySig = new Map<string, { count: number; examples: string[] }>();
for (const s of samples) {
  const d = parse2414(s.body)!;
  for (const e of d.entries) {
    // re-parse crudo para la firma (sin normalizar)
    const idx = d.entries.indexOf(e);
    let off = 2 + idx * 150;
    const corp = s.body.subarray(off + 1, off + 150);
    const sig = `state=${corp[0]} ${signature(corp)}`;
    const cur = bySig.get(sig) ?? { count: 0, examples: [] };
    cur.count++;
    if (cur.examples.length < 4) cur.examples.push(`${s.file.replace('bot_', '').replace('.log', '')}:${s.line}`);
    bySig.set(sig, cur);
  }
}

const ordered = [...bySig.entries()].sort((a, b) => b[1].count - a[1].count);
for (const [sig, info] of ordered) {
  console.log(`x${String(info.count).padStart(4)}  ${sig}`);
  console.log(`       ej: ${info.examples.join(', ')}`);
}
