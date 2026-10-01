/**
 * Inspección de Proto=2414 (lista de marchas propias) — análisis de capturas.
 * Uso: npx ts-node scripts/inspect-2414.ts
 */
import * as fs from 'fs';
import * as path from 'path';

const md = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'teories', 'marchs.md'), 'utf-8');

// Extrae los hex del markdown por números de línea (las capturas están
// troceadas en líneas sueltas con anotaciones entre medio).
const lines = md.split('\n');
const ascii = (b: number[]): string => b.map(c => (c >= 32 && c < 127 ? String.fromCharCode(c) : '.')).join('');
const hexAt = (n: number): string => {
  const clean = lines[n - 1]!.split('//')[0]!.trim();
  if (!/^[0-9a-f]+$/i.test(clean)) throw new Error(`línea ${n} no es hex: "${lines[n - 1]}"`);
  if (clean.length % 2 !== 0) throw new Error(`línea ${n} impar: ${clean.length}`);
  return clean.toLowerCase();
};
const concat = (ns: number[]): { hex: string; ns: number[] } => ({ hex: ns.map(hexAt).join(''), ns });

interface Group { name: string; parts: { hex: string; ns: number[] }[]; }
const groups: Group[] = [
  { name: 'captura1 (1 marcha)', parts: [concat([7, 8, 9, 10, 11])] },
  { name: 'captura2 (3 marchas)', parts: [concat([15, 16, 17, 19, 20, 21]), concat([23, 24, 25, 26]), concat([28, 29, 30])] },
  { name: 'captura3 (llegadas)', parts: [concat([35])] },
];

for (const g of groups) {
  console.log(`\n===== ${g.name} =====`);
  const full = Buffer.from(g.parts.map(p => p.hex).join(''), 'hex');
  console.log(`total bytes = ${full.length}`);
  for (const p of g.parts) console.log(`  líneas [${p.ns.join(',')}]: ${p.hex.length / 2} B  ${p.hex.slice(0, 80)}${p.hex.length > 80 ? '…' : ''}`);

  // Anclas conocidas
  const anchors: [string, string][] = [
    ['coord d30290', 'd30290'], ['coord 3a03d2', '3a03d2'], ['coord 2a03da', '2a03da'],
    ['coord 91e000', '91e000'], ['nombre yman', '796d616e20323532'],
    ['nombre ig ZL', '6967205a4c'], ['nombre T LONG', '54204c4f4e47'],
    ['nombre Asado IDL', '417361646f2049444c'],
  ];
  for (const [label, hx] of anchors) {
    const needle = Buffer.from(hx, 'hex');
    let from = 0;
    const hits: number[] = [];
    for (;;) {
      const i = full.indexOf(needle, from);
      if (i < 0) break;
      hits.push(i);
      from = i + 1;
    }
    if (hits.length) console.log(`  ${label}: offsets [${hits.join(', ')}]`);
  }

  // timestamps plausibles (u64 LE, epoch 2026 ~ 1790000000..1793000000)
  for (let i = 0; i + 8 <= full.length; i++) {
    const v = full.readBigUInt64LE(i);
    if (v >= 1790000000n && v <= 1793000000n) {
      console.log(`  ts u64 @${i} = ${v} (0x${v.toString(16)})`);
      i += 7;
    }
  }
  // durations plausibles (u32 100..86400)
  for (let i = 0; i + 4 <= full.length; i++) {
    const v = full.readUInt32LE(i);
    if (v >= 100 && v <= 86400 && (i === 0 || full[i - 1] === 0)) {
      const prevZeroRun = (() => { let k = i - 1; while (k >= 0 && full[k] === 0) k++; return i - 1 - k; })();
      if (prevZeroRun >= 2) console.log(`  dur? u32 @${i} = ${v}s (2 bytes ceros previos+)`);
    }
  }
}

// ── Fase 2: entries individuales (cabecera 2B + n × (1B index + 149B cuerpo)) ──
interface Entry { cap: string; index: number; body: Buffer; }
const entries: Entry[] = [];
{
  const push = (cap: string, buf: Buffer) => {
    if (buf.length < 2) return;
    const count = buf[1]!;
    let off = 2;
    for (let i = 0; i < count && off + 150 <= buf.length; i++) {
      entries.push({ cap, index: buf[off]!, body: buf.subarray(off + 1, off + 150) });
      off += 150;
    }
    console.log(`\n${cap}: límite=${buf[0]} count=${count} bytes usados=${off}/${buf.length}`);
  };
  // cap1: la cabecera `06 01` + index `01` está anotada en texto (líneas 4-6), no en hex.
  push('cap1', Buffer.from('0601' + '01' + groups[0]!.parts[0]!.hex, 'hex'));
  push('cap2', Buffer.from(groups[1]!.parts.map(p => p.hex).join(''), 'hex'));
  push('cap3', Buffer.from(groups[2]!.parts[0]!.hex, 'hex'));
}

const dump = (label: string, b: Buffer) => {
  console.log(`\n--- ${label} (${b.length} B) ---`);
  for (let i = 0; i < b.length; i += 16) {
    const row = b.subarray(i, i + 16);
    const hex = Array.from(row).map(x => x.toString(16).padStart(2, '0')).join(' ');
    const asc = ascii(Array.from(row));
    console.log(`  ${i.toString().padStart(3)}  ${hex.padEnd(47)}  ${asc}`);
  }
};

dump('cap1 body (1 marcha, en vuelo)', entries.find(e => e.cap === 'cap1')!.body);
dump('cap2 entry0 (index 0, en vuelo)', entries.find(e => e.cap === 'cap2' && e.index === 0)! .body);
dump('cap2 entry1 (index 1, en vuelo)', entries.find(e => e.cap === 'cap2' && e.index === 1)! .body);
dump('cap3 entry0 (index 0, llegó)', entries.find(e => e.cap === 'cap3' && e.index === 0)! .body);

// diff byte a byte cap2[0] vs cap3[0] (mismas coords, estados distintos)
const a = entries.find(e => e.cap === 'cap2' && e.index === 0)!.body;
const b = entries.find(e => e.cap === 'cap3' && e.index === 0)!.body;
console.log('\n--- diff cap2[0] (vuelo) vs cap3[0] (llegada) ---');
for (let i = 0; i < Math.min(a.length, b.length); i++) {
  if (a[i] !== b[i]) console.log(`  @${i}: ${a[i]!.toString(16)} → ${b[i]!.toString(16)}`);
}
