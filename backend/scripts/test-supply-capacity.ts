import { computePlayerStats, getSupplyCapacity, SUPPLY_CAPACITY_STAT } from '../src/bot/features/player-stats';
import { EFFECT_DEFS } from '../src/bot/data/effect-db';
import { pickSupply, stripLegacyConfig } from '../src/models/bot-config';

let ok = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'OK  ' : 'FALLA'} ${msg}`);
  if (cond) ok++;
  else process.exitCode = 1;
};

const techLevels = new Array(500).fill(0);
techLevels[125 - 1] = 3; // Bolsas más Grandes I nv3 → 180000
techLevels[234 - 1] = 3; // Bolsas más Grandes II nv3 → 60000
techLevels[303 - 1] = 10; // Bolsas más grandes III nv10 → 1000000
const buildings = [{ id: 17, level: 30 }]; // Puesto Comercial nv30 → 3030000

console.log('== capacidad de suministro (stat real) ==');
check(SUPPLY_CAPACITY_STAT === 'Capacidad de suministro +', 'nombre del stat');
check(EFFECT_DEFS['272'].name === SUPPLY_CAPACITY_STAT, 'el efecto 272 se llama igual');

const stats = computePlayerStats({ research: { techLevels }, buildingState: { buildings } });
const stat = stats.find(s => s.name === SUPPLY_CAPACITY_STAT);
check(!!stat, 'existe la fila "Capacidad de suministro +"');
check(stat?.contributions.find(c => c.source === 'building')?.total === 3030000, 'construcciones = 3030000 (Puesto Comercial nv30)');
check(stat?.contributions.find(c => c.source === 'research')?.total === 1240000, 'investigación = 1240000 (Bolsas más grandes)');
check(stat?.count === 4, `4 aportes (1 construcción + 3 techs) — ${stat?.count}`);
check(stat?.contributions.length === 2, `2 fuentes — ${stat?.contributions.length}`);
check(getSupplyCapacity(stats) === 4270000, `capacidad 4270000 = 3030000 + 1240000 (${getSupplyCapacity(stats)})`);

console.log('\n== sin datos ==');
check(getSupplyCapacity([]) === 0, 'sin stats => 0');
check(getSupplyCapacity(undefined) === 0, 'sin playerStats => 0');
check(computePlayerStats({}).every(s => s.name !== SUPPLY_CAPACITY_STAT), 'sin research/buildings no hay stat');

console.log('\n== troceado por capacidad ==');
const cap = getSupplyCapacity(stats);
check(Math.ceil(10_000_000 / cap) === 3, '10M en 3 caravanas de 4.27M');
check(Math.min(cap, 1_500_000) === 1_500_000, 'el último trozo respeta el total exacto');

console.log('\n== config: maxAmount eliminado ==');
const legacy = pickSupply({ enable: true, targetPlayer: 'Foo', threshold: 5_000_000, maxAmount: 6_000_000, caravanLimit: 3 });
check(!('maxAmount' in legacy), 'pickSupply descarta maxAmount');
check(
  legacy.enable === true && legacy.targetPlayer === 'Foo' && legacy.threshold === 5_000_000 && legacy.caravanLimit === 3,
  'pickSupply conserva el resto de la config',
);
check(pickSupply(undefined).threshold === 7000000, 'pickSupply(null) => defaults');
check(!('maxAmount' in pickSupply(null)), 'pickSupply(null) sin maxAmount');

const cfg: any = { supply: { enable: true, maxAmount: 6_000_000 }, hunt: { enable: true } };
stripLegacyConfig(cfg);
check(!('maxAmount' in cfg.supply) && cfg.supply.enable === true, 'stripLegacyConfig borra maxAmount in-place');
check(cfg.hunt.enable === true, 'stripLegacyConfig no toca otras secciones');
const sinSupply: any = { hunt: {} };
stripLegacyConfig(sinSupply);
check(!('supply' in sinSupply), 'stripLegacyConfig tolera configs sin supply');

console.log(`\n${ok} checks OK`);
