/**
 * Recorre todos los records de proto 2220 de un log (incluye bodies apilados)
 * y correlaciona los records 0x12 (31 B) con las marchas.
 * Uso: npx ts-node scripts/analyze-accel.ts [rutaLog] [n]
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
const maxRows = Number(process.argv[3] || 40);
console.log(`log: ${logPath}`);

const lines = fs.readFileSync(logPath, 'utf-8').split(/\r?\n/);
const fileDate = path.basename(logPath).replace(/\.log$/, '');
const UTC_OFFSET = 9 * 3600 * 1000; // el reloj del log (local) = UTC + 9h

interface Rec { dayIdx: number; wall: string; kind: number; serial: number; buf: Buffer; off: number; len: number }
interface March { dayIdx: number; wall: string; name: string; start: number; dur: number; origin: string; dest: string; arrival: number; block: string }

const recs: Rec[] = [];
const marches: March[] = [];
const owners = new Map<string, string>();
const kinds = new Map<string, number>();

function coord(buf: Buffer, off: number): string {
  const c = decodeCoordId((buf[off]! << 16) | (buf[off + 1]! << 8) | buf[off + 2]!);
  return `(${c.x},${c.y})`;
}

/** HH:MM:SS del log -> unix ms (UTC), con el dia derivado de la crono del archivo */
const dayMs = (dayIdx: number) => Date.parse(`${fileDate}T00:00:00Z`) + dayIdx * 86400000 - UTC_OFFSET;
const wallMs = (dayIdx: number, wall: string) => Date.parse(`${fileDate}T${wall}Z`) - UTC_OFFSET + dayIdx * 86400000;
const hhmmss = (ms: number) => new Date(ms + UTC_OFFSET).toISOString().slice(11, 19);
const utcOf = (u: number) => new Date(u * 1000).toISOString().slice(0, 19);
const loc = (u: number) => hhmmss(u * 1000);

let prevWall = '';
let dayIdx = 0;
for (const line of lines) {
  if (line.length >= 10 && line[0] === '[') {
    const w = line.slice(1, 9);
    if (/^\d\d:\d\d:\d\d$/.test(w)) {
      if (prevWall && w < prevWall) dayIdx++;
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
  const di = dayIdx;

  let off = 0;
  while (off + 11 <= buf.length) {
    const kind = buf[off]!;
    let len: number;
    if (kind === 0x0f) len = 15;
    else if (kind === 0x12) len = 31;
    else {
      const size = buf.readUInt16LE(off + 9);
      len = 11 + size;
    }
    if (len < 11 || off + len > buf.length) break;
    const serial = buf.readUInt32LE(off + 1);
    recs.push({ dayIdx: di, wall, kind, serial, buf, off, len });
    kinds.set(`${len}/${kind.toString(16)}`, (kinds.get(`${len}/${kind.toString(16)}`) ?? 0) + 1);
    if (kind === 0x03 && len === 48) {
      const name = buf.toString('utf8', off + 14, off + 27).replace(/\0.*$/, '').trim();
      owners.set(coord(buf, off + 11), name);
    }
    if (len === 62) {
      const tile = buf.subarray(off + 11, off + 62);
      const type = tile[3]!;
      if (type === 8) {
        const name = tile.toString('utf8', 4, 17).replace(/\0.*$/, '').trim();
        const c = decodeCoordId((tile[0]! << 16) | (tile[1]! << 8) | tile[2]!);
        owners.set(`(${c.x},${c.y})`, name);
      }
    }
    if (kind === 0x0e && len === 73) {
      const name = buf.toString('utf8', off + 17, off + 30).replace(/\0.*$/, '');
      const start = buf.readUInt32LE(off + 41);
      const dur = buf.readUInt32LE(off + 49);
      marches.push({
        dayIdx: di, wall, name, start, dur, arrival: start + dur,
        origin: coord(buf, off + 35), dest: coord(buf, off + 38),
        block: buf.toString('hex', off + 11, off + 17),
      });
    }
    off += len;
  }
}

console.log('\n--- records (len/kind) ---');
for (const [k, c] of [...kinds.entries()].sort((x, y) => y[1] - x[1])) console.log(`  ${k}  n=${c}`);

const a12 = recs.filter(r => r.kind === 0x12);
console.log(`\n--- 0x12: ${a12.length} registros ---`);

// hipotesis: H_A: T=partida, f2=transcurrido, f1=restante (dur = f1+f2)
//           H_B: f2=restantes antes de la acel, f1=restantes despues (llegada = ahora+f2)
let deltaMatch = 0;
let hA = 0;
let hB = 0;
const rows: string[] = [];
for (const r of a12) {
  const t = r.buf.readUInt32LE(r.off + 15);
  const f1 = r.buf.readUInt32LE(r.off + 23);
  const f2 = r.buf.readUInt32LE(r.off + 27);
  const now = wallMs(r.dayIdx, r.wall);
  const delta = Math.round((now - t * 1000) / 1000);
  if (Math.abs(delta - f2) <= 2) deltaMatch++;
  const aCand = marches.filter(m => Math.abs(m.start - t) <= 6 && Math.abs(m.dur - (f1 + f2)) <= 4);
  const bCand = marches.filter(m => Math.abs(m.arrival * 1000 - (now + f2 * 1000)) <= 6000);
  if (aCand.length) hA++;
  if (bCand.length) hB++;
  const desc = (m: March) => `${m.name.slice(0, 12)} ${m.origin}>${m.dest} start=${loc(m.start)} dur=${m.dur} arr=${loc(m.arrival)}`;
  rows.push(
    `${r.wall} now=${hhmmss(now)} T=${utcOf(t)}(${loc(t)}) f1=${f1} f2=${f2} sum=${f1 + f2} delta(now-T)=${delta}` +
    `\n     A: ${aCand.map(desc).join(' | ') || '-'}` +
    `\n     B: ${bCand.map(desc).join(' | ') || '-'}`,
  );
}
console.log(`\n--- tests sobre ${a12.length} registros ---`);
console.log(`  |now - T| == f2 (±2s): ${deltaMatch}`);
console.log(`  H_A (marcha con start≈T y dur≈f1+f2): ${hA}`);
console.log(`  H_B (marcha con arrival≈now+f2): ${hB}`);

// match por bloque (los 6 bytes [11..16] son clave foranea hacia la marcha)
interface BlkRow { wall: string; t: number; f1: number; f2: number; now: number; name: string; start: number; dur: number; arrival: number; origin: string; dest: string }
const blkRows: BlkRow[] = [];
let blkMatch = 0;
for (const r of a12) {
  const blk = r.buf.toString('hex', r.off + 9, r.off + 15);
  const t = r.buf.readUInt32LE(r.off + 15);
  const f1 = r.buf.readUInt32LE(r.off + 23);
  const f2 = r.buf.readUInt32LE(r.off + 27);
  const now = wallMs(r.dayIdx, r.wall);
  const cands = marches.filter(m => m.block === blk);
  if (cands.length) blkMatch++;
  for (const m of cands) {
    blkRows.push({ wall: r.wall, t, f1, f2, now, name: m.name, start: m.start, dur: m.dur, arrival: m.arrival, origin: m.origin, dest: m.dest });
  }
}
const cnt = (pred: (x: BlkRow) => boolean) => blkRows.filter(pred).length;
const nowS = (x: BlkRow) => Math.floor(x.now / 1000);
console.log(`\n--- 0x12 con marcha del MISMO bloque: ${blkMatch}/${a12.length} registros, ${blkRows.length} pares ---`);
if (blkRows.length) {
  console.log(`  |T - start| <= 6      : ${cnt(x => Math.abs(x.start - x.t) <= 6)}  (T==start: ${cnt(x => x.start === x.t)})`);
  console.log(`  |(f1+f2) - dur| <= 4  : ${cnt(x => Math.abs(x.f1 + x.f2 - x.dur) <= 4)}  (==: ${cnt(x => x.f1 + x.f2 === x.dur)})`);
  console.log(`  arr == now+f1 (±6)    : ${cnt(x => Math.abs(x.arrival - (nowS(x) + x.f1)) <= 6)}`);
  console.log(`  arr == now+f2 (±6)    : ${cnt(x => Math.abs(x.arrival - (nowS(x) + x.f2)) <= 6)}`);
  console.log(`  start <= now <= arr   : ${cnt(x => x.start <= nowS(x) && nowS(x) <= x.arrival)}`);
  console.log(`  f1 < f2               : ${cnt(x => x.f1 < x.f2)}`);
  console.log(`  T >= start            : ${cnt(x => x.t >= x.start)}   T < start: ${cnt(x => x.t < x.start)}`);
  console.log('\n  primeros 12 pares (mismos deltas):');
  for (const x of blkRows.slice(0, 12)) {
    console.log(
      `   ${x.wall} ${x.name.slice(0, 12)} ${x.origin}>${x.dest} | arr=${utcOf(x.arrival)} | ` +
      `T-start=${x.t - x.start} sum-dur=${x.f1 + x.f2 - x.dur} arr-(now+f1)=${x.arrival - (nowS(x) + x.f1)} ` +
      `arr-(now+f2)=${x.arrival - (nowS(x) + x.f2)}`,
    );
  }

  // tabla detallada de la sesion 2 (wall < 06:00): elapsed/remaining vs f1/f2
  console.log('\n  tabla (wall|name|elapsed|remaining|dur|f1|f2|sum|f1+f2-elap|f1+f2-rem):');
  for (const x of blkRows.filter(r => r.wall < '06:00').slice(0, 30)) {
    const n = nowS(x);
    const elap = n - x.start;
    const rem = x.arrival - n;
    console.log(
      `   ${x.wall} ${x.name.slice(0, 12)} elap=${elap} rem=${rem} dur=${x.dur} ` +
      `f1=${x.f1} f2=${x.f2} sum=${x.f1 + x.f2} sum-elap=${x.f1 + x.f2 - elap} sum-rem=${x.f1 + x.f2 - rem}`,
    );
  }

  // bloques con >1 record de marcha (¿re-envio tras la acel?)
  const byBlk = new Map<string, March[]>();
  for (const m of marches) {
    if (!byBlk.has(m.block)) byBlk.set(m.block, []);
    byBlk.get(m.block)!.push(m);
  }
  const multi = [...byBlk.entries()].filter(([, v]) => v.length > 1);
  console.log(`\n  bloques de marcha con >1 record: ${multi.length}/${byBlk.size}`);
}

const parsed = a12.map(r => ({
  t: r.buf.readUInt32LE(r.off + 15),
  f1: r.buf.readUInt32LE(r.off + 23),
  f2: r.buf.readUInt32LE(r.off + 27),
  now: wallMs(r.dayIdx, r.wall),
}));
const lt = parsed.filter(p => p.f1 < p.f2).length;
const cuts = parsed.map(p => p.f2 - p.f1).sort((a, b) => a - b);
const hist = (vals: number[]) => {
  const m = new Map<number, number>();
  for (const v of vals) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, c]) => `${k}:${c}`).join(' ');
};
console.log(`\n  f1 < f2: ${lt}/${parsed.length}`);
console.log(`  f1 (min/med/max): ${Math.min(...parsed.map(p => p.f1))} / ${parsed.map(p => p.f1).sort((a, b) => a - b)[Math.floor(parsed.length / 2)]} / ${Math.max(...parsed.map(p => p.f1))}`);
console.log(`  f2 (min/med/max): ${Math.min(...parsed.map(p => p.f2))} / ${parsed.map(p => p.f2).sort((a, b) => a - b)[Math.floor(parsed.length / 2)]} / ${Math.max(...parsed.map(p => p.f2))}`);
console.log(`  corte (f2-f1) top: ${cuts.slice(0, 10).join(',')} ... ${cuts.slice(-10).join(',')}`);
console.log(`  corte hist: ${hist(cuts)}`);
console.log(`  f1 hist: ${hist(parsed.map(p => p.f1))}`);

// baseline: cuantas marchas "matchean" arrival~now+f2 con un f2 alterado (+37s)
let base = 0;
for (const p of parsed) {
  const shifted = p.now + (p.f2 + 37) * 1000;
  if (marches.some(m => Math.abs(m.arrival * 1000 - shifted) <= 6000)) base++;
}
console.log(`  H_B baseline (f2+37s): ${base}/${parsed.length}`);

// H_A sin restriccion de dur, con y sin baseline
const hAstart = a12.filter(r => {
  const t = r.buf.readUInt32LE(r.off + 15);
  return marches.some(m => Math.abs(m.start - t) <= 6);
}).length;
const hAstartBase = a12.filter(r => {
  const t = r.buf.readUInt32LE(r.off + 15) + 37;
  return marches.some(m => Math.abs(m.start - t) <= 6);
}).length;
console.log(`  H_A start≈T (sin dur): ${hAstart}  baseline(T+37s): ${hAstartBase}`);

// H_A: llegada = T+f1+f2 (equiv. now+f1)
const hAarr = parsed.filter(p => marches.some(m => Math.abs(m.arrival * 1000 - (p.now + p.f1 * 1000)) <= 6000)).length;
const hAarrBase = parsed.filter(p => marches.some(m => Math.abs(m.arrival * 1000 - (p.now + (p.f1 + 37) * 1000)) <= 6000)).length;
console.log(`  llegada≈now+f1: ${hAarr}  baseline(f1+37s): ${hAarrBase}`);

// H_A completo (start y dur) con baseline
const hAfull = a12.filter(r => {
  const t = r.buf.readUInt32LE(r.off + 15);
  const s = r.buf.readUInt32LE(r.off + 23) + r.buf.readUInt32LE(r.off + 27);
  return marches.some(m => Math.abs(m.start - t) <= 6 && Math.abs(m.dur - s) <= 4);
}).length;
const hAfullBase = a12.filter(r => {
  const t = r.buf.readUInt32LE(r.off + 15) + 37;
  const s = r.buf.readUInt32LE(r.off + 23) + r.buf.readUInt32LE(r.off + 27);
  return marches.some(m => Math.abs(m.start - t) <= 6 && Math.abs(m.dur - s) <= 4);
}).length;
console.log(`  H_A full (start≈T y dur≈sum): ${hAfull}  baseline(T+37s): ${hAfullBase}`);
console.log('  --- matches H_A full ---');
for (const r of a12) {
  const t = r.buf.readUInt32LE(r.off + 15);
  const f1 = r.buf.readUInt32LE(r.off + 23);
  const f2 = r.buf.readUInt32LE(r.off + 27);
  const s = f1 + f2;
  for (const m of marches) {
    if (Math.abs(m.start - t) <= 6 && Math.abs(m.dur - s) <= 4) {
      console.log(
        `  ${r.wall} T=${utcOf(t)} f1=${f1} f2=${f2} sum=${s} |T-start|=${m.start - t} |dur-sum|=${m.dur - s} ` +
        `=> ${m.name} ${m.origin}->${m.dest} start=${utcOf(m.start)} dur=${m.dur} arr=${utcOf(m.arrival)} (now+f1=${utcOf(Math.floor(wallMs(r.dayIdx, r.wall) / 1000) + f1)})`,
      );
    }
  }
}

// distribucion de |T - start| solo entre marchas cuyo dur ~ f1+f2
const histD = (shift: number) => {
  const d: number[] = [];
  for (const r of a12) {
    const t = r.buf.readUInt32LE(r.off + 15) + shift;
    const s = r.buf.readUInt32LE(r.off + 23) + r.buf.readUInt32LE(r.off + 27);
    let best = Infinity;
    for (const m of marches) {
      if (Math.abs(m.dur - s) > 4) continue;
      const dd = Math.abs(m.start - t);
      if (dd < best) best = dd;
    }
    if (Number.isFinite(best)) d.push(best);
  }
  const b = [0, 0, 0, 0, 0, 0];
  for (const x of d) b[x <= 3 ? 0 : x <= 6 ? 1 : x <= 12 ? 2 : x <= 25 ? 3 : x <= 60 ? 4 : 5]++;
  return `con dur~sum: ${d.length}/${a12.length}  |dt|<=3:${b[0]} <=6:${b[1]} <=12:${b[2]} <=25:${b[3]} <=60:${b[4]} >60:${b[5]}`;
};
console.log(`\n  dt(T-start) real    : ${histD(0)}`);
console.log(`  dt(T+37-start) base : ${histD(37)}`);

// pares (coord9,coord12): cuantos repetidos
const pairs = new Map<string, number>();
for (const r of a12) {
  const k = `${coord(r.buf, r.off + 9)}|${coord(r.buf, r.off + 12)}`;
  pairs.set(k, (pairs.get(k) ?? 0) + 1);
}
const rep = [...pairs.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]);
console.log(`\n--- pares (c9,c12): ${pairs.size} distintos en ${a12.length} registros; repetidos: ${rep.length} ---`);
for (const [k, c] of rep.slice(0, 10)) console.log(`  ${k}  n=${c}`);

// marchas con start cerca de 18:45:44 (acel1)
console.log(`\n--- marchas con start en 18:45:30..18:46:10 ---`);
for (const m of marches) {
  const u = m.start;
  if (u >= 1790621130 && u <= 1790621170) {
    console.log(`  ${m.wall} ${m.name} ${m.origin}->${m.dest} start=${utcOf(u)} dur=${m.dur} arr=${utcOf(m.arrival)}`);
  }
}

// estructura de coord9 / coord12
const c12vals = new Map<string, number>();
const c9vals = new Map<string, number>();
let c12zero = 0;
let c9zero = 0;
for (const r of a12) {
  const c9 = coord(r.buf, r.off + 9);
  const c12 = coord(r.buf, r.off + 12);
  c9vals.set(c9, (c9vals.get(c9) ?? 0) + 1);
  c12vals.set(c12, (c12vals.get(c12) ?? 0) + 1);
  if (r.buf[r.off + 11] === 0) c9zero++;
  if (r.buf[r.off + 14] === 0) c12zero++;
}
console.log(`\n--- coord9 b2==0: ${c9zero}/${a12.length}; coord12 b2==0: ${c12zero}/${a12.length} ---`);
console.log(`--- coord9 distintos: ${c9vals.size}; coord12 distintos: ${c12vals.size} ---`);
console.log('--- coord12 mas frecuentes ---');
for (const [k, c] of [...c12vals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${k}  n=${c}`);
console.log('--- coord9 mas frecuentes ---');
for (const [k, c] of [...c9vals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${k}  n=${c}`);

// ¿coord9 = posicion actual de la marcha acelerada?
const parseXY = (s: string) => {
  const m = /\((\d+),(\d+)\)/.exec(s)!;
  return { x: Number(m[1]), y: Number(m[2]) };
};
let hitOrigin = 0, hitDest = 0, hitPos = 0, anyInFlight = 0;
let baseOrigin = 0, baseDest = 0, basePos = 0;
const c9list = a12.map(r => parseXY(coord(r.buf, r.off + 9)));
a12.forEach((r, i) => {
  const t = r.buf.readUInt32LE(r.off + 15);
  const f1 = r.buf.readUInt32LE(r.off + 23);
  const f2 = r.buf.readUInt32LE(r.off + 27);
  const nowS = Math.floor(wallMs(r.dayIdx, r.wall) / 1000);
  const c9 = c9list[i]!;
  const base = c9list[(i + 37) % c9list.length]!;
  let inflight = false;
  for (const m of marches) {
    if (m.start > nowS || m.arrival < nowS) continue;
    inflight = true;
    const o = parseXY(m.origin), d = parseXY(m.dest);
    const frac = (nowS - m.start) / m.dur;
    const ex = o.x + (d.x - o.x) * frac;
    const ey = o.y + (d.y - o.y) * frac;
    const dist = (p: { x: number; y: number }) => Math.abs(p.x - ex) + Math.abs(p.y - ey);
    if (Math.abs(c9.x - o.x) + Math.abs(c9.y - o.y) <= 1) hitOrigin++;
    if (Math.abs(c9.x - d.x) + Math.abs(c9.y - d.y) <= 1) hitDest++;
    if (dist(c9) <= 3) hitPos++;
    if (Math.abs(base.x - o.x) + Math.abs(base.y - o.y) <= 1) baseOrigin++;
    if (Math.abs(base.x - d.x) + Math.abs(base.y - d.y) <= 1) baseDest++;
    if (dist(base) <= 3) basePos++;
  }
  if (inflight) anyInFlight++;
});
console.log(`\n--- c9 vs marchas en vuelo (registros con alguna en vuelo: ${anyInFlight}/${a12.length}) ---`);
console.log(`  c9==origin: ${hitOrigin}   baseline: ${baseOrigin}`);
console.log(`  c9==dest  : ${hitDest}   baseline: ${baseDest}`);
console.log(`  c9≈pos(frac): ${hitPos}   baseline: ${basePos}`);

// ¿coord9/coord12 caen sobre un castillo con dueño conocido?
console.log(`\n--- dueños conocidos: ${owners.size} (castillos+ocupantes) ---`);
const ownerHit9 = new Map<string, number>();
const ownerHit12 = new Map<string, number>();
for (const r of a12) {
  const k9 = coord(r.buf, r.off + 9);
  const k12 = coord(r.buf, r.off + 12);
  const n9 = owners.get(k9);
  const n12 = owners.get(k12);
  if (n9) ownerHit9.set(`${k9}=${n9}`, (ownerHit9.get(`${k9}=${n9}`) ?? 0) + 1);
  if (n12) ownerHit12.set(`${k12}=${n12}`, (ownerHit12.get(`${k12}=${n12}`) ?? 0) + 1);
}
console.log(`  coord9 sobre castillo: ${[...ownerHit9.values()].reduce((a, b) => a + b, 0)}/${a12.length}`);
for (const [k, c] of [...ownerHit9.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`    ${k}  n=${c}`);
console.log(`  coord12 sobre castillo: ${[...ownerHit12.values()].reduce((a, b) => a + b, 0)}/${a12.length}`);
for (const [k, c] of [...ownerHit12.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`    ${k}  n=${c}`);

// ¿c9 y c12 juntos definen una marcha visible? (origin/dest cualquiera de los dos)
console.log('\n--- 0x12 con coord9 en origin/dest de alguna marcha ---');
for (const r of a12) {
  const c9 = coord(r.buf, r.off + 9);
  const t = r.buf.readUInt32LE(r.off + 15);
  const f1 = r.buf.readUInt32LE(r.off + 23);
  const f2 = r.buf.readUInt32LE(r.off + 27);
  const hits = marches.filter(m => m.origin === c9 || m.dest === c9);
  if (!hits.length) continue;
  console.log(`${r.wall} T=${utcOf(t)} f1=${f1} f2=${f2} sum=${f1 + f2} c9=${c9} c12=${coord(r.buf, r.off + 12)}`);
  for (const m of hits.slice(0, 6)) {
    console.log(`    ${m.wall} ${m.name.slice(0, 14)} ${m.origin}->${m.dest} start=${utcOf(m.start)} dur=${m.dur} |T-start|=${Math.abs(m.start - t)} |dur-sum|=${Math.abs(m.dur - (f1 + f2))}`);
  }
}

// byte1 de coord9/coord12: si son tiles, debe ser chico (y<~1000 -> byte1<=7)
const b9 = a12.map(r => r.buf[r.off + 10]!).sort((a, b) => a - b);
const b12 = a12.map(r => r.buf[r.off + 13]!).sort((a, b) => a - b);
console.log(`\n--- byte1 de coord9 (min/med/max): ${b9[0]}/${b9[Math.floor(b9.length / 2)]}/${b9[b9.length - 1]} ---`);
console.log(`--- byte1 de coord12 (min/med/max): ${b12[0]}/${b12[Math.floor(b12.length / 2)]}/${b12[b12.length - 1]} ---`);

// ¿qué son coord9 / coord12?
let c9fine = 0;
let c9march = 0;
let c12march = 0;
let c9owner = 0;
const sample: string[] = [];
for (const r of a12) {
  const c9 = coord(r.buf, r.off + 9);
  const c12 = coord(r.buf, r.off + 12);
  const b9 = r.buf.subarray(r.off + 11, r.off + 12)[0]!;
  if (b9 !== 0) c9fine++;
  if (marches.some(m => m.origin === c9 || m.dest === c9)) c9march++;
  if (marches.some(m => m.origin === c12 || m.dest === c12)) c12march++;
  if (owners.has(c9)) c9owner++;
  if (sample.length < 12) sample.push(`${r.wall} c9=${c9}${owners.has(c9) ? `(${owners.get(c9)})` : ''} c12=${c12}${owners.has(c12) ? `(${owners.get(c12)})` : ''}`);
}
console.log(`\n--- coord9/coord12 en ${a12.length} 0x12 ---`);
console.log(`  coord9 con b2!=0 (tile fino): ${c9fine}`);
console.log(`  coord9 == origin/dest de alguna marcha visible: ${c9march}`);
console.log(`  coord12 == origin/dest de alguna marcha visible: ${c12march}`);
console.log(`  coord9 con dueno conocido (tile 0x03): ${c9owner}`);
console.log('  ejemplos:');

console.log('\n--- primeras filas ---');
for (const s of rows.slice(0, maxRows)) console.log(s);

console.log(`\n--- marchas: ${marches.length} (primeras 15) ---`);
for (const m of marches.slice(0, 15)) {
  console.log(`  ${m.wall} ${m.name.slice(0, 16).padEnd(16)} ${m.origin}->${m.dest} start=${loc(m.start)} dur=${m.dur} arr=${loc(m.arrival)}`);
}
