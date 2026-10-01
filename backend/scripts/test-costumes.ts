import { COSTUME_DB, getCostumeBuffs, getCostumeName } from '../src/bot/data/costume-db';
import { BUFF_DEFS, COSTUME_DEFS, GRADE6_MULTIPLIER } from '../src/bot/data/costume-buffs';
import { EFFECT_DEFS } from '../src/bot/data/effect-db';
import { computeCostumeStats } from '../src/bot/costume-stats';
import { computePlayerStats } from '../src/bot/features/player-stats';
import type { CostumeItem } from '../src/bot/parsers/costume.parser';

let ok = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'OK  ' : 'FALLA'} ${msg}`);
  if (cond) ok++;
  else process.exitCode = 1;
};

const ids = Object.keys(COSTUME_DB).map(Number);
console.log('== costume-db (datos reales de Table.unity3d) ==');
check(ids.length >= 200, `carga trajes desde costumes.json — ${ids.length}`);
check(ids.length === ids.filter(id => COSTUME_DEFS[id]).length, 'COSTUME_DB y COSTUME_DEFS coinciden');
check(Object.keys(EFFECT_DEFS).length === 550, `catálogo único de efectos (effects.json) — ${Object.keys(EFFECT_DEFS).length}`);
check(
  Object.keys(BUFF_DEFS).length === Object.keys(EFFECT_DEFS).length,
  'BUFF_DEFS sale del catálogo único (sin copias en costumes.json)',
);
check(GRADE6_MULTIPLIER === 1.4, `multiplicador grade 6 = ${GRADE6_MULTIPLIER}`);

check(
  ids.every(id => [1, 2, 3, 4, 5, 6].every(g => Array.isArray(COSTUME_DB[id].buffs[g]))),
  'cada traje tiene buffs de grade 1..6',
);
check(
  ids.every(id => [1, 2, 3, 4, 5, 6].every(g => COSTUME_DB[id].buffs[g].length > 0)),
  'cada grade tiene al menos un buff',
);
check(
  ids.every(id =>
    [1, 2, 3, 4, 5, 6].every(g =>
      COSTUME_DB[id].buffs[g].every(b => BUFF_DEFS[b.buffId]?.name && EFFECT_DEFS[b.buffId]?.name),
    ),
  ),
  'todo buffId existe en EFFECT_DEFS y BUFF_DEFS con nombre real',
);
check(
  ids.every(id =>
    [1, 2, 3, 4, 5, 6].every(g =>
      COSTUME_DB[id].buffs[g].every(b => BUFF_DEFS[b.buffId]?.unit === EFFECT_DEFS[b.buffId]?.unit),
    ),
  ),
  'unidades de BUFF_DEFS = unidades del catálogo',
);
check(ids.every(id => COSTUME_DB[id].name && COSTUME_DB[id].nameEn), 'todos los trajes con nombre ES/EN');

console.log('\n== trajes de referencia ==');
const buffMap = (id: number, grade: number): Map<number, number> =>
  new Map((COSTUME_DB[id]?.buffs[grade] || []).map(b => [b.buffId, b.value]));
check(getCostumeName(4717) === 'Yelmo caza', `4717 = ${getCostumeName(4717)} (Yelmo caza / Hunting Helm)`);
check(getCostumeName(4717).length > 0 && getCostumeName(99999) === 'Traje 99999', 'id desconocido => "Traje {id}"');
const g5 = buffMap(4717, 5);
const g6 = buffMap(4717, 6);
check(g5.get(318) === 500 && g5.get(319) === 3000 && g5.get(321) === 1000, `4717 grade 5 = ${JSON.stringify([...g5])}`);
check(g6.get(318) === 700 && g6.get(319) === 4200 && g6.get(321) === 1400, `4717 grade 6 = ${JSON.stringify([...g6])}`);
const g5_4792 = buffMap(4792, 5);
check(
  [...g5_4792.values()].join() === '4000,1000,2200,5000',
  `4792 grade 5 = ${[...g5_4792.values()].join()}`,
);

const b5 = getCostumeBuffs(4717, 5);
check(b5.length === 3, `getCostumeBuffs(4717,5) — ${b5.length} buffs`);
check(
  b5.some(b => b.buffName === 'Ahorro de energía' && b.value === 500 && b.unit === '%') &&
    b5.some(b => b.buffName === 'Energía +' && b.value === 3000 && b.unit === ''),
  'nombres y unidades reales del cliente',
);
check(getCostumeBuffs(4717, 3).length === 3, 'grade 3 existe');
check(getCostumeBuffs(99999, 5).length === 0, 'traje desconocido => []');

console.log('\n== computeCostumeStats ==');
const equipped: CostumeItem[] = [
  { id: 4717, grade: 5 } as CostumeItem,
  { id: 4792, grade: 6 } as CostumeItem,
  { id: 4401, grade: 2 } as CostumeItem,
  { id: 99999, grade: 5 } as CostumeItem,
];
const stats = computeCostumeStats(equipped);
check(stats.length > 0, `agrupa por efecto — ${stats.length}`);
check(stats.every(s => Math.abs(s.total - s.costumes.reduce((a, c) => a + c.value, 0)) < 1e-9), 'total === suma de costumes');
check(stats.every(s => s.count === s.costumes.length), 'count === costumes.length');
check(stats.every(s => s.key === `${s.name}|${s.unit}`), 'clave = nombre|unidad');
const energy = stats.find(s => s.key === 'Energía +|');
check(energy?.total === 3000, `Energía + (4717 G5) = ${energy?.total}`);
const cavalry = stats.find(s => s.key === 'ATQ caballería +|%');
check(!!cavalry && cavalry.total > 0, `ATQ caballería agrupa 4792 y 4401 = ${cavalry?.total}`);
check(computeCostumeStats(undefined).length === 0, 'sin trajes => []');
check(computeCostumeStats([]).length === 0, 'lista vacía => []');

console.log('\n== computePlayerStats con trajes ==');
const player = computePlayerStats({ equippedCostumes: equipped });
const costumeContribution = player.flatMap(s => s.contributions).filter(c => c.source === 'costume');
check(costumeContribution.length > 0, `fuente 'costume' presente — ${costumeContribution.length} contribuciones`);
check(costumeContribution.every(c => c.label === 'Trajes'), "label 'Trajes'");
check(
  player.every(s => Math.abs(s.total - s.contributions.reduce((a, c) => a + c.total, 0)) < 1e-9),
  'total === suma de contributions',
);
check(player.every(s => s.count === s.contributions.reduce((a, c) => a + c.count, 0)), 'count === suma de counts');
check(computePlayerStats({}).length === 0, 'sin fuentes => array vacío');

console.log('\ntop con trajes:');
for (const s of [...player].sort((a, b) => b.total - a.total).slice(0, 8)) {
  const srcs = s.contributions.map(c => `${c.label}:${c.total / 100}%`).join(' + ');
  console.log(`  ${s.name.padEnd(34)} ${String(s.total / 100 + '%').padStart(9)}  (${srcs})`);
}

console.log(`\n${ok} checks OK`);
