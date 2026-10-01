/** Tabula todas las entries 2414 de todos los logs, agrupadas por state. */
import * as fs from 'fs';
import * as path from 'path';
import { decodeCoordBytes } from '../src/models/map-coords';

const dir = path.join(__dirname, '..', '..', 'logs');
const files = fs.readdirSync(dir).filter(f => f.startsWith('bot_') && f.endsWith('.log'));

interface Row { state: number; nz1: string; tail: string; name: string; u106: string; ts: number; dur: number; coord: string; }
const groups = new Map<string, Map<string, { row: Row; n: number; files: Set<string> }>>();

for (const f of files) {
  const lines = fs.readFileSync(path.join(dir, f), 'utf-8').split('\n');
  for (const l of lines) {
    const m = l.match(/Proto=2414 Len=\d+ header=[0-9a-f]+ body=([0-9a-f]+)/);
    if (!m) continue;
    const b = Buffer.from(m[1]!, 'hex');
    if (b.length < 152) continue;
    const count = b[1]!;
    for (let e = 0; e < count && 2 + (e + 1) * 150 <= b.length; e++) {
      const ent = b.subarray(2 + e * 150 + 1, 2 + (e + 1) * 150); // body sin idx
      const state = ent[0]!;
      // @1..74: ultima posicion no nula
      let last = 0;
      for (let i = 1; i < 75; i++) if (ent[i] !== 0) last = i;
      const nz1 = ent.subarray(1, last + 1).toString('hex') || '(cero)';
      // @78..125: ultima no nula
      let lastT = 77;
      for (let i = 78; i < 126; i++) if (ent[i] !== 0) lastT = i;
      const tail = lastT > 77 ? ent.subarray(78, lastT + 1).toString('hex') : '(cero)';
      let name = '';
      for (let i = 104; i <= 125; i++) {
        if (ent[i]! >= 0x20 && ent[i]! <= 0x7e) {
          let j = i, s = '';
          while (j <= 125 && ent[j]! >= 0x20 && ent[j]! <= 0x7e) { s += String.fromCharCode(ent[j]!); j++; }
          if (j <= 125 && ent[j] === 0 && s.length >= 3) { name = s; break; }
        }
      }
      const ts = Number(ent.readBigUInt64LE(126));
      const dur = ent.readUInt32LE(134);
      const coord = ent.subarray(75, 78).toString('hex');
      const key = `state=0x${state.toString(16)}`;
      const sig = `A:${nz1}|B:${tail}`;
      if (!groups.has(key)) groups.set(key, new Map());
      const g = groups.get(key)!;
      const prev = g.get(sig);
      if (prev) { prev.n++; prev.files.add(f); }
      else g.set(sig, { row: { state, nz1, tail, name, u106: ent.subarray(106, 108).toString('hex'), ts, dur, coord }, n: 1, files: new Set([f]) });
    }
  }
}

for (const [key, g] of [...groups].sort()) {
  console.log(`\n===== ${key}: ${g.size} firmas distintas, entries=${[...g.values()].reduce((s, v) => s + v.n, 0)}`);
  const sorted = [...g.values()].sort((a, b) => b.n - a.n);
  for (const { row, n, files } of sorted.slice(0, 14)) {
    const dec = decodeCoordBytes([parseInt(row.coord.slice(0, 2), 16), parseInt(row.coord.slice(2, 4), 16), parseInt(row.coord.slice(4, 6), 16)]);
    console.log(`  x${n} A@1+=[${row.nz1}] B@78+=[${row.tail}] @106=${row.u106} coord=${row.coord}(${dec.x},${dec.y}) name="${row.name}" ts=${row.ts} dur=${row.dur} files=${[...files].slice(0, 2).join(',')}`);
  }
  if (sorted.length > 14) console.log(`  ... +${sorted.length - 14} firmas mas`);
}
