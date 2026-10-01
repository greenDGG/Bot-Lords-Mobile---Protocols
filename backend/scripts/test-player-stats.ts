import * as fs from 'fs';
import * as path from 'path';
import { parse3201 } from '../src/bot/parsers/research.parser';
import { computePlayerStats, PlayerStat } from '../src/bot/features/player-stats';

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

console.log(`\n${ok} checks OK`);
