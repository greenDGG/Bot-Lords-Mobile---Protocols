/**
 * Prueba parseMapMarch (variante march de proto 2220).
 * Uso: npx ts-node scripts/test-map-march.ts [hex]
 * Sin args usa la muestra confirmada de 73 bytes.
 */
import { parseMapMarch, parseMapMarches, isMapMarchPacket } from '../src/bot/models/map-march.types';

const DEFAULT_HEX =
  '0e9b190000000000003e003e0017040b00' +
  '49204c6f76652041646f00000075464fcf04' +
  '3e00b0' +
  '3d00be' +
  '1c01b46a' +
  '00000000' +
  '05000000' +
  '0000000000000000070000000000000000000000';

const hex = process.argv[2] || DEFAULT_HEX;
const buf = Buffer.from(hex.replace(/\s/g, ''), 'hex');

console.log(`len=${buf.length}  mod62=${buf.length % 62}  isMapMarch=${isMapMarchPacket(buf)}`);
const m = parseMapMarch(buf);
if (!m) {
  console.log('parseMapMarch → null');
  process.exit(1);
}
console.log(JSON.stringify(m, null, 2));

// --- Marchas apiladas en un solo body (ej. real de 176B = 73 + 103) ---
const single = Buffer.from(DEFAULT_HEX.replace(/\s/g, ''), 'hex');
const second = Buffer.from(single);
second.fill(0, 17, 30); // limpia el campo de nombre de 13B
second.write('PruebaDos', 17, 'latin1');
second.writeUInt32LE(single.readUInt32LE(41) + 1, 41);

const solo = parseMapMarches(single);
const multi = parseMapMarches(Buffer.concat([single, second]));
console.log(`\nsolo=${solo.length}  multi=${multi.length} → [${multi.map(x => `${x.name}@${x.startTime}`).join(', ')}]`);

let failed = solo.length !== 1 || multi.length !== 2 ||
  multi[0]!.name !== 'I Love Ado' || multi[1]!.name !== 'PruebaDos' ||
  multi[0]!.startTime === multi[1]!.startTime;
console.log(failed ? 'FALLO' : 'OK');
process.exit(failed ? 1 : 0);
