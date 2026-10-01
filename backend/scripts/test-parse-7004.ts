/**
 * Prueba parseMaze7004 (laberinto, proto 7004).
 * Uso: npx ts-node scripts/test-parse-7004.ts
 * Muestras: captura del cliente (28/09/2026) y logs de las cuentas — ver
 * docs/protocols/7004.md.
 */
import { parseMaze7004, MAZE_BODY_LEN, type Maze7004 } from '../src/bot/models/maze.types';

type Expect = Partial<Maze7004> & { desc: string };

const CASES: Array<[string, Expect]> = [
  [
    '0001030000000018a40200b1aa1700d90f0100010402',
    { desc: 'golpe normal con tiro gratis (captura)', kind: 0, kindName: 'golpe', isHit: true, hitType: 1, gol: 3, gems: 0, stars: 173080, unk1: 1551025, itemId: 4057, qty: 1, item4x: true, freeShots: 4, mode: 2 },
  ],
  [
    '00010800000000b4a30200863b1b00f9030100000002',
    { desc: 'golpe pagado (−100, [20]=0, captura)', kind: 0, kindName: 'golpe', gol: 8, stars: 172980, unk1: 1784710, itemId: 1017, qty: 1, item4x: false, freeShots: 0, mode: 2 },
  ],
  [
    '01010100000000a60e0000b20fb800f8030100000002',
    { desc: 'kind01 ronda terminada (log)', kind: 1, kindName: 'ronda', isHit: true, gol: 1, gems: 0, stars: 3750, unk1: 12062642, itemId: 1016, freeShots: 0, mode: 2 },
  ],
  [
    '02010b00000000a03c00008941bb0004040100000002',
    { desc: 'kind02 gremblin (log, gemas 0)', kind: 2, kindName: 'gremblin', isHit: true, gol: 11, gems: 0, stars: 15520, unk1: 12272009, itemId: 1028, freeShots: 0, mode: 2 },
  ],
  [
    '02010b2c010000dc5a000006b92a00cb040100000002',
    { desc: 'kind02 gremblin (muestra usuario, gemas 300)', kind: 2, kindName: 'gremblin', gol: 11, gems: 300, stars: 23260, unk1: 2799878, itemId: 1227, freeShots: 0, mode: 2 },
  ],
  [
    '0301012c010000dc5f000096498700cb040100000002',
    { desc: 'kind03 gremblin se retira (log)', kind: 3, kindName: 'retirada', isHit: true, gol: 1, gems: 300, stars: 24540, unk1: 8866198, itemId: 1227, freeShots: 0, mode: 2 },
  ],
  [
    '0000030000000044070000856c0300ff030b00000001',
    { desc: 'golpe élite (captura: tipo 00, qty 0b, cola 01)', kind: 0, kindName: 'golpe', hitType: 0, gol: 3, stars: 1860, unk1: 224389, itemId: 1023, qty: 11, freeShots: 0, mode: 1 },
  ],
  [
    '00010d9001000040600000d5b75401cc040100000200',
    { desc: 'golpe con gremblin activo (gol 13, gemas 400)', kind: 0, kindName: 'golpe', gol: 13, gems: 400, stars: 24640, itemId: 1228, freeShots: 2, mode: 0 },
  ],
  [
    '65000009ca25f5a0000000ed379c0cf87f0000a0645a',
    { desc: 'rechazo 65 estrellas insuficientes', kind: 0x65, kindName: 'sin-estrellas', isHit: false, stars: null, raw: '65000009ca25f5a0000000ed379c0cf87f0000a0645a' },
  ],
  [
    '670000004060e2cce2000000000000000000000050fd',
    { desc: 'rechazo 67 golpe duplicado', kind: 0x67, kindName: 'duplicado', isHit: false },
  ],
  [
    'aa0102030405060708090a0b0c0d0e0f101112131415',
    { desc: 'kind desconocido', kind: 0xaa, kindName: 'desconocido', isHit: false },
  ],
];

let failed = 0;
for (const [hex, expect] of CASES) {
  const p = parseMaze7004(Buffer.from(hex, 'hex'));
  if (!p) {
    console.log(`FALLO  ${expect.desc}: devolvió null`);
    failed++;
    continue;
  }
  const errs: string[] = [];
  for (const [k, v] of Object.entries(expect)) {
    if (k === 'desc') continue;
    const got = (p as any)[k];
    if (got !== v) errs.push(`${k}: esperado ${JSON.stringify(v)} obtenido ${JSON.stringify(got)}`);
  }
  if (p.raw !== hex) errs.push(`raw distinto`);
  if (errs.length) {
    console.log(`FALLO  ${expect.desc}: ${errs.join(' | ')}`);
    failed++;
  } else {
    console.log(`ok     ${expect.desc}`);
  }
}

// body de longitudes distintas → null
for (const bad of ['', '00', '00'.repeat(MAZE_BODY_LEN - 1), '00'.repeat(MAZE_BODY_LEN + 1)]) {
  if (parseMaze7004(Buffer.from(bad, 'hex')) !== null) {
    console.log(`FALLO  longitud ${bad.length / 2}B no devolvió null`);
    failed++;
  }
}
console.log('ok     longitudes ≠ 22B → null');

if (failed) {
  console.log(`\n${failed} fallo(s)`);
  process.exit(1);
}
console.log(`\nTodos los ${CASES.length} casos + longitudes OK`);
