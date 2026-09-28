/**
 * Prueba parseTileOccupants (variante 0x03 "ocupación de tile" de proto 2220).
 * Uso: npx ts-node scripts/test-tile-occupant.ts
 * Muestras reales de logs (2026-09-27/28).
 */
import { parseTileOccupants, occupantTailOffset, OCCUPANT_RECORD_SIZE } from '../src/bot/models/map-occupant.types';
import { parseMapMarches } from '../src/bot/models/map-march.types';
import { parseMonsterHit } from '../src/bot/models/monster-hit.types';
import { handleMapData } from '../src/bot/handlers/map.handler';

let failures = 0;
function check(label: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  ok   ${label}${detail ? ' → ' + detail : ''}`);
  else {
    failures++;
    console.log(`  FALLO ${label}${detail ? ' → ' + detail : ''}`);
  }
}

// ── Muestra 1: 63 B = record 0x0f (15 B) + record 0x03 (48 B) ──────────────
// Log 1356967839/2026-09-28.log (línea 3272). Tile ocupado por "I Love Ado".
const BODY_63 = Buffer.from(
  '0fc71702000000000037026ec50100' + // 0x0f: serial + coord (252,566) [SIN DESCIFRAR]
  '0380ba000000000000250036025f' + // 0x03: serial + u16=37 + coord (223,565)
  '49204c6f76652041646f000000' + // nombre "I Love Ado"
  '75464f' + // guild "uFO"
  'cf04' + // reino 1231
  '67ba1700' + // recursos restantes 1555047
  '280f7543' + // f32 ≈ 245.06 (sin confirmar)
  '287fba6a' + // time 1790607144 (2026-09-27T16:39:04Z)
  '00000000', // tail siempre 0
  'hex',
);

console.log('--- muestra 1: 63 B (tile ocupado)');
check('longitud 63', BODY_63.length === 63, `len=${BODY_63.length}`);
const h1 = parseTileOccupants(BODY_63);
check('1 occupant', h1.length === 1, `hits=${h1.length}`);
const o1 = h1[0]?.occupant;
check('coord (223,565)', !!o1 && o1.x === 223 && o1.y === 565, o1 ? `(${o1.x},${o1.y})` : 'sin hit');
check('nombre "I Love Ado"', !!o1 && o1.name === 'I Love Ado', o1?.name);
check('guild "uFO"', !!o1 && o1.guild === 'uFO', o1?.guild);
check('reino 1231', !!o1 && o1.kingdom === 1231, String(o1?.kingdom));
check('recursos 1555047', !!o1 && o1.resourceAmount === 1555047, String(o1?.resourceAmount));
check('f32 ≈ 245.06', !!o1 && Math.abs(o1.unknownF32 - 245.06) < 0.05, o1?.unknownF32.toFixed(2));
check('time 1790607144', !!o1 && o1.time === 1790607144, String(o1?.time));
check('record en offset 15, fin 63', !!h1[0] && h1[0].offset === 15 && h1[0].end === 63, h1[0] ? `${h1[0].offset}..${h1[0].end}` : '');
check('tileId coherente', !!o1 && o1.tileId === ((0x36 << 16) | (0x02 << 8) | 0x5f), String(o1?.tileId.toString(16)));
check('resto del body vacío', occupantTailOffset(h1) === BODY_63.length, String(occupantTailOffset(h1)));
check('monster hit no se lo come', parseMonsterHit(BODY_63) === null);

// ── Muestra 2: 121 B = record 0x03 (48 B) + marcha de 73 B ────────────────
// Log 1356967839/2026-09-28.log (línea 3069). Mismo tile, ahora LIBRE.
const BODY_121 = Buffer.from(
  '0344ba000000000000250036025f' + // 0x03 + coord (223,565)
  '000000000000000000000000000000000000' + // nombre vacío + guild vacío + reino 0
  'e2001800' + // recursos restantes 1573090
  '00000000' + // f32 0
  '00000000' + // time 0 (tile libre)
  '00000000' + // tail
  '0ea3170200000000003e00370253c4010049204c6f76652041646f00000075464fcf0436025f370251b17dba6a000000000600000000000000000000001000000000000000f4648d00',
  'hex',
);

console.log('--- muestra 2: 121 B (tile libre + marcha)');
check('longitud 121', BODY_121.length === 121, `len=${BODY_121.length}`);
const h2 = parseTileOccupants(BODY_121);
check('1 occupant', h2.length === 1, `hits=${h2.length}`);
const o2 = h2[0]?.occupant;
check('coord (223,565)', !!o2 && o2.x === 223 && o2.y === 565, o2 ? `(${o2.x},${o2.y})` : 'sin hit');
check('nombre vacío (tile libre)', !!o2 && o2.name === '', JSON.stringify(o2?.name));
check('reino 0 y time 0', !!o2 && o2.kingdom === 0 && o2.time === 0, `k=${o2?.kingdom} t=${o2?.time}`);
check('recursos 1573090', !!o2 && o2.resourceAmount === 1573090, String(o2?.resourceAmount));
check('f32 0', !!o2 && o2.unknownF32 === 0, String(o2?.unknownF32));
check('record 0..48', !!h2[0] && h2[0].offset === 0 && h2[0].end === 48, h2[0] ? `${h2[0].offset}..${h2[0].end}` : '');
const rest2 = BODY_121.subarray(occupantTailOffset(h2));
check('resto 73 B = marcha', rest2.length === 73, `rest=${rest2.length}`);
const marches2 = parseMapMarches(rest2);
check('la marcha del resto se parsea', marches2.length === 1 && marches2[0]!.name === 'I Love Ado', `${marches2.length} marchas${marches2[0] ? ' ' + marches2[0].name : ''}`);
check('monster hit no se lo come', parseMonsterHit(BODY_121) === null);

// ── Negativos: variantes conocidas que NO son ocupación ────────────────────
const UPDATE_62 = Buffer.from(
  '01be4401000000000033002702620a010f00a0db10000000c842000000000000000000000000000000000000000000000000000000000000000000000000',
  'hex',
);
const HIT_104 = Buffer.from(
  '0d7e1f010000000000' + '2702c0' + 'ae46ab42' + '0f22ee010000000000' + '370210b00e00' +
  '0e23ee010000000000' + '3e00' + '370218b00e00' + '5574616974654f726967696e00' + '75464f' +
  'cf04' + '2702c0' + '370222' + '1cbeb76a' + '00000000' + '0b000000' + '00000000' + '05000000' +
  '1b00000000000000' + 'f4648d00',
  'hex',
);
const MARCH_73 = Buffer.from(
  '0ec90f0000000000003e009c001ec20e00' + '5574616974654f726967696e00' + '75464f' + 'cf04' +
  '8c00ba' + '9c0000' + 'f5ceb76a' + '00000000' + 'a7000000' +
  '0000000000000000060000000000000000000000',
  'hex',
);

console.log('--- negativos');
check('update 62 B → sin occupants', parseTileOccupants(UPDATE_62).length === 0, `len=${UPDATE_62.length} hits=${parseTileOccupants(UPDATE_62).length}`);
check('monster hit 104 B → sin occupants', parseTileOccupants(HIT_104).length === 0, `hits=${parseTileOccupants(HIT_104).length}`);
check('marcha 73 B → sin occupants', parseTileOccupants(MARCH_73).length === 0, `hits=${parseTileOccupants(MARCH_73).length}`);
check('cuerpo ≥501 B → sin occupants (puerta de longitud)', parseTileOccupants(Buffer.alloc(600, 0x03)).length === 0);
check('cuerpo corto → sin occupants', parseTileOccupants(Buffer.alloc(OCCUPANT_RECORD_SIZE - 1)).length === 0);
check('registro con reino fuera de rango → rechazado', (() => {
  const b = Buffer.from(BODY_63);
  b[45] = 0xff; b[46] = 0xff; // reino 65535
  return parseTileOccupants(b).length === 0;
})());
check('registro con tail != 0 → rechazado', (() => {
  const b = Buffer.from(BODY_63);
  b[59] = 0x01;
  return parseTileOccupants(b).length === 0;
})());
check('registro con time basura → rechazado', (() => {
  const b = Buffer.from(BODY_63);
  b[55] = 0x11; b[56] = 0x22; b[57] = 0x33; b[58] = 0x44;
  return parseTileOccupants(b).length === 0;
})());

// ── A nivel handler: sin tile fantasma y con la marcha del resto procesada ──
console.log('--- handler (handleMapData)');

function fakeBot() {
  const occupants: { name: string; x: number; y: number }[] = [];
  const logs: string[] = [];
  const b: any = {
    mapTiles: new Map(),
    mapMarches: new Map(),
    mapOccupants: new Map(),
    emit: () => {},
    bot: { log: (m: string) => logs.push(m) },
    onTileInfo: () => {},
    onMonsterHit: () => {},
    onTileOccupant: (o: any) => {
      occupants.push(o);
      if (o.name) b.mapOccupants.set(o.tileId, o);
      else b.mapOccupants.delete(o.tileId);
    },
    onHuntMarch: () => {},
    onLuckyCardMarch: () => {},
  };
  return { bot: b, occupants, logs };
}

const hb1 = fakeBot();
handleMapData(hb1.bot, BODY_63);
check('63 B → llega 1 occupant', hb1.occupants.length === 1, `occupants=${hb1.occupants.length}`);
check('63 B → NO crea tile fantasma', hb1.bot.mapTiles.size === 0, `mapTiles=${hb1.bot.mapTiles.size}`);

const hb2 = fakeBot();
// La marcha del resto trae startTime viejo: se refresca para que el handler no la descarte
const body121 = Buffer.from(BODY_121);
body121.writeUInt32LE(Math.floor(Date.now() / 1000) - 2, 48 + 41);
handleMapData(hb2.bot, body121);
check('121 B → llega 1 occupant (sin nombre)', hb2.occupants.length === 1 && hb2.occupants[0]!.name === '', `occupants=${hb2.occupants.length}`);
check('121 B → la marcha del resto SÍ se procesa', hb2.bot.mapMarches.size === 1, `marches=${hb2.bot.mapMarches.size}`);
check('121 B → NO crea tile fantasma', hb2.bot.mapTiles.size === 0, `mapTiles=${hb2.bot.mapTiles.size}`);

const hb3 = fakeBot();
handleMapData(hb3.bot, UPDATE_62);
check('update 62 B no lo toca la variante 0x03', hb3.occupants.length === 0, `occupants=${hb3.occupants.length}`);
check('update 62 B sigue agregando su tile (type 0x0a)', hb3.bot.mapTiles.size === 1, `tiles=${hb3.bot.mapTiles.size}`);

console.log(failures === 0 ? '\nOK' : `\n${failures} FALLOS`);
process.exit(failures === 0 ? 0 : 1);