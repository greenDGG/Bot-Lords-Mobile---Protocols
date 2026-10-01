import { RESISTENCIA_BASE, RESISTENCIA_EFFECT_ID, computeResistenciaBonus, computeResistenciaMax } from '../src/bot/resistencia';
import { computeResearchStats } from '../src/bot/research-stats';
import { computePlayerStats } from '../src/bot/features/player-stats';

let ok = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'OK  ' : 'FALLA'} ${msg}`);
  if (cond) ok++;
  else process.exitCode = 1;
};

const TECH153 = 153;
const lv = (level: number): number[] => {
  const arr = new Array(500).fill(0);
  arr[TECH153 - 1] = level;
  return arr;
};

console.log('== resistencia máxima ==');
check(RESISTENCIA_BASE === 120, 'base 120');
check(RESISTENCIA_EFFECT_ID === 347, 'efecto 347 (Máxima RES +)');
check(computeResistenciaMax() === 120, 'sin investigación => 120');
check(computeResistenciaBonus(undefined) === 0, 'sin techLevels => bonus 0');
check(computeResistenciaMax(lv(1)) === 123, 'tech 153 nv1 => 123 (120+3)');
check(computeResistenciaMax(lv(2)) === 126, 'tech 153 nv2 => 126 (120+6)');
check(computeResistenciaMax(lv(10)) === 180, 'tech 153 nv10 => 180 (120+60)');

const caps = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(l => computeResistenciaMax(lv(l)));
check(
  caps.every((v, i) => i === 0 || v >= caps[i - 1]),
  `los 10 niveles nunca bajan el tope (${caps.join(', ')})`,
);

console.log('\n== coincide con Player Stats ==');
const researchStats = computeResearchStats(lv(2));
const maxStat = researchStats.find(s => s.name === 'Máxima RES +');
check(!!maxStat, 'computeResearchStats tiene el ítem "Máxima RES +"');
check(maxStat?.total === 6, `bonus nv2 = 6 (total del stat: ${maxStat?.total})`);
check(
  maxStat?.total === computeResistenciaBonus(lv(2)),
  'bonus de resistencia === total mostrado en Player Stats',
);

const playerStats = computePlayerStats({ research: { techLevels: lv(2) } });
const findTech = (stats: typeof playerStats) =>
  stats.find(s => s.contributions.some(c => c.items.some(i => i.name === 'Límite de Resistencia')));
const item = findTech(playerStats);
check(!!item, 'Player Stats incluye el tech 153 "Límite de Resistencia"');
check(item?.total === 6, `contribución del tech 153 = 6 (${item?.total})`);
check(
  item?.contributions.every(c => c.source === 'research' && c.total === 6) ?? false,
  'aporta la fuente Investigación con 6',
);
const psNoResearch = computePlayerStats({});
check(!findTech(psNoResearch), 'sin investigación no aparece el bonus de resistencia');

console.log(`\n${ok} checks OK`);
