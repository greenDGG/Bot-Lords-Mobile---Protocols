/**
 * TEST: catálogo + escuadra recomendada (huntData) + payload 2488 con la
 * escuadra propia del bot.
 *
 * Uso: npx ts-node scripts/test-hunt-squad.ts
 */
import { MONSTERS, getMonsterSquad, getMonsterDebilidad, monsterName } from '../src/bot/data/monsters';
import { pickHuntSquad, buildHuntPayload } from '../src/bot/data/hunt-squad';
import { HERO_IDS, heroName } from '../src/bot/data/heros-db';

let ok = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'OK  ' : 'FALLA'} ${msg}`);
  if (cond) ok++;
  else process.exitCode = 1;
};

const ids = Object.keys(MONSTERS).map(Number);

console.log('== catálogo (monsters-data.json) ==');
check(ids.length === 140, `140 entradas (${ids.length})`);
check(
  ids.filter((i) => MONSTERS[i].heroes).length === 129,
  `129 con escuadra (${ids.filter((i) => MONSTERS[i].heroes).length})`,
);
check(MONSTERS[217]?.cofre === true && MONSTERS[259]?.cofre === true, '217 y 259 son cofres');
check(getMonsterDebilidad(217) === null, 'cofre sin debilidad');

console.log('\n== debilidad: regla manual + relleno huntData ==');
for (const id of [2, 6, 9, 18, 29, 218, 302]) {
  check(getMonsterDebilidad(id) === 'fisico', `${monsterName(id)} (id ${id}) → fisico`);
}
check(getMonsterDebilidad(15) === 'magia', `${monsterName(15)} (id 15) → magia`);
const idSinDebilidad = ids.find((i) => !MONSTERS[i].debilidad && !MONSTERS[i].cofre)!;
check(
  getMonsterDebilidad(idSinDebilidad) === null,
  `${monsterName(idSinDebilidad)} (id ${idSinDebilidad}, sin huntData) → null`,
);

console.log('\n== escuadras recomendadas ==');
const conEscuadra = ids.filter((i) => MONSTERS[i].heroes);
const sinEscuadra = ids.filter((i) => !MONSTERS[i].heroes && !MONSTERS[i].cofre);
console.log(
  `  sin escuadra (${sinEscuadra.length}): ${sinEscuadra.map((i) => `#${i} ${monsterName(i)}`).join(', ')}`,
);
let heroesMalos = 0;
let niveles = 0;
for (const id of conEscuadra) {
  for (const lista of Object.values(MONSTERS[id].heroes!)) {
    niveles++;
    if (lista.length !== 5 || new Set(lista).size !== 5) heroesMalos++;
    if (lista.some((h) => !HERO_IDS[h])) heroesMalos++;
  }
  for (const lista of Object.values(MONSTERS[id].heroesP2p || {})) {
    if (lista.length !== 5 || lista.some((h) => !HERO_IDS[h])) heroesMalos++;
  }
}
check(heroesMalos === 0, `todas las escuadras: 5 héroes existentes (${niveles} niveles)`);
check(getMonsterSquad(2, 5) !== null, 'id 2 nivel 5 tiene escuadra');
const sqLejos = getMonsterSquad(2, 99);
check(sqLejos !== null && sqLejos.nivel === 5, `nivel 99 → nivel más cercano ${sqLejos?.nivel}`);
check(getMonsterSquad(42, 3) === null, 'id 42 (sin huntData) → sin escuadra');
check(getMonsterSquad(217, 3) === null, 'cofre → sin escuadra');

console.log('\n== pickHuntSquad ==');
const sq2 = getMonsterSquad(2, 3)!;
check(pickHuntSquad(sq2.heroes, 2, 3)?.fuente === 'recomendado', 'con los 5 → recomendado');
check(pickHuntSquad(sq2.heroes.slice(1), 2, 3) === null, 'sin un héroe → null (usa debilidad)');
check(pickHuntSquad([], 2, 3) === null, 'sin héroes → null');
// primer monstruo cuya escuadra p2p funciona como fuente "p2p" (la free incompleta)
const candP2p = conEscuadra.find((i) => Object.keys(MONSTERS[i].heroesP2p || {}).length > 0);
const sqP2p = candP2p ? getMonsterSquad(candP2p, Number(Object.keys(MONSTERS[candP2p].heroesP2p!)[0])) : null;
const ownedP2p = sqP2p ? [...sqP2p.p2p, 9001, 9002, 9003, 9004, 9005, 9006] : [];
const fuenteP2p = candP2p && sqP2p ? pickHuntSquad(ownedP2p, candP2p, sqP2p.nivel)?.fuente : null;
check(
  fuenteP2p === 'p2p',
  candP2p && sqP2p
    ? `${monsterName(candP2p)} sólo con los p2p → ${fuenteP2p} (${sqP2p.p2p
        .map((h) => heroName(h))
        .join(', ')})`
    : 'hay monstruos con escuadra p2p',
);
check(pickHuntSquad([1, 2, 3, 4, 5], 999, 1) === null, 'monstruo desconocido → null');

console.log('\n== buildHuntPayload (hexes reales de la config) ==');
const hexFisico = '01070012000d0011001700021000';
const hexLegacy = '0110001400060004000500022700';
const escuadra = [1, 5, 7, 13, 17];
for (const [nombre, hex] of [['fisico', hexFisico], ['legacy', hexLegacy]] as const) {
  const out = buildHuntPayload(hex, escuadra);
  const okLen = out !== null && out.length === hex.length;
  check(okLen, `${nombre}: misma longitud (${out?.length}/${hex.length})`);
  if (!out) continue;
  check(out.startsWith('01'), `${nombre}: byte0 = 01`);
  check(
    out.slice(-6) === hex.slice(-6),
    `${nombre}: trailer intacto (${out.slice(-6)} vs ${hex.slice(-6)})`,
  );
  const buf = Buffer.from(out, 'hex');
  const idsOut: number[] = [];
  for (let i = 0; i < 5; i++) idsOut.push(buf.readUInt16LE(1 + i * 2));
  check(JSON.stringify(idsOut) === JSON.stringify(escuadra), `${nombre}: heroIds = [${idsOut}]`);
}
check(buildHuntPayload('aabbcc', escuadra) === null, 'hex corto → null');
check(buildHuntPayload('02070012000d0011001700021000', escuadra) === null, 'byte0 != 01 → null');
check(buildHuntPayload(hexFisico, [1, 2]) === null, 'escuadra != 5 → null');

console.log('\n== integración: payload con los héroes recomendados ==');
const sq18 = getMonsterSquad(18, 5)!;
const payload18 = buildHuntPayload(hexFisico, sq18.heroes);
check(
  payload18 !== null && payload18.length === 28,
  `${monsterName(18)} nivel 5 → payload de ${sq18.heroes.length} héroes`,
);
if (payload18) {
  console.log(`       ${sq18.heroes.map((h) => heroName(h)).join(', ')}`);
}

console.log(`\n${ok} OK`);
