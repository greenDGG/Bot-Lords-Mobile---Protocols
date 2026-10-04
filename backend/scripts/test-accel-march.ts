import * as fs from 'fs';
import * as path from 'path';
import { parse1407 } from '../src/bot/parsers/speedup.parser';
import {
  ACCEL_CANDIDATES,
  ACCEL_RETRY_DELAY_MS,
  ACCEL_STATUS_RETRIES,
  EVENT_BOOTS_ID,
  MAX_ACCEL_ATTEMPTS,
  MARCH_BOOTS_IDS,
  pickSpeedupItem,
  resolveAccelIndex,
  resolveParticipantIndex,
  sendArmyStatus,
  sendSpeedupSelect,
  sendSpeedupUse,
} from '../src/bot/commands/speedup.commands';
import { UI_SECTION_ARMY_STATUS, UI_SECTION_SPEEDUP } from '../src/bot/commands/formation.commands';
import { handleInventory } from '../src/bot/handlers/inventory.handler';
import { BotEngine } from '../src/bot/engine/bot-engine';
import type { BotInstance } from '../src/bot/core/bot-instance';
import { OwnMarch } from '../src/bot/models/march.types';

let failures = 0;
function check(label: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  ok   ${label}${detail ? ' → ' + detail : ''}`);
  else {
    failures++;
    console.log(`  FALLO ${label}${detail ? ' → ' + detail : ''}`);
  }
}

const ITEMS_DB = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'bot', 'data', 'items.json'), 'utf-8'),
).ITEMS_DB;

// escudo 24h (log 1297816148/20260723:1031): layout largo, ts@11
const SHIELD_1407 = Buffer.from(
  '00' + '1c04' + '16' + '00' + '0000' + '0200' + '1c04' +
  '7fa5626a' + '00000000' + '80510100' + '38000000',
  'hex',
);
// botas aladas I (captura del usuario): layout corto, ts@7
const BOOTS_1407 = Buffer.from(
  '00' + '0f04' + '08' + '00' + '0200' +
  '0044626a' + '00000000' + '80010000' + '39013701',
  'hex',
);
// cofre 3073 ×100 (log 1297816148/20260724:271): sin ts → no es aceleración
const CHEST_1407 = Buffer.from(
  '00010c30100000000000006eb2000000000000fc950e0005f603640000fc03640000fd03640000fe03640000ff03640000',
  'hex',
);

console.log('--- parse1407 layout largo (escudo)');
const shield = parse1407(SHIELD_1407);
check('ok', shield.ok === true);
check('status=0', shield.status === 0, String(shield.status));
check('itemId=1052', shield.itemId === 1052, String(shield.itemId));
check('qtyLeft=22', shield.qtyLeft === 22, String(shield.qtyLeft));
check('tsOffset=11', shield.tsOffset === 11, String(shield.tsOffset));
check('newTimeSec=86400', shield.newTimeSec === 86400, String(shield.newTimeSec));
check('arrival = ts + 86400', shield.arrivalTs === shield.newStartTs! + 86400, String(shield.arrivalTs));
check('ts en rango epoch', shield.newStartTs! > 1500000000 && shield.newStartTs! < 2200000000, String(shield.newStartTs));

console.log('--- parse1407 layout corto (botas aladas)');
const boots = parse1407(BOOTS_1407);
check('ok', boots.ok === true);
check('status=0', boots.status === 0, String(boots.status));
check('itemId=1039', boots.itemId === 1039, String(boots.itemId));
check('qtyLeft=8', boots.qtyLeft === 8, String(boots.qtyLeft));
check('tsOffset=7', boots.tsOffset === 7, String(boots.tsOffset));
check('newTimeSec=384', boots.newTimeSec === 384, String(boots.newTimeSec));
check('fieldA=2', boots.fieldA === 2, String(boots.fieldA));
check('arrival = ts + 384', boots.arrivalTs === boots.newStartTs! + 384, String(boots.arrivalTs));

console.log('--- parse1407 otros usos (cofre 3073)');
const chest = parse1407(CHEST_1407);
check('cofre: ok=false (no hay ts)', chest.ok === false);
check('cofre: itemId=3073', chest.itemId === 3073, String(chest.itemId));
check('cofre: qtyLeft u16@3 = 4144', chest.qtyLeft === 4144, String(chest.qtyLeft));
check('cofre: status=0', chest.status === 0, String(chest.status));

console.log('--- parse1407 casos borde');
check('body corto → ok=false', parse1407(Buffer.alloc(10)).ok === false);
check('itemId 0 → ok=false', parse1407(Buffer.alloc(30)).ok === false);
const badTs = Buffer.from(BOOTS_1407);
badTs.writeUInt32LE(0, 7);
check('ts=0 → ok=false', parse1407(badTs).ok === false);
const badTime = Buffer.from(BOOTS_1407);
badTime.writeUInt32LE(0, 15);
check('newTime=0 → ok=false', parse1407(badTime).ok === false);
const failedStatus = Buffer.from(BOOTS_1407);
failedStatus.writeUInt8(7, 0);
check('status=7 sigue parseando el layout', parse1407(failedStatus).ok === true && parse1407(failedStatus).status === 7);

console.log('--- payloads de salida 1144/1406');
const sent: { proto: number; payload: Buffer }[] = [];
const fakeBot = {
  sendCommandPacket: (proto: number, payload: Buffer) => { sent.push({ proto, payload }); },
} as unknown as BotEngine;

sendArmyStatus(fakeBot);
check('1144 UI Estado de ejército (0x04) = 040000000000', sent[0].proto === 1144 && sent[0].payload.toString('hex') === '040000000000', sent[0].payload.toString('hex'));

sendSpeedupSelect(fakeBot, 'a', 2);
check('1144 UI speedup (0x06) campo a idx 2 = 060002000000', sent[1].payload.toString('hex') === '060002000000');

sendSpeedupSelect(fakeBot, 'b', 1);
check('1144 UI speedup campo b idx 1 = 060000000100', sent[2].payload.toString('hex') === '060000000100');

sendSpeedupUse(fakeBot, 1039, 1, 'a', 2);
check('1406 botas idx campo a = 0f0401000200' + '00'.repeat(8), sent[3].payload.toString('hex') === '0f0401000200' + '00'.repeat(8));

sendSpeedupUse(fakeBot, 1029, 1, 'b', 0);
check('1406 1 min idx campo b = 0504010000000000' + '00'.repeat(6), sent[4].payload.toString('hex') === '0504010000000000' + '00'.repeat(6), sent[4].payload.toString('hex'));

check('1406 siempre 14 bytes', sent.every(s => s.proto !== 1406 || s.payload.length === 14));

check('UI sections: 04 Estado de ejército, 06 speedup', UI_SECTION_ARMY_STATUS === 4 && UI_SECTION_SPEEDUP === 6, `${UI_SECTION_ARMY_STATUS}/${UI_SECTION_SPEEDUP}`);
check('rate limit: ACCEL_RETRY_DELAY_MS >= 1000', ACCEL_RETRY_DELAY_MS >= 1000, String(ACCEL_RETRY_DELAY_MS));
check('rate limit: ACCEL_STATUS_RETRIES = 3', ACCEL_STATUS_RETRIES === 3, String(ACCEL_STATUS_RETRIES));

console.log('--- pickSpeedupItem');
function inv(entries: [number, number][]): Map<number, number> { return new Map(entries); }

const p1 = pickSpeedupItem(inv([[1029, 5]]), 60, ITEMS_DB);
check('gap 60 con 1 min disponible → 1029 ×1', p1?.itemId === 1029 && p1?.seconds === 60 && p1?.qty === 1, JSON.stringify(p1));

const p2 = pickSpeedupItem(inv([[1029, 5], [1149, 2]]), 500, ITEMS_DB);
check('gap 500 → elige 10 min (1149) ×1', p2?.itemId === 1149 && p2?.qty === 1, JSON.stringify(p2));

const p3 = pickSpeedupItem(inv([[1149, 2]]), 60, ITEMS_DB);
check('gap 60 sin item de 1 min → 1149 ×1', p3?.itemId === 1149 && p3?.qty === 1, JSON.stringify(p3));

const p4 = pickSpeedupItem(inv([[1084, 3]]), 400000, ITEMS_DB);
check('gap 400000 con 3× 24h → qty 3 (tope de mochila)', p4?.itemId === 1084 && p4?.qty === 3, JSON.stringify(p4));

const p5 = pickSpeedupItem(inv([[1084, 10]]), 400000, ITEMS_DB);
check('gap 400000 con 10× 24h → qty 5', p5?.itemId === 1084 && p5?.qty === 5, JSON.stringify(p5));

check('mochila vacía → null', pickSpeedupItem(new Map(), 100, ITEMS_DB) === null);
check('gap 0 → null', pickSpeedupItem(inv([[1029, 5]]), 0, ITEMS_DB) === null);
check('solo acelerador de investigación → null', pickSpeedupItem(inv([[1257, 5]]), 100, ITEMS_DB) === null);
check('botas aladas (type combate) → null', pickSpeedupItem(inv([[1039, 5]]), 100, ITEMS_DB) === null);
check('martillo de oro sin effect → null', pickSpeedupItem(inv([[1092, 5]]), 100, ITEMS_DB) === null);

console.log('--- pickSpeedupItem (botas aladas como respaldo)');
check('botas aladas con tiempo restante → 1039 ×1', (() => {
  const b = pickSpeedupItem(inv([[1039, 5]]), 100, ITEMS_DB, 400);
  return b?.itemId === 1039 && b?.qty === 1 && b?.seconds === 100;
})(), JSON.stringify(pickSpeedupItem(inv([[1039, 5]]), 100, ITEMS_DB, 400)));
check('botas aladas + genérico → el genérico', pickSpeedupItem(inv([[1029, 1], [1039, 5]]), 60, ITEMS_DB, 400)?.itemId === 1029);
check('botas de dragón antes que el genérico → 1405', (() => {
  const p = pickSpeedupItem(inv([[1405, 3], [1084, 1]]), 60, ITEMS_DB, 400);
  return p?.itemId === 1405;
})(), JSON.stringify(pickSpeedupItem(inv([[1405, 3], [1084, 1]]), 60, ITEMS_DB, 400)));
check('botas de dragón sin tiempo restante → genérico', pickSpeedupItem(inv([[1405, 3], [1029, 1]]), 60, ITEMS_DB, 0)?.itemId === 1029);
check('botas: dragón I/II/III de aladas', (() => {
  const p = pickSpeedupItem(inv([[1122, 1], [1121, 1], [1039, 1]]), 100, ITEMS_DB, 400);
  return p?.itemId === 1039;
})(), JSON.stringify(pickSpeedupItem(inv([[1122, 1], [1121, 1], [1039, 1]]), 100, ITEMS_DB, 400)));
check('botas: dragón se gasta antes que las aladas', (() => {
  const p = pickSpeedupItem(inv([[1405, 2], [1039, 5]]), 100, ITEMS_DB, 400);
  return p?.itemId === 1405;
})(), JSON.stringify(pickSpeedupItem(inv([[1405, 2], [1039, 5]]), 100, ITEMS_DB, 400)));
check('botas sin tiempo restante → null', pickSpeedupItem(inv([[1405, 5]]), 100, ITEMS_DB, 0) === null);
check('MARCH_BOOTS_IDS = 1405,1039,1121,1122', MARCH_BOOTS_IDS.join(',') === '1405,1039,1121,1122', MARCH_BOOTS_IDS.join(','));
check('EVENT_BOOTS_ID = 1405', EVENT_BOOTS_ID === 1405, String(EVENT_BOOTS_ID));

const generics = ACCEL_CANDIDATES.length;
check('candidatos = 5 (a/b sorted + b participant + a/b slot)', generics === 5, String(generics));
check('MAX_ACCEL_ATTEMPTS cubre todos los candidatos', MAX_ACCEL_ATTEMPTS >= generics, String(MAX_ACCEL_ATTEMPTS));
check('primer candidato = campo a (elegido por el usuario)', ACCEL_CANDIDATES[0].field === 'a' && ACCEL_CANDIDATES[0].source === 'sorted');
check('tercer candidato = campo b / participante del rally', ACCEL_CANDIDATES[2].field === 'b' && ACCEL_CANDIDATES[2].source === 'participant');

console.log('--- resolveParticipantIndex');
const parts = [
  { index: 0, mask: 0x10000, troops: [{ count: 2 }] },
  { index: 1, mask: 0x4000, troops: [{ count: 2 }] },
];
check('máscara + tropas → índice del participante', resolveParticipantIndex(parts, { mask: 0x4000, quantities: [2] }) === 1, String(resolveParticipantIndex(parts, { mask: 0x4000, quantities: [2] })));
check('solo máscara coincide → ese índice', resolveParticipantIndex(parts, { mask: 0x10000, quantities: [7] }) === 0, String(resolveParticipantIndex(parts, { mask: 0x10000, quantities: [7] })));
check('sin envío previo → 0', resolveParticipantIndex(parts, null) === 0);
check('sin participantes → 0', resolveParticipantIndex([], { mask: 1, quantities: [1] }) === 0);
check('sin coincidencias → 0', resolveParticipantIndex(parts, { mask: 0x2, quantities: [1] }) === 0);

console.log('--- resolveAccelIndex');
const NOW = 1700000000;
function entry(index: number, startAt: number, durationSec: number): OwnMarch {
  return {
    index,
    state: durationSec > 0 ? 6 : 1,
    status: durationSec > 0 ? 'flying' : 'arrived',
    heroIds: [],
    troops: [],
    destCoordBytes: [0, 0, 0],
    destX: 0,
    destY: 0,
    name: '',
    startAt,
    durationSec,
    unknown106: 0,
  };
}
const a = entry(0, NOW, 500);
const b = entry(1, NOW - 100, 100);
const c = entry(2, 0, 0);
const entries = [a, b, c];

check('slot de a = 0', resolveAccelIndex(entries, a, 'slot', NOW) === 0, String(resolveAccelIndex(entries, a, 'slot', NOW)));
check('slot de b = 1', resolveAccelIndex(entries, b, 'slot', NOW) === 1);
check('sorted: a (500s) → 2', resolveAccelIndex(entries, a, 'sorted', NOW) === 2, String(resolveAccelIndex(entries, a, 'sorted', NOW)));
check('sorted: b (0s restantes) → 0', resolveAccelIndex(entries, b, 'sorted', NOW) === 0, String(resolveAccelIndex(entries, b, 'sorted', NOW)));
check('sorted: c (llegó) → 1', resolveAccelIndex(entries, c, 'sorted', NOW) === 1, String(resolveAccelIndex(entries, c, 'sorted', NOW)));

const detached = entry(1, NOW - 999, 99);
check('target de otra tanda (mismo slot) → posición del slot fresco', resolveAccelIndex(entries, detached, 'sorted', NOW) === 0, String(resolveAccelIndex(entries, detached, 'sorted', NOW)));

const onlyOne = [entry(0, NOW, 300)];
check('lista con una sola marcha → índice 0', resolveAccelIndex(onlyOne, onlyOne[0], 'sorted', NOW) === 0);

const sharedSlot = [entry(0, 0, 0), entry(0, NOW, 500)];
check('dos entries con el mismo slot → identidad primero', resolveAccelIndex(sharedSlot, sharedSlot[1], 'sorted', NOW) === 1, String(resolveAccelIndex(sharedSlot, sharedSlot[1], 'sorted', NOW)));

console.log('--- handleInventory (1401 por páginas)');
function page1401(page: number, records: [number, number][]): Buffer {
  const body = Buffer.alloc(3 + records.length * 4);
  body.writeUInt8(page, 0);
  body.writeUInt16LE(records.length, 1);
  records.forEach(([id, qty], i) => {
    body.writeUInt16LE(id, 3 + i * 4);
    body.writeUInt16LE(qty, 5 + i * 4);
  });
  return body;
}
const fakeInv = {
  inventory: new Map<number, number>([[9999, 7]]),
  emit: () => undefined,
} as unknown as BotInstance;

handleInventory(fakeInv, page1401(1, [[1149, 132], [1084, 1]]));
check('page1 limpia y rellena', fakeInv.inventory.get(1149) === 132 && fakeInv.inventory.get(1084) === 1 && !fakeInv.inventory.has(9999), JSON.stringify([...fakeInv.inventory]));

handleInventory(fakeInv, page1401(2, [[1039, 136]]));
check('page2 acumula sin limpiar', fakeInv.inventory.get(1149) === 132 && fakeInv.inventory.get(1039) === 136, JSON.stringify([...fakeInv.inventory]));

handleInventory(fakeInv, (() => {
  const b = page1401(1, [[1121, 2], [1084, 3]]);
  b.writeUInt16LE(5, 1);
  return b;
})());
check('count inconsistente → se ignora', fakeInv.inventory.get(1149) === 132 && fakeInv.inventory.get(1039) === 136);

handleInventory(fakeInv, Buffer.alloc(2));
check('body corto → se ignora', fakeInv.inventory.get(1149) === 132);

handleInventory(fakeInv, page1401(1, [[1121, 2]]));
check('page1 vuelve a limpiar', fakeInv.inventory.size === 1 && fakeInv.inventory.get(1121) === 2, JSON.stringify([...fakeInv.inventory]));

console.log(failures ? `\n${failures} FALLOS` : '\nOK');
process.exit(failures ? 1 : 0);
