import {
  DAILY_MISSION_CHESTS,
  DAILY_MISSIONS,
  DAILY_MISSION_CLAIMED_VALUE,
  chestRequirement,
  dailyMissionDesc,
  dailyMissionEnergy,
  dailyMissionInfo,
  dailyMissionRequirement,
  dailyMissionState,
  isChestClaimed,
  maxDailyPa,
} from '../src/bot/data/daily-missions-db';
import { parse3143, parse3144 } from '../src/bot/models/daily-mission.types';

let failed = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.log(`  FALLO: ${msg}`);
  }
}

function buf(hex: string): Buffer {
  return Buffer.from(hex, 'hex');
}

console.log('== daily-missions-db ==');

check(Object.keys(DAILY_MISSIONS).length === 191, `191 misiones (hay ${Object.keys(DAILY_MISSIONS).length})`);
const rank7 = Object.entries(DAILY_MISSIONS).filter(([, m]) => m.rank === 7);
check(rank7.length === 25, `25 misiones de rango 7 (hay ${rank7.length})`);
const ids7 = rank7.map(([id]) => Number(id)).sort((a, b) => a - b);
check(ids7[0] === 144 && ids7[24] === 168, `ids rango 7 = 144..168 (son ${ids7[0]}..${ids7[24]})`);
check(JSON.stringify(DAILY_MISSION_CHESTS) === '[20,40,60,80,100]', 'cofres 20/40/60/80/100');
check(maxDailyPa(7) === 150, `PA max rango 7 = 150 (es ${maxDailyPa(7)})`);
check(dailyMissionRequirement(157) === 18000, '157: requirement 18000');
check(dailyMissionEnergy(157) === 10, '157: energy 10');
check(dailyMissionDesc(147) === 'Usa emoticonos', `147: "Usa emoticonos" (es ${JSON.stringify(dailyMissionDesc(147))})`);
check((dailyMissionDesc(160) || '').includes('tropas'), '160: entrenar tropas');
check(dailyMissionInfo(9999) === undefined, 'id desconocido -> undefined');

check(dailyMissionState(157, DAILY_MISSION_CLAIMED_VALUE) === 'claimed', 'value FFFFFFFF = claimed');
check(dailyMissionState(157, 18000) === 'complete', 'value >= requirement = complete');
check(dailyMissionState(157, 17999) === 'progress', 'value < requirement = progress');
check(dailyMissionState(159, 1) === 'complete', '159 con requirement 1: value 1 = complete');
check(chestRequirement(0) === 20 && chestRequirement(4) === 100, 'umbrales de cofres');
check(isChestClaimed(0x03, 0) && isChestClaimed(0x03, 1) && !isChestClaimed(0x03, 2), 'máscara de cofres');

// ── 3144: snapshot real (cuenta 1035379223, 2026-09-29) ──
console.log('== parse3144 (muestra real, PA 0) ==');
const EMPTY = '000007199000010000009100000000009200000000009300000000009400010000009500000000009600000000009700010000009800050000009900000000009a00050000009b00020000009c00000000009d00000000009e00a00000009f0000000000a00000000000a10032000000a20000000000a30000000000a40000000000a50000000000a60000000000a70001000000a80000000000';
const s0 = parse3144(buf(EMPTY));
check(!!s0, 'parse3144 devuelve snapshot');
if (s0) {
  check(s0.pa === 0 && s0.chestMask === 0 && s0.missionRank === 7, `header PA/mask/rank = 0/0/7 (es ${s0.pa}/${s0.chestMask}/${s0.missionRank})`);
  check(s0.missions.length === 25, `25 registros (hay ${s0.missions.length})`);
  check(s0.missions.every((m, i) => m.id === 144 + i), 'ids 144..168 en orden');
  check(s0.missions.find(m => m.id === 158)?.value === 160, '158 = 160 (completa)');
  check(dailyMissionState(158, s0.missions.find(m => m.id === 158)!.value) === 'complete', '158 completa sin reclamar');
  const claimed = s0.missions.filter(m => m.value === DAILY_MISSION_CLAIMED_VALUE);
  check(claimed.length === 0, `PA 0 => 0 reclamadas (hay ${claimed.length})`);
}

// ── 3144: snapshot real (cuenta 1513179881, 2026-10-03) con PA y cofres ──
console.log('== parse3144 (muestra real, PA 50) ==');
const FULL = '320307199000000000009100000000009200000000009300000000009400ffffffff9500000000009600ffffffff9700ffffffff9800040000009900000000009a00ffffffff9b00ffffffff9c00000000009d00961a00009e009c0000009f00ffffffffa000ffffffffa10000000000a20000000000a30000000000a40000000000a50000000000a60000000000a700ffffffffa80000000000';
const s1 = parse3144(buf(FULL));
check(!!s1, 'parse3144 devuelve snapshot');
if (s1) {
  check(s1.pa === 50 && s1.chestMask === 0x03 && s1.missionRank === 7, `header PA/mask/rank = 50/3/7 (es ${s1.pa}/${s1.chestMask}/${s1.missionRank})`);
  const claimed = s1.missions.filter(m => m.value === DAILY_MISSION_CLAIMED_VALUE);
  check(
    JSON.stringify(claimed.map(m => m.id)) === '[148,150,151,154,155,159,160,167]',
    `reclamadas ${JSON.stringify(claimed.map(m => m.id))}`,
  );
  const pa = claimed.reduce((sum, m) => sum + dailyMissionEnergy(m.id), 0);
  check(pa === s1.pa, `PA = suma de energías de las reclamadas (${pa} vs ${s1.pa})`);
  for (let i = 0; i < DAILY_MISSION_CHESTS.length; i++) {
    const shouldBeSet = s1.pa >= DAILY_MISSION_CHESTS[i];
    check(isChestClaimed(s1.chestMask, i) === shouldBeSet, `cofre ${i + 1} (${DAILY_MISSION_CHESTS[i]} PA) máscara coherente con pa=${s1.pa}`);
  }
  check(dailyMissionState(157, s1.missions.find(m => m.id === 157)!.value) === 'progress', '157 = 6806/18000 en curso');
}

// ── 3143: muestras reales ──
console.log('== parse3143 (muestras reales) ==');
const u1 = parse3143(buf('980002000000'));
check(!!u1 && u1.id === 152 && u1.value === 2, `152 -> 2 (es ${u1?.id}/${u1?.value})`);
check(u1 !== null && dailyMissionState(u1.id, u1.value) === 'progress', '152 con 2/5 en curso');
const u2 = parse3143(buf('9f0001000000'));
check(u2 !== null && u2.id === 159 && dailyMissionState(159, u2.value) === 'complete', '159 con 1/1 completa');
const u3 = parse3143(buf('9d004b0d0000'));
check(u3 !== null && u3.id === 157 && u3.value === 3403, `157 -> 3403 (es ${u3?.value})`);

// ── entradas inválidas ──
console.log('== límites ==');
check(parse3144(Buffer.alloc(0)) === null, '3144 vacío -> null');
check(parse3144(buf('320307')) === null, '3144 sin registros -> null');
check(parse3144(buf('320307199000010000')) === null, '3144 truncado -> null');
check(parse3143(Buffer.alloc(4)) === null, '3143 corto -> null');

if (failed > 0) {
  console.log(`\n${failed} comprobaciones fallaron`);
  process.exit(1);
}
console.log('\nOK');
