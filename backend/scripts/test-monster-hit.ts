/**
 * Prueba parseMonsterHit (variante "monster hit" de proto 2220).
 * Uso: npx ts-node scripts/test-monster-hit.ts [hex]
 * Sin args usa la muestra confirmada de 104 bytes.
 */
import { parseMonsterHit, matchHpScale, toHpPercent } from '../src/bot/models/monster-hit.types';
import { parseMapMarch } from '../src/bot/models/map-march.types';

const HIT_HEX =
  '0d7e1f010000000000' + // 9B prefijo
  '2702c0' + // coord del monstruo (224,556)
  'ae46ab42' + // HP float32 LE
  '0f22ee010000000000' +
  '370210b00e00' +
  '0e23ee010000000000' +
  '3e00' +
  '370218b00e00' +
  '5574616974654f726967696e00' + // "UtaiteOrigin\0"
  '75464f' + // guild uFO
  'cf04' + // reino 1231
  '2702c0' + // ubicación A = monstruo
  '370222' + // ubicación B = usuario (228,562)
  '1cbeb76a' + // eventTime
  '00000000' +
  '0b000000' + // vuelta 11s
  '00000000' +
  '05000000' +
  '1b00000000000000' +
  'f4648d00';

const MARCH_HEX =
  '0ec90f0000000000003e009c001ec20e00' +
  '5574616974654f726967696e00' +
  '75464f' +
  'cf04' +
  '8c00ba' +
  '9c0000' +
  'f5ceb76a' +
  '00000000' +
  'a7000000' +
  '0000000000000000060000000000000000000000';

const hitBuf = Buffer.from(HIT_HEX.replace(/\s/g, ''), 'hex');
const marchBuf = Buffer.from(MARCH_HEX.replace(/\s/g, ''), 'hex');

console.log(`--- muestra hit: len=${hitBuf.length} mod62=${hitBuf.length % 62}`);
const hit = parseMonsterHit(Buffer.from(hitBuf));
if (!hit) {
  console.log('parseMonsterHit -> null (FALLO)');
  process.exit(1);
}
console.log(JSON.stringify(hit, null, 2));
console.log(`HP=${hit.hp.toFixed(2)}%  marcha parseada? ${parseMapMarch(Buffer.from(hitBuf)) !== null}`);

const march = parseMapMarch(marchBuf);
console.log(`--- marcha 73B: marcha=${march ? 'ok' : 'null'} hit=${parseMonsterHit(marchBuf) ? 'FALSO POSITIVO' : 'null (ok)'}`);
if (!march) {
  console.log('parseMapMarch de la muestra de 73B devolvió null (FALLO)');
  process.exit(1);
}

console.log(`--- escalas: matchHpScale(0.9, 85.6)=${matchHpScale(0.9, 85.6)} matchHpScale(90, 85.6)=${matchHpScale(90, 85.6)}`);
console.log(`--- toHpPercent: 0.9=${toHpPercent(0.9)} 90=${toHpPercent(90)}`);
console.log('OK');
