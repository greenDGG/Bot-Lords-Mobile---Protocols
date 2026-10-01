import {
  ENERGY_BASE_PER_SEC,
  ENERGY_REGEN_EFFECT_ID,
  ENERGY_SAVER_EFFECT_ID,
  HUNT_ENERGY_BASE,
  computeEnergyRegenBonusPct,
  computeEnergyRegen,
  computeEnergySaverPct,
  computeHuntEnergyCost,
} from '../src/bot/energy';
import { computeResearchStats } from '../src/bot/research-stats';
import { computePlayerStats } from '../src/bot/features/player-stats';

let ok = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'OK  ' : 'FALLA'} ${msg}`);
  if (cond) ok++;
  else process.exitCode = 1;
};

const lv = (techId: number, level: number): number[] => {
  const arr = new Array(500).fill(0);
  arr[techId - 1] = level;
  return arr;
};

const bothLevels = (l74: number, l75: number): number[] => {
  const arr = new Array(500).fill(0);
  arr[73] = l74;
  arr[74] = l75;
  return arr;
};

console.log('== recuperación de energía ==');
check(ENERGY_BASE_PER_SEC === 0.5, 'base 0.5/s (1 punto cada 2 s)');
check(ENERGY_REGEN_EFFECT_ID === 317, 'efecto 317 (Recuper. energía I/II)');
check(computeEnergyRegenBonusPct(undefined) === 0, 'sin techLevels => bonus 0');

const base = computeEnergyRegen();
check(base.basePerHour === 1800, 'base 1800/h');
check(base.perHour === 1800, 'sin investigación => 1800/h');
check(base.bonusPct === 0, 'sin investigación => bonus 0');

// Cuenta real del usuario: tech 74 "Recuper. energía I" nivel 8 (1640 = 16.4%)
const real = computeEnergyRegen(lv(74, 8));
check(real.bonusPct === 1640, `tech 74 nv8 => bonus 1640 (${real.bonusPct})`);
check(real.perHour === 2095, `tech 74 nv8 => 2095/h (${real.perHour}) — medido: 2095/h`);
check(real.perSec === 0.582, `tech 74 nv8 => 0.582/s (${real.perSec}) — medido: 0.5821/s`);

// 1800 × (1 + 1640/10000) = 2095.2 → 2095
check(
  real.perHour === Math.round(1800 * (1 + real.bonusPct / 10000)),
  'fórmula: perHour = round(1800 × (1 + bonusPct/10000))',
);

check(computeEnergyRegen(lv(74, 10)).bonusPct === 2350, 'tech 74 nv10 => 2350');
check(computeEnergyRegen(lv(75, 10)).bonusPct === 2800, 'tech 75 nv10 => 2800');
check(computeEnergyRegen(lv(75, 1)).bonusPct === 100, 'tech 75 nv1 => 100');

const combo = computeEnergyRegen(bothLevels(8, 10));
check(combo.bonusPct === 1640 + 2800, `ambos techs suman (1640 + 2800 = ${combo.bonusPct})`);
check(combo.perHour === 2599, `ambos techs => 2599/h (${combo.perHour})`);

const caps = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(l => computeEnergyRegen(lv(74, l)).perHour);
check(
  caps.every((v, i) => i === 0 || v >= caps[i - 1]),
  `los 10 niveles nunca bajan la tasa (${caps.join(', ')})`,
);

console.log('\n== coincide con Player Stats ==');
const researchStats = computeResearchStats(lv(74, 8));
const recupStat = researchStats.find(s => s.techs.some(t => t.id === 74));
check(!!recupStat, 'computeResearchStats incluye la recuperación de energía');
check(
  recupStat?.total === computeEnergyRegenBonusPct(lv(74, 8)),
  `bonus de energía === total mostrado en Player Stats (${recupStat?.total})`,
);

const playerStats = computePlayerStats({ research: { techLevels: lv(74, 8) } });
const item = playerStats.find(s => s.contributions.some(c => c.items.some(i => i.id === 74)));
check(!!item, 'Player Stats incluye el tech 74 "Recuper. energía I"');
check(
  item?.contributions.some(c => c.source === 'research' && c.total === 1640) ?? false,
  'aporta la fuente Investigación con 1640',
);

console.log('\n== costo de caza por golpe ==');
check(ENERGY_SAVER_EFFECT_ID === 318, 'efecto 318 (Ahorro de energía I/II)');
check(
  HUNT_ENERGY_BASE[1] === 3000 && HUNT_ENERGY_BASE[2] === 5000 && HUNT_ENERGY_BASE[3] === 8000 &&
  HUNT_ENERGY_BASE[4] === 14000 && HUNT_ENERGY_BASE[5] === 18000,
  'base 3000/5000/8000/14000/18000 (wiki Lords Mobile)',
);
check(computeEnergySaverPct(undefined) === 0, 'sin techLevels => ahorro 0');
check(computeHuntEnergyCost(1) === 3000, 'sin ahorro => base completa (nv1 3000)');
check(computeHuntEnergyCost(99, lv(81, 10)) === 0, 'nivel fuera de la tabla => 0 (no cazar)');

// Cuenta real del usuario: 31.95% de ahorro = tech 81 nv9 (1305) + 82 nv9 (1890)
const saverReal = (() => {
  const arr = new Array(500).fill(0);
  arr[80] = 9;
  arr[81] = 9;
  return arr;
})();
check(computeEnergySaverPct(saverReal) === 3195, `techs 81 nv9 + 82 nv9 => 3195 (31.95%) (${computeEnergySaverPct(saverReal)})`);
check(computeHuntEnergyCost(1, saverReal) === 2042, `nv1 con 31.95% => 2042 (medido: 2042) (${computeHuntEnergyCost(1, saverReal)})`);
check(computeHuntEnergyCost(2, saverReal) === 3403, `nv2 con 31.95% => 3403 (medido: 3403) (${computeHuntEnergyCost(2, saverReal)})`);
check(computeHuntEnergyCost(3, saverReal) === 5444, `nv3 con 31.95% => 5444 (medido: 5444) (${computeHuntEnergyCost(3, saverReal)})`);
check(computeHuntEnergyCost(4, saverReal) === 9527, `nv4 con 31.95% => 9527 (medido: 9527) (${computeHuntEnergyCost(4, saverReal)})`);
check(computeHuntEnergyCost(5, saverReal) === 12249, `nv5 con 31.95% => 12249 (base 18000 × 0.6805) (${computeHuntEnergyCost(5, saverReal)})`);

const saverStat = computeResearchStats(saverReal).find(s => s.techs.some(t => t.id === 81));
check(!!saverStat, 'computeResearchStats incluye el ahorro de energía');
check(
  saverStat?.total === computeEnergySaverPct(saverReal),
  `ahorro === total mostrado en Player Stats (${saverStat?.total})`,
);

console.log(`\n${ok} checks OK`);
