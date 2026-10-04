import * as fs from 'fs';
import * as path from 'path';
import { parse3201 } from '../src/bot/parsers/research.parser';
import { computePlayerStats, PlayerStat, getBarracksCapacity, getSubsidyPct, getTrainSpeedPct } from '../src/bot/features/player-stats';

const src = fs.readFileSync(path.join(__dirname, 'test-parse-3201.ts'), 'utf-8');
const m = src.match(/const IDLE_HEX =\s*'([^']+)'/);
if (!m) {
  console.error('no se encontró IDLE_HEX en test-parse-3201.ts');
  process.exit(1);
}
const parsed = parse3201(Buffer.from(m[1], 'hex'));
if (!parsed) {
  console.error('parse3201 devolvió null');
  process.exit(1);
}

let ok = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'OK  ' : 'FALLA'} ${msg}`);
  if (cond) ok++;
  else process.exitCode = 1;
};

console.log('== computePlayerStats (muestra real de logs) ==');
const stats = computePlayerStats({ research: parsed });

check(Array.isArray(stats), 'devuelve un array');
check(stats.length > 0, `agrupa stats — ${stats.length}`);
check(stats.every(s => s.bonusPct != null || Math.abs(s.total - s.contributions.reduce((a, c) => a + c.total, 0)) < 1e-9), 'total === suma de contributions (salvo combinados)');
check(stats.every(s => s.bonusPct == null || s.total === Math.round(s.baseTotal! * (1 + s.bonusPct! / 10000))), 'combinado: total === base + bonus%');
check(stats.every(s => s.count === s.contributions.reduce((a, c) => a + c.count, 0)), 'count === suma de counts de contributions');
check(stats.every(s => s.contributions.length >= 1), 'cada stat tiene al menos una fuente');
check(stats.every(s => s.contributions.every(c => c.source && c.label && c.items.length === c.count)), 'contribuciones completas (source/label/items)');
check(stats.every(s => s.contributions.some(c => c.source === 'research')), 'la investigación aporta a cada stat');
check(stats.every(s => s.total !== 0), 'sin stats con total 0');
const keys = new Set(stats.map(s => s.key));
check(keys.size === stats.length, 'claves únicas');
const sorted = [...stats].sort((a, b) => a.name.localeCompare(b.name, 'es'));
check(stats.every((s, i) => s.name === sorted[i].name), 'ordenado por nombre (es)');
check(computePlayerStats({}).length === 0, 'sin investigación => array vacío');

const research = computePlayerStats({ research: parsed })[0]?.contributions[0];
console.log(`\nfuente: ${research?.label} (${research?.source}) — ${research?.count} items`);

const top: PlayerStat[] = [...stats].filter(s => s.unit === '%').sort((a, b) => b.total - a.total).slice(0, 8);
console.log('\ntop %:');
for (const s of top) console.log(`  ${s.name.padEnd(34)} ${String(s.total / 100 + '%').padStart(9)}  (${s.count} aportes)`);

console.log('\n== stats combinados (base + %) ==');
const techLevels = new Array(500).fill(0);
techLevels[108 - 1] = 8; // Expansión de cuarteles I nv8 → 7.5 %
techLevels[299 - 1] = 10; // Expansión de cuarteles II nv10 → 10 %
const barracks = [6, 6, 6, 6, 6].map(id => ({ id, level: 55 })); // 5 × 5300 = 26500
const merged = computePlayerStats({ research: { techLevels }, buildingState: { buildings: barracks } });
const capRows = merged.filter(s => s.name === 'Capacidad del cuartel +');
check(capRows.length === 1, `una sola fila "Capacidad del cuartel +" (${capRows.length})`);
const cap = capRows[0];
check(cap.unit === '', 'la fila combinada es la base (unidad entera)');
check(cap.baseTotal === 26500, `base 26500 = 5 cuarteles nv55 (${cap.baseTotal})`);
check(cap.bonusPct === 1750, `bonus 17.5% = 1750 centésimas (${cap.bonusPct})`);
check(cap.total === 31138, `total 31138 = 26500 + 17.5% (${cap.total})`);
check(cap.contributions.length === 2, `dos fuentes: ${cap.contributions.map(c => c.label).join(' + ')}`);
check(cap.count === 7, `7 aportes (5 cuarteles + 2 techs) — ${cap.count}`);
check(cap.contributions.some(c => c.source === 'building' && c.unit === ''), 'las construcciones aportan el base');
check(cap.contributions.some(c => c.source === 'research' && c.unit === '%'), 'la investigación aporta el %');
check(
  merged.filter(s => s.name === 'Capacidad del cuartel +' && s.unit === '%').length === 0,
  'no queda la fila de % suelta',
);

console.log('\n== pasivas de héroes ==');
const mkHero = (heroId: number, grade: number) => ({ heroId, level: 60, power: 0, rank: 8, grade, unknown: 0 });
// Sabio de Viento: Potenciador construcción value 1000 (1 % en Blanco)
// Guardián: Gestión suministro de comida value 11250 (11.25 % en Blanco)
// Estafador: Potenc. energía máx. value 150 (entero) + Regeneración 500 (0.5 %)
const goldHeroes = [mkHero(3, 5), mkHero(1, 5), mkHero(15, 5)];
const heroStats = computePlayerStats({ heroes: goldHeroes });

const constr = heroStats.find(s => s.name === 'Vel. construcción +');
check(!!constr && constr.contributions.length === 1, `una fila "Vel. construcción +" con una fuente (${constr?.contributions.length})`);
check(constr!.contributions[0].source === 'hero' && constr!.contributions[0].label === 'Héroes', 'fuente hero / etiqueta Héroes');
check(constr!.total === 2000 && constr!.unit === '%', `Oro x20 → 20 % (2000 centésimas) — ${constr!.total}`);
check(constr!.count === 1, `1 héroe con esa pasiva — ${constr!.count}`);
check(constr!.contributions[0].items[0].name.startsWith('Sabio de Viento · '), `item con nombre de héroe — ${constr!.contributions[0].items[0].name}`);

const food = heroStats.find(s => s.name === 'Producción de comida +');
check(food?.total === 22500, `comida 11250 → 225 % en Oro — ${food?.total}`);

const energy = heroStats.find(s => s.name === 'Energía +');
check(energy?.unit === '' && energy?.total === 3000, `energía máx. 150 → 3000 entera — ${energy?.total}`);

const regen = heroStats.find(s => s.name === 'Reclu.');
check(regen?.total === 1000, `regeneración 500 → 10 % en Oro — ${regen?.total}`);

check(
  heroStats.every(s => !/(infantería|caballería|artillería|ejército|muralla|refuerzo)/i.test(s.name)),
  'las pasivas de batalla (tropas/muralla) no entran en stats',
);
check(
  heroStats.every(s => s.contributions.every(c => c.items.every(i => !i.level))),
  'sin level en los items (el grado va en el nombre)',
);

const whiteStats = computePlayerStats({ heroes: [mkHero(3, 1)] });
check(whiteStats.find(s => s.name === 'Vel. construcción +')?.total === 100, 'grado 1 (Blanco) → 1 % (100 centésimas)');
const blueStats = computePlayerStats({ heroes: [mkHero(3, 3)] });
check(blueStats.find(s => s.name === 'Vel. construcción +')?.total === 400, 'grado 3 (Azul) → 4 % (400 centésimas)');

check(computePlayerStats({ heroes: [] }).length === 0, 'sin héroes => 0 stats');
check(computePlayerStats({ heroes: [mkHero(9999, 5)] }).length === 0, 'héroe desconocido => 0 stats');
check(computePlayerStats({ heroes: [mkHero(3, 5), mkHero(3, 5)] }).length === 1, 'héroe duplicado se cuenta una vez');

// Mismo patrón con el Hospital: 120400 (3 hospitales) + 7.7% (dos techs).
const enfLevels = new Array(500).fill(0);
enfLevels[300 - 1] = 10; // Enfermería más grande III nv10 → 700 (7%)
enfLevels[141 - 1] = 5; // Enfermería más Grande I nv5 → 70 (0.7%)
const infirmary = computePlayerStats({
  research: { techLevels: enfLevels },
  buildingState: { buildings: [{ id: 7, level: 30 }, { id: 7, level: 25 }, { id: 7, level: 25 }] },
});
const enfRows = infirmary.filter(s => s.name === 'Capacidad de enfermería +');
check(enfRows.length === 1, `una sola fila "Capacidad de enfermería +" (${enfRows.length})`);
const enf = enfRows[0];
check(enf.baseTotal === 120400, `base 120400 = 3 hospitales (${enf.baseTotal})`);
check(enf.bonusPct === 770, `bonus 7.7% = 770 centésimas (${enf.bonusPct})`);
check(enf.total === 129671, `total 129671 = 120400 + 7.7% (${enf.total})`);
check(enf.count === 5 && enf.contributions.length === 2, `5 aportes · 2 fuentes (${enf.count}/${enf.contributions.length})`);

// Vel. construcción: investigación + talentos + traje equipado (3 fuentes).
const constLevels = new Array(500).fill(0);
constLevels[6 - 1] = 10; // Vel. construcción nv10 → 7000 (70%)
const talentLevels = new Array(47).fill(0);
talentLevels[6 - 1] = 10; // Vel. construcción I nv10 → 4000 (40%)
talentLevels[14 - 1] = 20; // Vel. construcción II nv20 → 6500 (65%)
const equipped = [{ id: 4464, grade: 6, index: 0 }] as any[]; // Pulsera de centinela G6 → 3500 (35%)
const withCostumes = computePlayerStats({
  research: { techLevels: constLevels },
  talents: { levels: talentLevels },
  equippedCostumes: equipped,
});
const vsRows = withCostumes.filter(s => s.name === 'Vel. construcción +');
check(vsRows.length === 1, `una sola fila "Vel. construcción +" (${vsRows.length})`);
const vs = vsRows[0];
check(vs.contributions.some(c => c.source === 'research' && c.total === 7000), 'investigación aporta 70%');
check(vs.contributions.some(c => c.source === 'talent' && c.total === 10500), 'talentos aportan 105%');
check(vs.contributions.some(c => c.source === 'costume' && c.total === 3500), 'trajes equipados aportan 35%');
check(vs.contributions.length === 3, `3 fuentes — ${vs.contributions.map(c => c.label).join(' + ')}`);
check(vs.total === 21000, `total 210% = 70 + 105 + 35 (${vs.total})`);
check(vs.count === 4, `4 aportes (tech + 2 talentos + traje) — ${vs.count}`);

console.log('\n== stats de entrenamiento (subsidios / velocidad / capacidad) ==');
// 16 techs de subsidio (95-114) por (tipo, tier): 0=inf 1=cab 2=art 3=asedio, tiers 0-3.
const SUBSIDY_TECH: number[][] = [
  [95, 99, 104, 111], // Infantería: Grunt, Gladiator, Royal Guard, Heroic Fighter
  [97, 101, 106, 113], // Caballería: Cataphract, Reptilian Rider, Royal Cavalry, Ancient Drake
  [96, 100, 105, 112], // Artillería: Archer, Sharpshooter, Stealth Sniper, Heroic Cannoneer
  [98, 102, 107, 114], // Asedio: Ballista, Catapult, Fire Trebuchet, Destroyer
];
const subsidyLevels = new Array(500).fill(0);
for (const row of SUBSIDY_TECH) for (const id of row) subsidyLevels[id - 1] = 10;
const subsidyStats = computePlayerStats({ research: { techLevels: subsidyLevels } });
check(subsidyStats.filter(s => s.effectId !== undefined).length === 16, `16 stats de subsidio con effectId (${subsidyStats.filter(s => s.effectId !== undefined).length})`);
check(getSubsidyPct(subsidyStats, 0, 0) === 40, 'inf T1 (efecto 280 Grunt, nv10) = 40%');
check(getSubsidyPct(subsidyStats, 0, 3) === 30, 'inf T4 (efecto 292 Heroic Fighter) = 30%');
check(getSubsidyPct(subsidyStats, 1, 0) === 40, 'cab T1 (efecto 282 Cataphract) = 40%');
check(getSubsidyPct(subsidyStats, 2, 2) === 30, 'art T3 (efecto 289 Stealth Sniper) = 30%');
check(getSubsidyPct(subsidyStats, 3, 1) === 40, 'asedio T2 (efecto 287 Catapult) = 40%');
check(getSubsidyPct(subsidyStats, 4, 0) === 0 && getSubsidyPct(subsidyStats, 0, 4) === 0, 'tipo/tier fuera de rango → 0');

const gruntLevels = new Array(500).fill(0);
gruntLevels[95 - 1] = 10; // sólo Grunt: no toca a las otras 15 unidades
const gruntStats = computePlayerStats({ research: { techLevels: gruntLevels } });
check(getSubsidyPct(gruntStats, 0, 0) === 40 && getSubsidyPct(gruntStats, 1, 0) === 0, 'sólo Grunt nv10 → 40% en (0,0), resto 0');

// Vel. entrenamiento I nv1 (2000 = 20%) + II nv6 (600 = 6%) → 26%
const speedLevels = new Array(500).fill(0);
speedLevels[42 - 1] = 1;
speedLevels[109 - 1] = 6;
const speedStats = computePlayerStats({ research: { techLevels: speedLevels } });
check(getTrainSpeedPct(speedStats) === 26, `velocidad de entrenamiento 20% + 6% = 26% (${getTrainSpeedPct(speedStats)})`);

check(getTrainSpeedPct(undefined) === 0 && getBarracksCapacity(undefined) === 0 && getSubsidyPct(undefined, 0, 0) === 0, 'sin stats → 0 en los tres helpers');
check(getBarracksCapacity(merged) === 31138, `capacidad de cuartel combinada → ${getBarracksCapacity(merged)}`);

console.log(`\n${ok} checks OK`);
