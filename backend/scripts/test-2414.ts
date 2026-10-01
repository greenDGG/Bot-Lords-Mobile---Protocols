/**
 * Tests del parser 2414 (lista de marchas propias) contra las capturas
 * reales de docs/teories/marchs.md.
 * Uso: npx ts-node scripts/test-2414.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { parse2414 } from '../src/bot/parsers/marches.parser';

const md = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'teories', 'marchs.md'), 'utf-8');
const lines = md.split('\n');
const hexAt = (n: number): string => {
  const clean = lines[n - 1]!.split('//')[0]!.trim();
  if (!/^[0-9a-f]+$/i.test(clean)) throw new Error(`línea ${n} no es hex: "${lines[n - 1]}"`);
  if (clean.length % 2 !== 0) throw new Error(`línea ${n} impar: ${clean.length}`);
  return clean.toLowerCase();
};
const concat = (ns: number[]): string => ns.map(hexAt).join('');

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) { pass++; console.log(`PASS ${label}`); }
  else { fail++; console.log(`FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
}

// captura1: cabecera 06 01 + índice 01 anotados en texto (líneas 4-6), cuerpo en hex.
const cap1 = Buffer.from('0601' + '01' + concat([7, 8, 9, 10, 11]), 'hex');
// captura2: 3 marchas en vuelo.
const cap2 = Buffer.from(concat([15, 16, 17, 19, 20, 21, 23, 24, 25, 26, 28, 29, 30]), 'hex');
// captura3: mismas marchas, estado "llegó".
const cap3 = Buffer.from(concat([35]), 'hex');

console.log(`longitudes: cap1=${cap1.length} cap2=${cap2.length} cap3=${cap3.length}`);

// ── cap1: 1 marcha en vuelo ──
const c1 = parse2414(cap1);
check('cap1 parsea', !!c1);
if (c1) {
  check('cap1 limit=6', c1.limit === 6, `got ${c1.limit}`);
  check('cap1 count=1', c1.count === 1, `got ${c1.count}`);
  const e = c1.entries[0]!;
  check('cap1 index=1', e.index === 1, `got ${e.index}`);
  check('cap1 status=flying', e.status === 'flying', `got ${e.status}`);
  check('cap1 state=6', e.state === 6, `got ${e.state}`);
  check('cap1 nombre yman 252', e.name === 'yman 252', `got "${e.name}"`);
  check('cap1 ts plausible', e.startAt >= 1790000000 && e.startAt <= 1793000000, `got ${e.startAt}`);
  check('cap1 dur=1204', e.durationSec === 1204, `got ${e.durationSec}`);
  check('cap1 unknown106=0', e.unknown106 === 0, `got ${e.unknown106}`);
  check('cap1 sin héroes', e.heroIds.length === 0, JSON.stringify(e.heroIds));
  check('cap1 troops = 2 T3 Inf', e.troops.length === 1 && e.troops[0]!.type === 0 && e.troops[0]!.tier === 3 && e.troops[0]!.count === 2, JSON.stringify(e.troops));
  check('cap1 coord plausibles', e.destX >= 0 && e.destX < 2000 && e.destY >= 0 && e.destY < 2000, `got (${e.destX},${e.destY})`);
  check('cap1 ETA = inicio+duración', e.startAt + e.durationSec > e.startAt);
}

// ── cap2: 3 marchas en vuelo ──
const c2 = parse2414(cap2);
check('cap2 parsea', !!c2);
if (c2) {
  check('cap2 limit=6', c2.limit === 6, `got ${c2.limit}`);
  check('cap2 count=3', c2.count === 3, `got ${c2.count}`);
  check('cap2 índices 0,1,2', c2.entries.map(e => e.index).join(',') === '0,1,2', `got ${c2.entries.map(e => e.index).join(',')}`);
  check('cap2 todas flying', c2.entries.every(e => e.status === 'flying'), JSON.stringify(c2.entries.map(e => e.status)));
  const durs = c2.entries.map(e => e.durationSec).sort((a, b) => a - b);
  check('cap2 duraciones {1204,1556,1607}', durs.join(',') === '1204,1556,1607', `got ${durs.join(',')}`);
  check('cap2 nombres no vacíos', c2.entries.every(e => e.name.length >= 3), JSON.stringify(c2.entries.map(e => e.name)));
  check('cap2 ts plausible', c2.entries.every(e => e.startAt >= 1790000000 && e.startAt <= 1793000000), JSON.stringify(c2.entries.map(e => e.startAt)));
  check('cap2 coords destinto', new Set(c2.entries.map(e => e.destX + ',' + e.destY)).size === 3);
  check('cap2 troopsRaw=0 → unknown106', c2.entries.every(e => e.unknown106 === 0), JSON.stringify(c2.entries.map(e => e.unknown106)));
  check('cap2 troops = 2 T3 Inf c/u', c2.entries.every(e => e.troops.length === 1 && e.troops[0]!.type === 0 && e.troops[0]!.tier === 3 && e.troops[0]!.count === 2), JSON.stringify(c2.entries.map(e => e.troops)));
  check('cap2 sin héroes', c2.entries.every(e => e.heroIds.length === 0), JSON.stringify(c2.entries.map(e => e.heroIds)));
}

// ── cap3: mismas marchas, estado "llegó" ──
const c3 = parse2414(cap3);
check('cap3 parsea', !!c3);
if (c3) {
  check('cap3 limit=6', c3.limit === 6, `got ${c3.limit}`);
  check('cap3 count=3', c3.count === 3, `got ${c3.count}`);
  check('cap3 todas arrived', c3.entries.every(e => e.status === 'arrived'), JSON.stringify(c3.entries.map(e => e.status)));
  check('cap3 ts=0', c3.entries.every(e => e.startAt === 0), JSON.stringify(c3.entries.map(e => e.startAt)));
  check('cap3 dur=0', c3.entries.every(e => e.durationSec === 0), JSON.stringify(c3.entries.map(e => e.durationSec)));
  check('cap3 nombre Asado IDL', c3.entries.every(e => e.name === 'Asado IDL'), JSON.stringify(c3.entries.map(e => e.name)));
  check('cap3 unknown106=7689', c3.entries.every(e => e.unknown106 === 7689), JSON.stringify(c3.entries.map(e => e.unknown106)));
  check('cap3 troops = 2 T3 Inf c/u', c3.entries.every(e => e.troops.length === 1 && e.troops[0]!.type === 0 && e.troops[0]!.tier === 3 && e.troops[0]!.count === 2), JSON.stringify(c3.entries.map(e => e.troops)));
  if (c2) {
    const same = c3.entries.every((e, i) => e.destX === c2.entries[i]!.destX && e.destY === c2.entries[i]!.destY && e.index === c2.entries[i]!.index);
    check('cap3 mismas coords/índices que cap2', same);
  }
}

// ── casos borde ──
check('body vacío → null', parse2414(Buffer.alloc(0)) === null);
check('body de 1 byte → null', parse2414(Buffer.from([6])) === null);
check('count excede longitud → null', parse2414(Buffer.from([6, 3, 0, 0])) === null);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
