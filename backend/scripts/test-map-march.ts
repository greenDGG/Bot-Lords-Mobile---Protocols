/**
 * Prueba parseMapMarch (variante march de proto 2220).
 * Uso: npx ts-node scripts/test-map-march.ts [hex]
 * Sin args usa la muestra confirmada de 73 bytes.
 */
import { parseMapMarch, isMapMarchPacket } from '../src/bot/models/map-march.types';

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
