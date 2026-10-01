import { BUILDING_DB, BUILDING_EFFECTS, COST_KEYS, getBuildingEffect, getBuildingLevel, getBuildingName, getNextLevel } from '../src/bot/data/building-db';
import { EFFECT_DEFS } from '../src/bot/data/effect-db';
import { computeBuildingStats } from '../src/bot/building-stats';
import { computePlayerStats } from '../src/bot/features/player-stats';

let ok = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'OK  ' : 'FALLA'} ${msg}`);
  if (cond) ok++;
  else process.exitCode = 1;
};

const ids = Object.keys(BUILDING_DB).map(Number);
console.log('== building-db (datos reales de Table.unity3d) ==');
check(ids.length >= 40, `carga construcciones desde buildings.json — ${ids.length}`);
check(ids.every(id => BUILDING_DB[id].name), 'todas tienen nombre visible');
check([103, 104, 108].every(id => BUILDING_DB[id]?.nameTable), 'ids sin etiqueta propia usan nameTable');
check(getBuildingName(8) === 'Castillo', 'getBuildingName(8) = Castillo');
check(getBuildingName(999) === 'ID 999', 'getBuildingName de id desconocido');
check(COST_KEYS.join(',') === 'food,stone,timber,ore,gold', 'orden de costos [comida, piedra, madera, mineral, oro]');

const levelsTotal = ids.reduce((a, id) => a + Object.keys(BUILDING_DB[id].levels).length, 0);
check(levelsTotal > 1000, `niveles decodificados — ${levelsTotal}`);

console.log('\n== integridad de niveles ==');
let badCosts = 0;
let badFx = 0;
let noNameFx = 0;
for (const id of ids) {
  for (const [lvKey, lv] of Object.entries(BUILDING_DB[id].levels)) {
    if (!lv.costs || COST_KEYS.some(k => typeof lv.costs[k] !== 'number')) badCosts++;
    if (typeof lv.time !== 'number' || typeof lv.might !== 'number') badCosts++;
    for (const e of lv.effects) {
      const fx = getBuildingEffect(e.id);
      if (!fx) badFx++;
      else if (!fx.name) noNameFx++;
      if (typeof e.value !== 'number') badFx++;
    }
  }
}
check(badCosts === 0, `costos/tiempos/poder completos en todos los niveles (${badCosts} malos)`);
check(badFx === 0, `todo effectId existe en el catálogo (${badFx} malos)`);
check(noNameFx === 0, `todo efecto tiene nombre (${noNameFx} sin nombre)`);

console.log('\n== catálogo único de efectos (effects.json) ==');
check(Object.keys(EFFECT_DEFS).length === 550, `effects.json con 550 efectos — ${Object.keys(EFFECT_DEFS).length}`);
check(BUILDING_EFFECTS === EFFECT_DEFS, 'BUILDING_EFFECTS es el catálogo único (sin copia en buildings.json)');
check(
  Object.values(BUILDING_DB).every(b =>
    Object.values(b.levels).every(l => l.effects.every(e => EFFECT_DEFS[e.id])),
  ),
  'todo effectId de construcción está en EFFECT_DEFS',
);
check(
  Object.values(BUILDING_DB).every(b =>
    Object.values(b.levels).every(l => l.effects.every(e => EFFECT_DEFS[e.id].scope === 'local' || EFFECT_DEFS[e.id].scope === 'global')),
  ),
  'todo efecto de construcción tiene scope definido',
);

console.log('\n== contra la wiki ==');
const castle25 = getBuildingLevel(8, 25)!;
check(castle25.time === 12042493, `Castillo 25: 139d 09:08:13 = ${castle25.time}s`);
check(castle25.costs.food === 17776822, `Castillo 25 comida = ${castle25.costs.food}`);
check(castle25.might === 822089, `Castillo 25 poder = ${castle25.might}`);
check(
  castle25.effects.some(e => e.id === 310 && e.value === 200000) &&
    castle25.effects.some(e => e.id === 279 && e.value === 30),
  'Castillo 25: Tamaño máx 200.000 y Ayuda MAX+30',
);
const manor2 = getBuildingLevel(5, 2)!;
check(
  manor2.costs.food === 216 && manor2.costs.stone === 360 && manor2.costs.timber === 360 && manor2.costs.ore === 264,
  'Mansión 2: 216 comida / 360 piedra / 360 madera / 264 mineral',
);
const manor25 = getBuildingLevel(5, 25)!;
check(manor25.might === 219223, `Mansión 25 poder = ${manor25.might}`);
check(
  manor25.effects.some(e => e.id === 251 && e.value === 2000) &&
    manor25.effects.some(e => e.id === 216 && e.value === 200),
  'Mansión 25: Vel. entrenamiento 20.00 % y ATQ ejército 2.00 %',
);
const farm25 = getBuildingLevel(4, 25)!;
check(farm25.costs.stone === 3160180, `Granja 25 piedra = ${farm25.costs.stone}`);
check(farm25.time === 2850260, `Granja 25 tiempo = ${farm25.time}s`);
check(farm25.costs.food === 0, 'Granja 25 no consume comida');
const lumber2 = getBuildingLevel(1, 2)!;
check(
  lumber2.costs.food === 150 && lumber2.costs.ore === 150 && lumber2.costs.timber === 0,
  'Aserradero 2: 150 comida / 150 piedra / 150 mineral, sin madera',
);

console.log('\n== niveles siguiente/máximo ==');
check(getNextLevel(8, 1)!.level === 2, 'Castillo 1 → 2 existe');
const top8 = BUILDING_DB[8].maxLevel;
check(getNextLevel(8, top8) === null, `Castillo nv ${top8} es el máximo (sin nivel siguiente)`);
check(getBuildingLevel(25, 1) === null, 'construcción sin datos (id 25) no tiene niveles');
check(getNextLevel(25, 1) === null, 'id 25 sin nivel siguiente');
check(getNextLevel(999, 1) === null, 'id desconocido sin nivel siguiente');

console.log('\n== computeBuildingStats ==');
const sample = [
  { id: 8, level: 25 },
  { id: 5, level: 25 },
  { id: 5, level: 25 },
  { id: 5, level: 10 },
  { id: 4, level: 25 },
  { id: 999, level: 3 },
  { id: 25, level: 1 },
];
const stats = computeBuildingStats(sample);
check(stats.length > 0, `agrupa efectos de construcciones — ${stats.length}`);
check(stats.every(s => s.total === s.buildings.reduce((a, b) => a + b.value, 0)), 'total === suma de items');
check(stats.every(s => s.count === s.buildings.length), 'count === items');
check(stats.every(s => s.scope === 'local' || s.scope === 'global'), 'cada stat tiene scope');
check(stats.every(s => s.buildings.every(b => b.level > 0)), 'solo edificios con nivel > 0');
check(stats.some(s => s.name.startsWith('Tamaño máx')), 'Castillo aporta Tamaño máx');
check(stats.some(s => s.name.startsWith('ATQ de ejército') && s.scope === 'global'), 'ATQ de ejército es global');
check(stats.some(s => s.name.startsWith('Producción de comida') && s.scope === 'local'), 'Producción de comida es local');
const armyAtk = stats.find(s => s.name.startsWith('ATQ de ejército'))!;
check(armyAtk.total === 400, `dos Mansiones nv 25 suman 2.00 % + 2.00 % = ${armyAtk.total / 100} %`);
check(armyAtk.count === 2, `ATQ de ejército: dos aportes (edificios) — ${armyAtk.count}`);
check(computeBuildingStats(undefined).length === 0, 'sin edificios => array vacío');
check(computeBuildingStats([]).length === 0, 'lista vacía => array vacío');

console.log('\n== computePlayerStats con construcciones ==');
const ps = computePlayerStats({ buildingState: { buildings: sample } });
check(ps.length > 0, `stats del jugador con construcciones — ${ps.length}`);
check(ps.every(s => s.total === s.contributions.reduce((a, c) => a + c.total, 0)), 'total === suma de contributions');
check(
  ps.some(s => s.contributions.some(c => c.source === 'building' && c.label === 'Construcciones')),
  'la fuente Construcciones está presente',
);
check(
  ps.every(s => s.contributions.every(c => c.items.length === c.count)),
  'contribuciones completas (items === count)',
);
check(computePlayerStats({}).length === 0, 'sin fuentes => array vacío');

console.log('\n== efectos no pasivos (Altar) ==');
check(BUILDING_DB[19].temporal === true, 'Altar (19) marcado como temporal');
check(ids.every(id => typeof BUILDING_DB[id].temporal === 'boolean'), 'todas con el campo temporal');
check(ids.filter(id => BUILDING_DB[id].temporal).join(',') === '19', 'sólo el Altar es temporal');
const altar30 = getBuildingLevel(19, 30)!;
check(altar30.effects.length === 4, `el Altar nv 30 sí tiene 4 efectos (${altar30.effects.length})`);
check(computeBuildingStats([{ id: 19, level: 30 }]).length === 0, 'el Altar no aporta a Player Stats');
const psAltar = computePlayerStats({ buildingState: { buildings: [{ id: 19, level: 30 }] } });
check(psAltar.length === 0, 'sólo el Altar => Player Stats vacío');
const psMixed = computePlayerStats({
  buildingState: { buildings: [{ id: 19, level: 30 }, { id: 5, level: 25 }] },
});
check(
  psMixed.some(s => s.contributions.some(c => c.items.some(i => i.id === 5))),
  'las demás construcciones siguen aportando',
);

console.log('\n== efectos de referencia ==');
check(getBuildingEffect(216)?.unit === '%', 'ATQ de ejército usa %');
check(getBuildingEffect(271)?.scope === 'local', 'Capacidad de la cámara es local');
check(getBuildingEffect(249)?.scope === 'global', 'Vel. investigación es global');
check(!!getBuildingEffect(310)?.name.startsWith('Tamaño máx'), 'efecto 310 con nombre real');

console.log(`\n${ok} checks OK`);
