/**
 * Prueba parseMapAccels (variante 0x12 "aceleramiento" de proto 2220) y el
 * cruce por bloque contra la marcha.
 * Uso: npx ts-node scripts/test-accel.ts
 * Muestras reales: log 1297816148/2026-09-28.log líneas 9362/9366/9368/9376
 * (experimento del usuario: aceleró la marcha de vuelta de "Gaseosa IDL").
 */
import { parseMapAccels, applyAccel, ACCEL_RECORD_SIZE, MapAccel } from '../src/bot/models/map-accel.types';
import { parseMapMarches, MapMarch } from '../src/bot/models/map-march.types';
import { parseTileOccupants } from '../src/bot/models/map-occupant.types';
import { classifyMapBody } from '../src/bot/models/map.types';
import { handleMapData } from '../src/bot/handlers/map.handler';

let failures = 0;
function check(label: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  ok   ${label}${detail ? ' → ' + detail : ''}`);
  else {
    failures++;
    console.log(`  FALLO ${label}${detail ? ' → ' + detail : ''}`);
  }
}

// ── Muestras reales ────────────────────────────────────────────────────────
// Línea 9362: marcha creada (03:46:03 local) — Gaseosa IDL vuelve a casa
const MARCH_73 = Buffer.from(
  '0e5cc00000000000003e00' + // kind 0x0e · serial 0xc05c · ceros · u16=62
  '360200110200' + // bloque 6B (coordA (192,560) + contador 529)
  '476173656f73612049444c0000' + // "Gaseosa IDL\0\0"
  '75464f' + // guild "uFO"
  'cf04' + // reino 1231
  '370232' + // origin
  '3602be' + // destination
  'ebb5ba6a' + // startTime 1790621163
  '00000000' + // (convención de timestamp)
  '2d000000' + // duration 45
  '0000000000000000070000000100000000000000', // cola 20B
  'hex',
);
// Línea 9366: 1ª aceleración (03:46:09 local) — f1=5 → juego mostró 03:46:14
const ACCEL1 = Buffer.from('125dc0000000000000360200110200d8b5ba6a000000000500000019000000', 'hex');
// Línea 9368: 2ª aceleración (03:46:12 local) — f1=11 → 03:46:23
const ACCEL2 = Buffer.from('125fc0000000000000360200110200d0b5ba6a000000000b00000024000000', 'hex');
// Línea 9376: record 0x0f de 15 B con el MISMO bloque + ocupación 0x03 (63 B)
const F0F_15 = Buffer.from('0f61c0000000000000360200110200', 'hex');
const OCC_48 = Buffer.from(
  '0362c000000000000025003602be476173656f73612049444c000075464fcf041e650e005d6dbd42fdb5ba6a00000000',
  'hex',
);
const BODY_63 = Buffer.concat([F0F_15, OCC_48]);
const UPDATE_62 = Buffer.from(
  '01be4401000000000033002702620a010f00a0db10000000c842000000000000000000000000000000000000000000000000000000000000000000000000',
  'hex',
);

console.log('--- parser 0x12 (muestras del experimento)');
check('ACCEL1 mide 31 B', ACCEL1.length === ACCEL_RECORD_SIZE, `len=${ACCEL1.length}`);
const h1 = parseMapAccels(ACCEL1);
check('ACCEL1 → 1 hit', h1.length === 1, `hits=${h1.length}`);
const a1 = h1[0]?.accel;
check('ACCEL1 bloque 360200110200', a1?.block === '360200110200', a1?.block);
check('ACCEL1 serial 0xc05d', a1?.serial === 0xc05d, `0x${a1?.serial.toString(16)}`);
check('ACCEL1 f1=5', a1?.f1 === 5, String(a1?.f1));
check('ACCEL1 f2=25', a1?.f2 === 25, String(a1?.f2));
check('ACCEL1 record en 0..31', h1[0]?.offset === 0 && h1[0]?.end === 31, `${h1[0]?.offset}..${h1[0]?.end}`);

const h2 = parseMapAccels(ACCEL2);
const a2 = h2[0]?.accel;
check('ACCEL2 → f1=11 f2=36 serial 0xc05f', a2?.f1 === 11 && a2?.f2 === 36 && a2?.serial === 0xc05f, `f1=${a2?.f1} f2=${a2?.f2} s=0x${a2?.serial.toString(16)}`);
check('ACCEL2 mismo bloque que ACCEL1', a2?.block === a1?.block, a2?.block);

console.log('--- la marcha y su bloque (cruce FK)');
const marches = parseMapMarches(MARCH_73);
check('marcha 73 B → 1 marcha', marches.length === 1, `n=${marches.length}`);
const march = marches[0];
check('nombre "Gaseosa IDL"', march?.name === 'Gaseosa IDL', march?.name);
check('duration 45', march?.duration === 45, String(march?.duration));
check('block de la marcha == bloque del 0x12', march?.block === a1?.block, `${march?.block}`);

// Identidades del experimento (todo en espacio de bytes, sin reloj):
//   T1 = startTime − 19 · RECV1 = T1 + f2 = startTime + 6  (03:46:09 − 03:46:03)
//   llegada tras acel1 = RECV1 + f1 = startTime + 11        (03:46:14)
check('T1 = startTime − 19', !!a1 && a1.t === march!.startTime - 19, `Δ=${a1 ? march!.startTime - a1.t : '?'}`);
check('RECV1 = T1 + f2 = startTime + 6', !!a1 && a1.t + a1.f2 === march!.startTime + 6, String(a1 ? a1.t + a1.f2 - march!.startTime : '?'));
check('llegada acel1 = startTime + 11 (RECV1 + f1)', !!a1 && a1.t + a1.f2 + a1.f1 === march!.startTime + 11, String(a1 ? a1.t + a1.f2 + a1.f1 - march!.startTime : '?'));
check('llegada acel2 = startTime + 20 (RECV2 + f1)', !!a2 && a2.t + a2.f2 + a2.f1 === march!.startTime + 20, String(a2 ? a2.t + a2.f2 + a2.f1 - march!.startTime : '?'));

console.log('--- applyAccel (eta = ahora + f1, sólo si adelanta)');
const fresh = { ...march!, startTime: march!.startTime } as MapMarch;
const recv1 = a1!.t + a1!.f2; // = RECV de la acel1 en unix
const r1 = applyAccel(fresh, a1!, recv1);
check('acel1 aplicada', r1.outcome === 'applied', r1.outcome);
check('eta = startTime + 11', fresh.eta === fresh.startTime + 11, String(fresh.eta ? fresh.eta - fresh.startTime : '?'));
check('acceleratedAt = RECV1', fresh.acceleratedAt === recv1, String(fresh.acceleratedAt));
// 2º record de la ráfaga: f1=11 → llegada startTime+20 > la ya conocida (+11)
const recv2 = a2!.t + a2!.f2;
const r2 = applyAccel(fresh, a2!, recv2);
check('acel2 sin efecto (no retrasa)', r2.outcome === 'no-gain', r2.outcome);
check('eta sigue en startTime + 11', fresh.eta === fresh.startTime + 11, String(fresh.eta ? fresh.eta - fresh.startTime : '?'));
check('acel sobre marcha inexistente → no-march', applyAccel(undefined, a1!, recv1).outcome === 'no-march');
check('acel cuando ya llegó → stale', applyAccel(fresh, a1!, fresh.startTime + fresh.duration).outcome === 'stale');
const bigF1: MapAccel = { ...a1!, f1: 999999 };
check('f1 enorme no retrasa → no-gain', applyAccel({ ...fresh, eta: undefined }, bigF1, recv1).outcome === 'no-gain');

console.log('--- negativos (no hay que comerse variantes conocidas)');
check('marcha 73 B → sin acels', parseMapAccels(MARCH_73).length === 0, `hits=${parseMapAccels(MARCH_73).length}`);
check('ocupación 63 B → sin acels', parseMapAccels(BODY_63).length === 0, `hits=${parseMapAccels(BODY_63).length}`);
check('update 62 B → sin acels', parseMapAccels(UPDATE_62).length === 0, `hits=${parseMapAccels(UPDATE_62).length}`);
check('cuerpo 600 B → sin acels (puerta de longitud)', parseMapAccels(Buffer.alloc(600, 0x12)).length === 0);
check('31 B de 0x12 basura (T=0) → rechazado', parseMapAccels(Buffer.alloc(ACCEL_RECORD_SIZE, 0x12)).length === 0);
check('serial+4B ceros sucios → rechazado', (() => {
  const b = Buffer.from(ACCEL1); b[5] = 1; return parseMapAccels(b).length === 0;
})());
check('byte[14] != 0 (coordB fina) → rechazado', (() => {
  const b = Buffer.from(ACCEL1); b[14] = 1; return parseMapAccels(b).length === 0;
})());
check('bytes [19..22] sucios → rechazado', (() => {
  const b = Buffer.from(ACCEL1); b[22] = 1; return parseMapAccels(b).length === 0;
})());
check('f1 > 30 días → rechazado', (() => {
  const b = Buffer.from(ACCEL1); b.writeUInt32LE(30 * 24 * 3600 + 1, 23); return parseMapAccels(b).length === 0;
})());
check('ocupación 63 B sigue parseándose igual', parseTileOccupants(BODY_63).length === 1, `hits=${parseTileOccupants(BODY_63).length}`);
check('classifyMapBody del 0x12 suelto sería delivery (por eso se intercepta)', classifyMapBody(ACCEL1) === 'delivery');

console.log('--- bloque con prefijo 0x0f (88 B = 0x0f + marcha)');
const MARCH_WITH_F0F = Buffer.concat([F0F_15, MARCH_73]);
check('longitud 88', MARCH_WITH_F0F.length === 88, `len=${MARCH_WITH_F0F.length}`);
const pre = parseMapMarches(MARCH_WITH_F0F);
check('se parsea la marcha', pre.length === 1 && pre[0]!.name === 'Gaseosa IDL', `${pre.length} marchas`);
check('block correcto aunque el 0x0f va adelante', pre[0]?.block === '360200110200', pre[0]?.block);

// ── A nivel handler ────────────────────────────────────────────────────────
console.log('--- handler (handleMapData)');

function fakeBot() {
  const accels: MapAccel[] = [];
  const logs: string[] = [];
  const b: any = {
    mapTiles: new Map(),
    mapMarches: new Map(),
    mapOccupants: new Map(),
    emit: () => {},
    bot: { log: (m: string) => logs.push(m) },
    onTileInfo: () => {},
    onMonsterHit: () => {},
    onTileOccupant: () => {},
    onHuntMarch: () => {},
    onLuckyCardMarch: () => {},
    onMapAccel: (a: MapAccel) => {
      accels.push(a);
      let target: MapMarch | undefined;
      for (const m of b.mapMarches.values()) {
        if (m.block === a.block) { target = m; break; }
      }
      applyAccel(target, a, Math.floor(Date.now() / 1000));
    },
  };
  return { bot: b, accels, logs };
}

const hb = fakeBot();
handleMapData(hb.bot, ACCEL1);
check('0x12 suelto llega a onMapAccel', hb.accels.length === 1, `accels=${hb.accels.length}`);
check('0x12 suelto NO crea tiles ni marchas', hb.bot.mapTiles.size === 0 && hb.bot.mapMarches.size === 0, `tiles=${hb.bot.mapTiles.size} marches=${hb.bot.mapMarches.size}`);

// Marcha fresca (startTime = ahora − 6) para que el handler no la descarte
const hb2 = fakeBot();
const marchFresh = Buffer.from(MARCH_73);
marchFresh.writeUInt32LE(Math.floor(Date.now() / 1000) - 6, 41);
handleMapData(hb2.bot, marchFresh);
check('la marcha entra en mapMarches', hb2.bot.mapMarches.size === 1, `marches=${hb2.bot.mapMarches.size}`);
handleMapData(hb2.bot, ACCEL1);
check('acel1 aplicada a su marcha', hb2.accels.length === 1 && hb2.bot.mapMarches.size === 1, `accels=${hb2.accels.length}`);
const stored = [...hb2.bot.mapMarches.values()][0] as MapMarch;
const approxNow = Math.floor(Date.now() / 1000);
check('eta ≈ ahora + f1 (5 s)', typeof stored.eta === 'number' && Math.abs(stored.eta! - (approxNow + 5)) <= 3, `eta−(ahora+5)=${stored.eta ? stored.eta - approxNow - 5 : '?'}`);

// Apilado: 0x12 + marcha en el mismo body
const hb3 = fakeBot();
const stacked1 = Buffer.concat([ACCEL1, marchFresh]);
handleMapData(hb3.bot, stacked1);
check('apilado [0x12][marcha]: llega la acel', hb3.accels.length === 1, `accels=${hb3.accels.length}`);
check('apilado [0x12][marcha]: se procesa la marcha del resto', hb3.bot.mapMarches.size === 1, `marches=${hb3.bot.mapMarches.size}`);

// Apilado al revés: marcha + 0x12 (el prefijo se re-procesa)
const hb4 = fakeBot();
const stacked2 = Buffer.concat([marchFresh, ACCEL1]);
handleMapData(hb4.bot, stacked2);
check('apilado [marcha][0x12]: se procesa la marcha', hb4.bot.mapMarches.size === 1, `marches=${hb4.bot.mapMarches.size}`);
check('apilado [marcha][0x12]: llega la acel', hb4.accels.length === 1, `accels=${hb4.accels.length}`);

// La ocupación de tile no se toca con el parser nuevo delante
const hb5 = fakeBot();
const occupants: unknown[] = [];
hb5.bot.onTileOccupant = (o: unknown) => occupants.push(o);
handleMapData(hb5.bot, BODY_63);
check('ocupación 63 B: 0 acels y 1 occupant', hb5.accels.length === 0 && occupants.length === 1, `accels=${hb5.accels.length} occ=${occupants.length}`);

console.log(failures === 0 ? '\nOK' : `\n${failures} FALLOS`);
process.exit(failures === 0 ? 0 : 1);
