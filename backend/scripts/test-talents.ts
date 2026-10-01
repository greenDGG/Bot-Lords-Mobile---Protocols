import { parse3801 } from '../src/bot/parsers/talent.parser';
import {
  BRANCHES,
  TALENT_COUNT,
  TALENT_DB,
  TALENT_EFFECTS,
  getTalentBranch,
  getTalentName,
  getTalentValue,
} from '../src/bot/data/talent-db';
import { computeTalentStats } from '../src/bot/talent-stats';
import { computePlayerStats } from '../src/bot/features/player-stats';

// Cuerpos 3801 reales (102 B) capturados en logs, de 3 cuentas distintas.
const FIXTURES: { name: string; hex: string; unassigned: number }[] = [
  {
    name: 'captura 1 (sin puntos libres)',
    unassigned: 0,
    hex:
      '00000000000000000000000000000000000000000000000000030303000005030f000005051300000032323200000032000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
  },
  {
    name: 'captura 2 (otra cuenta, sin puntos libres)',
    unassigned: 0,
    hex:
      '00000000000000000000000000000000000000000000000000030303000f050f0f000e05050500140505050500323232000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
  },
  {
    name: 'captura 3 (con puntos sin asignar)',
    unassigned: 155,
    hex:
      '9b0002020000000a0a0000000000000000000000000000000003030300000203030f0305050500000005000000000000230000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
  },
];

// Sumas vistas en las 43 capturas (nivel del lord incluye puntos de logro/vip).
const KNOWN_TOTALS = [215, 222, 253, 261, 269, 278, 279];

let ok = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'OK  ' : 'FALLA'} ${msg}`);
  if (cond) ok++;
  else process.exitCode = 1;
};

console.log('== catálogo talents.json ==');
check(TALENT_COUNT === 47, `47 talentos (${TALENT_COUNT})`);
check(BRANCHES.length === 4, `4 ramas (${BRANCHES.length})`);

const branchIds = new Set<number>();
for (const b of BRANCHES) for (const t of b.talents) branchIds.add(t);
check(branchIds.size === TALENT_COUNT, `las ramas cubren los 47 talentos (${branchIds.size})`);
check(
  BRANCHES.every(b => b.talents.length === b.count && b.name.trim().length > 0),
  'cada rama con count y nombre',
);

let namesOk = 0;
let effectsOk = 0;
let monotonicOk = 0;
let maxLevelOk = 0;
let branchOk = 0;
for (const [idStr, def] of Object.entries(TALENT_DB)) {
  const id = Number(idStr);
  if (getTalentName(id).trim()) namesOk++;
  const fx = TALENT_EFFECTS[def.effectId];
  if (fx && fx.name.trim()) effectsOk++;
  const values = Object.keys(def.levels)
    .map(Number)
    .sort((a, b) => a - b);
  if (values.every((lv, i) => lv === i + 1 && (i === 0 || def.levels[lv] >= def.levels[values[i - 1]])))
    monotonicOk++;
  if (values.length === def.maxLevel) maxLevelOk++;
  const branch = BRANCHES.find(b => b.id === def.branch);
  if (branch && branch.talents.includes(id) && getTalentBranch(id)?.id === def.branch) branchOk++;
}
check(namesOk === TALENT_COUNT, `los 47 con nombre en español (${namesOk})`);
check(effectsOk === TALENT_COUNT, `los 47 con effectId con nombre (${effectsOk})`);
check(monotonicOk === TALENT_COUNT, `niveles 1..max y valores monotones (${monotonicOk})`);
check(maxLevelOk === TALENT_COUNT, `maxLevel = cantidad de niveles (${maxLevelOk})`);
check(branchOk === TALENT_COUNT, `branch coherente con talenttree (${branchOk})`);
check(
  getTalentValue(1, 0) === 0 && getTalentValue(999, 1) === 0,
  'getTalentValue devuelve 0 fuera de rango',
);

console.log('\n== parse3801 (capturas reales) ==');
const parsedAll: { name: string; data: NonNullable<ReturnType<typeof parse3801>> }[] = [];
for (const f of FIXTURES) {
  const body = Buffer.from(f.hex, 'hex');
  check(body.length === 102, `${f.name}: body de 102 B (${body.length})`);
  const data = parse3801(body);
  if (!data) {
    check(false, `${f.name}: parse3801 devolvió null`);
    continue;
  }
  parsedAll.push({ name: f.name, data });
  check(data.unassigned === f.unassigned, `${f.name}: sin asignar = ${data.unassigned}`);
  check(data.levels.length === TALENT_COUNT, `${f.name}: ${data.levels.length} niveles`);
  const inRange = data.levels.every(
    (lv, i) => lv >= 0 && lv <= (TALENT_DB[i + 1]?.maxLevel ?? -1),
  );
  check(inRange, `${f.name}: niveles dentro del máximo de cada talento`);
  const reservedZero = body.subarray(2 + TALENT_COUNT).every(b => b === 0);
  check(reservedZero, `${f.name}: bytes 49..101 en cero`);
  const sum = data.levels.reduce((a, b) => a + b, 0);
  console.log(`      ${data.levels.filter(l => l > 0).length} activos, suma=${sum}, libre=${data.unassigned}`);
  check(
    KNOWN_TOTALS.includes(sum + data.unassigned),
    `${f.name}: suma+libre = ${sum + data.unassigned} (esperado en ${KNOWN_TOTALS.join('/')})`,
  );
}
check(parse3801(Buffer.alloc(48)) === null, 'body corto => null');

console.log('\n== computeTalentStats ==');
const sample = parsedAll[0];
if (sample) {
  const stats = computeTalentStats(sample.data);
  const active = sample.data.levels.filter(l => l > 0).length;
  check(stats.length > 0, `agrupa por efecto — ${stats.length} stats`);
  check(
    stats.every(s => Math.abs(s.total - s.talents.reduce((a, t) => a + t.value, 0)) < 1e-9),
    'total === suma de los valores de sus talentos',
  );
  check(
    stats.reduce((a, s) => a + s.talents.length, 0) === active,
    `los ${active} talentos activos aparecen una sola vez`,
  );
  check(stats.every(s => s.talents.every(t => t.level > 0)), 'sin talentos en nivel 0');
  check(
    stats.every(s => s.talents.every(t => getTalentValue(t.id, t.level) === t.value)),
    'cada valor = levels[nivel]',
  );
  const names = stats.map(s => s.name);
  check(
    names.every((n, i) => i === 0 || names[i - 1].localeCompare(n, 'es') <= 0),
    'ordenado por nombre (es)',
  );
  check(stats.every(s => s.unit === '%' || s.unit === ''), 'unidades del catálogo de efectos');
  console.log('\n  top:');
  for (const s of [...stats].sort((a, b) => b.total - a.total).slice(0, 6)) {
    console.log(`    ${s.name.padEnd(30)} ${String(s.total / 100 + '%').padStart(9)}  (${s.count} talentos)`);
  }
}
check(computeTalentStats(undefined).length === 0, 'sin talentos => array vacío');
check(computeTalentStats({ levels: [] }).length === 0, 'sin niveles => array vacío');

console.log('\n== fuente talent en computePlayerStats ==');
if (sample) {
  const stats = computePlayerStats({ talents: sample.data });
  const talentContribs = stats.flatMap(s => s.contributions.filter(c => c.source === 'talent'));
  check(talentContribs.length > 0, `aparece la fuente "talent" — ${talentContribs.length} stats`);
  check(talentContribs.every(c => c.label === 'Talentos'), 'etiqueta "Talentos"');
  check(
    talentContribs.every(c => c.items.length === c.count && c.items.every(i => i.level! > 0)),
    'items = talentos activos',
  );
  check(
    Math.abs(
      talentContribs.reduce((a, c) => a + c.total, 0) -
        computeTalentStats(sample.data).reduce((a, s) => a + s.total, 0),
    ) < 1e-9,
    'total de la fuente === total de computeTalentStats',
  );
  check(
    stats.every(s => Math.abs(s.total - s.contributions.reduce((a, c) => a + c.total, 0)) < 1e-9),
    'total === suma de contributions',
  );
}

console.log(`\n${ok} checks OK`);
