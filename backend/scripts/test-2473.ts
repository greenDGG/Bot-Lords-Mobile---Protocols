/**
 * Tests del parser 2473 (confirmación del 2472: envío de tropas a agrupación).
 * Uso: npx ts-node scripts/test-2473.ts
 *
 * Muestras reales extraídas de logs/*.log (15 en total; aquí las 4 formas
 * distintas + casos borde). Ver docs/protocols/2473.md.
 */
import { parse2473 } from '../src/bot/parsers/war-march.parser';

let failures = 0;
function check(label: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  ok   ${label}${detail ? ' → ' + detail : ''}`);
  else {
    failures++;
    console.log(`  FALLO ${label}${detail ? ' → ' + detail : ''}`);
  }
}

// ── Muestras reales ────────────────────────────────────────────────────────
// Rechazo: 2472 enviado con cantidades=0,0,0 (log 1527799837/20260723:283)
const REJECT = Buffer.from('03', 'hex');
// 57 B, 1 tipo de tropa — "D NODE 02", RECV 13:37:40 local (log ...:602)
const OK_57 = Buffer.from(
  '00005343626a00000000' + // flags=0x0000 · startTs=0x6a624353 · 0
  'f1000000' + // durationSec = 241
  '4143626a00000000' + // orderTs = 0x6a624341 (startTs − 18)
  '3c000000' + // windowSec = 60
  'b700' + // pairA = 183
  '3308' + // pairB = 2099
  '1e000000' + // unknown30 = 30
  '0000' + // pad
  '44204e4f4445203032' + // "D NODE 02"
  '00000000' + // fin del nombre de 13 B
  '00' + // byte @49
  '10000001000000', // cola de tropas (1 × u32)
  'hex',
);
// 61 B, 2 tipos de tropa — "remake kt" (log 699200412/20260724:3334)
const OK_61 = Buffer.from(
  '0f005fb2636a000000002900000015b2636a000000002c010000dc00c108230000000000' +
  '72656d616b65206b7400000000001001008c170200d4c00100',
  'hex',
);
// 61 B con flags=0x010f — "KUBANIT0" (log 699200412/20260725:696)
const OK_61_FLAGS = Buffer.from(
  '0f01d2f2646a000000005401000087f2646a000000002c0100001b018a08230000000000' +
  '4b5542414e495430000000000000400400db00030085d70000',
  'hex',
);

// ── Rechazo / casos borde ──────────────────────────────────────────────────
console.log('--- rechazo y casos borde');
const r = parse2473(REJECT);
check('body=03 → ok=false', r.ok === false, `code=${r.code}`);
check('body=03 → code=3', r.code === 3, String(r.code));

const empty = parse2473(Buffer.alloc(0));
check('body vacío → ok=false', empty.ok === false, `code=${empty.code}`);
check('body vacío → code=-1', empty.code === -1, String(empty.code));

const truncated = parse2473(OK_57.subarray(0, 40));
check('body truncado (40 B) → ok=false', truncated.ok === false);

const zeros = Buffer.alloc(57);
check('startTs=0 → ok=false', parse2473(zeros).ok === false);

// ── 57 B ───────────────────────────────────────────────────────────────────
console.log('--- 57 B ("D NODE 02")');
check('mide 57 B', OK_57.length === 57, `len=${OK_57.length}`);
const a = parse2473(OK_57);
check('ok', a.ok === true);
check('flags=0', a.flags === 0, String(a.flags));
check('startTs = 2026-07-23T16:37:39Z', a.startTs === Math.floor(Date.parse('2026-07-23T16:37:39Z') / 1000), `startTs=${a.startTs}`);
check('durationSec=241', a.durationSec === 241, String(a.durationSec));
check('arrivalTs = startTs + 241', a.arrivalTs === a.startTs! + 241, String(a.arrivalTs));
check('orderTs = startTs − 18', a.orderTs === a.startTs! - 18, String(a.orderTs));
check('windowSec=60', a.windowSec === 60, String(a.windowSec));
check('pairA=183', a.pairA === 183, String(a.pairA));
check('pairB=2099', a.pairB === 2099, String(a.pairB));
check('unknown30=30', a.unknown30 === 30, String(a.unknown30));
check("rallyLeader='D NODE 02'", a.rallyLeader === 'D NODE 02', a.rallyLeader);

// ── 61 B ───────────────────────────────────────────────────────────────────
console.log('--- 61 B ("remake kt")');
check('mide 61 B', OK_61.length === 61, `len=${OK_61.length}`);
const b = parse2473(OK_61);
check('ok', b.ok === true);
check('flags=15', b.flags === 15, String(b.flags));
check('durationSec=41', b.durationSec === 41, String(b.durationSec));
check('arrivalTs = startTs + 41', b.arrivalTs === b.startTs! + 41, String(b.arrivalTs));
check('windowSec=300', b.windowSec === 300, String(b.windowSec));
check('pairA=220', b.pairA === 220, String(b.pairA));
check('pairB=2241', b.pairB === 2241, String(b.pairB));
check('unknown30=35', b.unknown30 === 35, String(b.unknown30));
check("rallyLeader='remake kt'", b.rallyLeader === 'remake kt', b.rallyLeader);

console.log('--- 61 B con flags ("KUBANIT0")');
check('mide 61 B', OK_61_FLAGS.length === 61, `len=${OK_61_FLAGS.length}`);
const c = parse2473(OK_61_FLAGS);
check('ok', c.ok === true);
check('flags=271 (0x010f)', c.flags === 271, String(c.flags));
check('durationSec=340', c.durationSec === 340, String(c.durationSec));
check("rallyLeader='KUBANIT0'", c.rallyLeader === 'KUBANIT0', c.rallyLeader);

// ── Caso de uso: ¿llega a tiempo? ──────────────────────────────────────────
console.log('--- decisión llegada vs cierre (ejemplo del doc)');
// Nuestra marcha llega en startTs+241; la agrupación cierra 120 s después
// del start → sobra; cierra 60 s después → falta 181 s de aceleración.
const llegada = a.arrivalTs!;
check('cierra start+360 → a tiempo (sobra 119 s)', llegada - (a.startTs! + 360) === -119, `gap=${llegada - (a.startTs! + 360)}`);
check('cierra start+60 → tarde (falta 181 s)', llegada - (a.startTs! + 60) === 181, `gap=${llegada - (a.startTs! + 60)}`);

console.log(failures === 0 ? '\nOK' : `\n${failures} FALLOS`);
process.exit(failures === 0 ? 0 : 1);
