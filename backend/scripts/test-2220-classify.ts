/**
 * Prueba classifyMapBody (clasificación de los formatos de proto 2220).
 * Uso: npx ts-node scripts/test-2220-classify.ts
 * No lee logs: todo es sintético.
 */
import { classifyMapBody, MAP_TILE_SIZE, MAP_DELIVERY_MIN_BYTES } from '../src/bot/models/map.types';

let failed = 0;
function check(label: string, got: string, want: string) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label} → ${got}${ok ? '' : ` (esperado ${want})`}`);
}

function delivery(header: number, tiles: number): Buffer {
  const buf = Buffer.alloc(header + tiles * MAP_TILE_SIZE, 0);
  buf[0] = 0x16;
  if (header >= 15) {
    const n = (header - 5) / 10;
    for (let i = 0; i < n; i++) buf.writeUInt16LE(400 + i, 3 + i * 10);
  }
  for (let i = 0; i < tiles; i++) {
    const off = header + i * MAP_TILE_SIZE;
    const xi = (i * 3) & 0xff;
    const yi = (i * 5) & 0xff;
    buf[off] = (((yi >> 3) & 0x0f) << 4) | ((xi >> 4) & 0x0f);
    buf[off + 1] = yi >> 7;
    buf[off + 2] = ((yi & 0x07) << 5) | (xi & 0x0f);
    buf[off + 3] = 8;
    buf.write('Player' + i, off + 4, 'latin1');
    buf.write('uFO', off + 17, 'latin1');
    buf.writeUInt16LE(1231, off + 20);
  }
  return buf;
}

function march(tailBytes: number): Buffer {
  const buf = Buffer.alloc(53 + tailBytes, 0);
  buf.write('UtaiteOrigin', 17, 'latin1');
  buf.write('uFO', 30, 'latin1');
  buf.writeUInt16LE(1231, 33);
  [35, 36, 37].forEach((o, i) => (buf[o] = [0x8c, 0x00, 0xba][i]!));
  [38, 39, 40].forEach((o, i) => (buf[o] = [0x9c, 0x00, 0x00][i]!));
  buf.writeUInt32LE(1790430965, 41);
  buf.writeUInt32LE(167, 49);
  if (tailBytes >= 12) buf.writeUInt32LE(6, 61);
  return buf;
}

console.log(`umbral entrega = ${MAP_DELIVERY_MIN_BYTES} bytes`);

console.log('\n-- Entregas (tamaño grande) --');
check('45+39x51 = 2034', classifyMapBody(delivery(45, 39)), 'delivery');
check('3+39x51 = 1992', classifyMapBody(delivery(3, 39)), 'delivery');
check('25+39x51 = 2014', classifyMapBody(delivery(25, 39)), 'delivery');

console.log('\n-- Entregas que colisionaban con el formato de 62B --');
check('45+21x51 = 1116 (18x62)', classifyMapBody(delivery(45, 21)), 'delivery');
check('3+51x51 = 2604 (42x62)', classifyMapBody(delivery(3, 51)), 'delivery');
check('45+83x51 = 4278 (69x62)', classifyMapBody(delivery(45, 83)), 'delivery');
check('15+7x51 = 372 (6x62, <1000)', classifyMapBody(delivery(15, 7)), 'delivery');

console.log('\n-- Updates (múltiplos de 62) --');
check('62 (1 segmento)', classifyMapBody(Buffer.alloc(62)), 'update');
check('124 (2 segmentos)', classifyMapBody(Buffer.alloc(124)), 'update');
check('186 (3 segmentos)', classifyMapBody(Buffer.alloc(186)), 'update');
check('248 (4 segmentos)', classifyMapBody(Buffer.alloc(248)), 'update');
check('310 (5 segmentos)', classifyMapBody(Buffer.alloc(310)), 'update');
check('992 (16 segmentos)', classifyMapBody(Buffer.alloc(992)), 'update');

console.log('\n-- Marchas --');
check('march 73B (muestra real)', classifyMapBody(march(20)), 'march');
check('march 67B (cola 14)', classifyMapBody(march(14)), 'march');
check('march 77B (cola 24)', classifyMapBody(march(24)), 'march');

console.log('\n-- Cuerpos que no encajan --');
check('15B (Len=19)', classifyMapBody(Buffer.alloc(15)), 'delivery');
check('104B no múltiplo de 62', classifyMapBody(Buffer.alloc(104)), 'delivery');

process.exit(failed === 0 ? 0 : 1);
