/**
 * Saca el bloque de 6 bytes (coord3+coord3) que arranca el payload de cada record 2220
 * y lo correlaciona con las marchas: ¿el mismo bloque se repite? ¿el 0x12 apunta a una marcha?
 * Uso: npx ts-node scripts/analyze-blocks.ts [rutaLog]
 */
import * as fs from 'fs';
import * as path from 'path';
import { decodeCoordId } from '../src/models/map-coords';

function findLatestLog(): string {
  const base = path.join(__dirname, '..', '..', 'logs');
  let best = '';
  let bestMtime = 0;
  for (const dir of fs.readdirSync(base)) {
    const full = path.join(base, dir);
    if (!fs.statSync(full).isDirectory()) continue;
    for (const f of fs.readdirSync(full)) {
      if (!f.endsWith('.log')) continue;
      const p = path.join(full, f);
      const m = fs.statSync(p).mtimeMs;
      if (m > bestMtime) { bestMtime = m; best = p; }
    }
  }
  return best;
}

const logPath = process.argv[2] || findLatestLog();
console.log(`log: ${logPath}`);

const lines = fs.readFileSync(logPath, 'utf-8').split(/\r?\n/);

interface Block { hex: string; a: string; b: string }
const blockOf = (buf: Buffer, off: number): Block => {
  const h = buf.toString('hex', off + 11, off + 17);
  const c1 = decodeCoordId((buf[off + 11]! << 16) | (buf[off + 12]! << 8) | buf[off + 13]!);
  const c2 = decodeCoordId((buf[off + 14]! << 16) | (buf[off + 15]! << 8) | buf[off + 16]!);
  return { hex: h, a: `(${c1.x},${c1.y})`, b: `(${c2.x},${c2.y})` };
};

interface MarchRec { wall: string; name: string; origin: string; dest: string; start: number; dur: number; block: Block }
const marches: MarchRec[] = [];
const kinds = new Map<string, number>();
const blockKinds = new Map<string, number>();

let prevWall = '';
for (const line of lines) {
  if (line.length >= 10 && line[0] === '[') {
    const w = line.slice(1, 9);
    if (/^\d\d:\d\d:\d\d$/.test(w)) {
      prevWall = w;
    }
  }
  const idx = line.indexOf('Proto=2220');
  if (idx < 0) continue;
  const wall = line.slice(1, 9);
  const b = line.indexOf('body=', idx);
  if (b < 0) continue;
  const hex = line.slice(b + 5).trim().replace(/\s/g, '');
  if (!hex || hex.length % 2 !== 0) continue;
  const buf = Buffer.from(hex, 'hex');

  let off = 0;
  while (off + 17 <= buf.length) {
    const kind = buf[off]!;
    let len: number;
    if (kind === 0x0f) len = 15;
    else if (kind === 0x12) len = 31;
    else {
      const size = buf.readUInt16LE(off + 9);
      len = 11 + size;
    }
    if (len < 11 || off + len > buf.length) break;
    kinds.set(`${len}/${kind.toString(16)}`, (kinds.get(`${len}/${kind.toString(16)}`) ?? 0) + 1);
    if (off + 17 <= buf.length) {
      const bk = blockOf(buf, off);
      blockKinds.set(bk.hex, (blockKinds.get(bk.hex) ?? 0) + 1);
      if (kind === 0x0e && len === 73) {
        const name = buf.toString('utf8', off + 17, off + 30).replace(/\0.*$/, '');
        const start = buf.readUInt32LE(off + 41);
        const dur = buf.readUInt32LE(off + 49);
        const c1 = decodeCoordId((buf[off + 35]! << 16) | (buf[off + 36]! << 8) | buf[off + 37]!);
        const c2 = decodeCoordId((buf[off + 38]! << 16) | (buf[off + 39]! << 8) | buf[off + 40]!);
        marches.push({
          wall, name, start, dur, block: bk,
          origin: `(${c1.x},${c1.y})`, dest: `(${c2.x},${c2.y})`,
        });
      }
    }
    off += len;
  }
}

console.log(`\n--- marchas 73B: ${marches.length} ---`);
console.log('\n--- tabla (wall | name | origin | dest | start | dur | bloqueA | bloqueB) primeras 40 ---');
const utc = (u: number) => new Date(u * 1000).toISOString().slice(11, 19);
for (const m of marches.slice(0, 40)) {
  console.log(`  ${m.wall} | ${m.name.slice(0, 14)} | ${m.origin} | ${m.dest} | ${utc(m.start)} | ${m.dur} | ${m.block.a} | ${m.block.b}`);
}
const target = '360200110200';

// ¿bloqueA == origin / dest?
let aEqO = 0, aEqD = 0, bEqO = 0, bEqD = 0;
for (const m of marches) {
  if (m.block.a === m.origin) aEqO++;
  if (m.block.a === m.dest) aEqD++;
  if (m.block.b === m.origin) bEqO++;
  if (m.block.b === m.dest) bEqD++;
}
console.log(`\n--- bloqueA==origin: ${aEqO} | ==dest: ${aEqD} | bloqueB==origin: ${bEqO} | ==dest: ${bEqD} (de ${marches.length}) ---`);

// bloqueB como u24 y su relacion con startTime
const u24 = (h: string) => parseInt(h.slice(6, 8), 16) | (parseInt(h.slice(8, 10), 16) << 8) | (parseInt(h.slice(10, 12), 16) << 16);
const byPlayer = new Map<string, { start: number; b: number }[]>();
for (const m of marches) {
  if (!byPlayer.has(m.name)) byPlayer.set(m.name, []);
  byPlayer.get(m.name)!.push({ start: m.start, b: u24(m.block.hex) });
}
let mono = 0, notMono = 0;
for (const [, arr] of byPlayer) {
  arr.sort((x, y) => x.start - y.start);
  let ok = true;
  for (let i = 1; i < arr.length; i++) if (arr[i]!.b < arr[i - 1]!.b) { ok = false; break; }
  if (ok && arr.length > 1) mono++; else if (arr.length > 1) notMono++;
}
console.log(`--- bloqueB no-decreciente por jugador (con start ordenado): ${mono} si / ${notMono} no ---`);
for (const [n, arr] of [...byPlayer.entries()].slice(0, 4)) {
  arr.sort((x, y) => x.start - y.start);
  console.log(`  ${n}: ${arr.slice(0, 12).map(e => `${utc(e.start)}=${e.b}`).join(' ')}`);
}
console.log(`\n--- marchas con el bloque de las aceleraciones (${target}) ---`);
for (const m of marches) {
  if (m.block.hex === target) {
    console.log(`  ${m.wall} ${m.name} ${m.origin}->${m.dest} start=${new Date(m.start * 1000).toISOString().slice(11, 19)} dur=${m.dur}`);
  }
}

// ¿el bloque identifica al jugador (castle) o a la marcha?
const byName = new Map<string, Set<string>>();
const byBlock = new Map<string, Set<string>>();
for (const m of marches) {
  if (!byName.has(m.name)) byName.set(m.name, new Set());
  byName.get(m.name)!.add(m.block.hex);
  if (!byBlock.has(m.block.hex)) byBlock.set(m.block.hex, new Set());
  byBlock.get(m.block.hex)!.add(m.name);
}
const nameMulti = [...byName.entries()].filter(([, s]) => s.size > 1);
const blockMulti = [...byBlock.entries()].filter(([, s]) => s.size > 1);
console.log(`\n--- jugadores con >1 bloque: ${nameMulti.length}/${byName.size} ---`);
for (const [n, s] of nameMulti.slice(0, 8)) console.log(`  ${n}: ${[...s].join(' ')}`);
console.log(`--- bloques con >1 jugador: ${blockMulti.length}/${byBlock.size} ---`);
for (const [h, s] of blockMulti.slice(0, 8)) console.log(`  ${h}: ${[...s].join(' ')}`);

console.log(`\n--- bloques mas usados (todos los records) ---`);
for (const [h, c] of [...blockKinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  const c1 = decodeCoordId(parseInt(h.slice(0, 2), 16) << 16 | parseInt(h.slice(2, 4), 16) << 8 | parseInt(h.slice(4, 6), 16));
  const c2 = decodeCoordId(parseInt(h.slice(6, 8), 16) << 16 | parseInt(h.slice(8, 10), 16) << 8 | parseInt(h.slice(10, 12), 16));
  console.log(`  ${h}  (${c1.x},${c1.y})+(${c2.x},${c2.y})  n=${c}`);
}
