/**
 * 2414 layout definitiva:
 *  entry(150) = [idx u8][body 149]
 *  body[0]=state, body[1..10]=5×u16 héroes, body[11..74]=16×u32 slots
 *  (orden 2401: Inf T1-4, Rng T1-4, Cav T1-4, Sie T1-4),
 *  body[75..77]=coord, body[113..125]=nombre, body[126..133]=ts, body[134..137]=dur.
 *
 * Correlaciona cada slot con TODOS los 2401 del archivo (histograma idx2414 -> idx2401).
 */
import * as fs from 'fs';
import * as path from 'path';

const dir = path.join(__dirname, '..', '..', 'logs');
const files = fs.readdirSync(dir).filter(f => f.startsWith('bot_') && f.endsWith('.log'));

const SLOT = (i: number) => {
  const types = ['Inf', 'Rng', 'Cav', 'Sie'];
  if (i < 16) return `${types[Math.floor(i / 4)]} T${(i % 4) + 1}`;
  if (i < 20) return `T5 ${types[i - 16]}`;
  return `?${i}`;
};

interface P2401 { line: number; counts: number[] }

const hist = new Map<string, number>();
let found = 0;
let notFound = 0;

for (const f of files) {
  const lines = fs.readFileSync(path.join(dir, f), 'utf-8').split('\n');
  const p2401: P2401[] = [];
  const rows: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m1 = lines[i]!.match(/Proto=2401 Len=\d+ header=[0-9a-f]+ body=([0-9a-f]+)/);
    if (m1) {
      const b = Buffer.from(m1[1]!, 'hex');
      if (b.length >= 80) {
        const counts: number[] = [];
        for (let k = 0; k < 20; k++) counts.push(b.readUInt32LE(k * 4));
        p2401.push({ line: i + 1, counts });
      }
      continue;
    }
    const m = lines[i]!.match(/Proto=2414 Len=\d+ header=[0-9a-f]+ body=([0-9a-f]+)/);
    if (!m) continue;
    const b = Buffer.from(m[1]!, 'hex');
    if (b.length < 3) continue;
    const count = b[1]!;
    if (count === 0) continue;
    for (let k = 0; k < count && 2 + k * 150 + 149 < b.length; k++) {
      const e = 2 + k * 150;
      const body = b.subarray(e + 1, e + 150); // 149 B
      const state = body[0]!;
      const heroes: number[] = [];
      for (let h = 0; h < 5; h++) heroes.push(body.readUInt16LE(1 + h * 2));
      const stacks: { idx: number; v: number }[] = [];
      for (let idx = 0; idx < 16; idx++) {
        const v = body.readUInt32LE(11 + idx * 4);
        if (v !== 0) stacks.push({ idx, v });
      }
      const heroHex = heroes.some(h => h !== 0) ? heroes.join(',') : '';
      const st = stacks.map(s => {
        let hit = 'no2401';
        for (const p of p2401) {
          const at = p.counts.indexOf(s.v);
          if (at >= 0) {
            hit = at === s.idx ? `=${SLOT(s.idx)}` : `@${SLOT(at)}!`;
            break;
          }
        }
        if (hit === 'no2401') notFound++;
        else found++;
        const key = hit.startsWith('=') ? 'IGUAL-mismo-slot'
          : hit.endsWith('!') ? `slot2414=${SLOT(s.idx)} -> 2401@${hit.slice(1, -1)}`
          : 'valor-no-en-2401';
        hist.set(key, (hist.get(key) ?? 0) + 1);
        return `[${s.idx}:${SLOT(s.idx)}=${s.v}${hit === `=${SLOT(s.idx)}` ? '=' : hit}]`;
      }).join(' ');
      const tail = body.subarray(96, 113).toString('hex');
      const name = body.subarray(113, 126);
      const nm = name.toString('latin1').replace(/\0.*$/, '');
      if (!heroHex && !stacks.length) continue;
      rows.push(`  st=${state} heroes=${heroHex || '-'} ${st}${nm ? ` name="${nm}"` : ''} @96=${tail}`);
    }
  }
  if (rows.length) {
    console.log(`\n=== ${f}`);
    const uniq = new Map<string, number>();
    for (const r of rows) uniq.set(r, (uniq.get(r) ?? 0) + 1);
    for (const [r, n] of uniq) console.log(`${n > 1 ? `x${n} ` : '  '}${r}`);
  }
}
console.log('\n--- HISTOGRAMA slot2414 -> slot2401 ---');
for (const [k, v] of [...hist.entries()].sort((a, b) => b[1] - a[1])) console.log(`${String(v).padStart(5)}  ${k}`);
console.log(`\nencontrados=${found} no-en-2401=${notFound}`);
