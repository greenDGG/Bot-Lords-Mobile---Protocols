/**
 * Tests de artefactos: parser 9771, artifacts.json (gen-artifacts.py) y stats.
 *
 * Uso: npx ts-node scripts/test-artifacts.ts
 *
 * Fixture: body RECV real del proto 9771 (cuenta 858715903, count=138;
 * incluye estrellas 0..6 con 7051 bendecido y las 3 piezas de los 3 sets).
 */
import { parse9771 } from '../src/bot/parsers/artifacts.parser';
import {
  ARTIFACT_DEFS,
  ARTIFACT_SETS,
  GRADE_NAMES,
  STAR_MULTIPLIERS,
  artifactEffectsAt,
  artifactName,
  artifactSetName,
  applyStarMultiplier,
  buildArtifactViews,
  buildSetViews,
  gradeName,
  starName,
} from '../src/bot/data/artifacts-db';
import { computeArtifactStats } from '../src/bot/artifact-stats';
import { computePlayerStats } from '../src/bot/features/player-stats';
import { computeResearchStats } from '../src/bot/research-stats';

const HEX_9771 = '8a00591b04025a1b06035b1b08045c1b04025d1b04025e1b04025f1b0402601b0603611b0502621b0402631b0403641b0402651b0402661b0603671b0503681b0603691b04026a1b04026b1b04036c1b04036d1b04036e1b08036f1b0503701b0403711b0402721b0402731b0403741b0403751b0502761b0402771b0403781b0403791b05037a1b03037b1b04037c1b08037d1b03037e1b03037f1b0303801b0503811b0303821b0603831b0302841b0403851b0403861b0303871b0603881b0303891b06038a1b04028b1b08068c1b04058d1b05038e1b03048f1b0603901b0402911b0403921b0403931b0703941b0503951b0503961b0303971b0603981b0503991b04039a1b07039b1b05039c1b06039d1b04039e1b09049f1b0403a01b0504a11b0505a21b0503a31b0503a41b0303a51b0603a61b0404a71b0603a81b0402a91b0403aa1b0303ab1b0403ac1b0903ad1b0503ae1b0403af1b0403b01b0403b11b0903b21b0303b31b0403b41b0403b51b0403b61b0503b71b0403b81b0302b91b0403ba1b0403bb1b0403bc1b0504bd1b0603be1b0402bf1b0403c01b0403c11b0503c21b0302c31b0302c41b0402c61b0302c71b0302c81b0403c91b0302ca1b0302cd1b0302ce1b0703d11b0503d21b0502d31b0602d41b0602d51b0703da1b0403db1b0302dc1b0301dd1b0503e01b0502e11b0602e21b0300e41b0503e81b0602ec1b0302ed1b0503ee1b0401f91b0502fb1b0400fd1b0402101c04023b1c0903451c0402';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) { pass++; console.log(`PASS ${label}`); }
  else { fail++; console.log(`FAIL ${label}${detail ? ' — ' + detail : ''}`); }
}

function hex(s: string): Buffer { return Buffer.from(s, 'hex'); }

// --- 9771: invariantes de la captura real ---
const list = parse9771(hex(HEX_9771));
check('9771 count=138', !!list && list.length === 138, list ? 'got ' + list.length : 'null');
if (list) {
  const first3 = list.slice(0, 3).map(a => [a.artifactId, a.level, a.star]);
  check('9771 primeros registros 7001 nv4★2, 7002 nv6★3, 7003 nv8★4',
    JSON.stringify(first3) === JSON.stringify([[7001, 4, 2], [7002, 6, 3], [7003, 8, 4]]),
    JSON.stringify(first3));
  check('9771 niveles 1..12', list.every(a => a.level >= 1 && a.level <= 12));
  check('9771 estrellas 0..6', list.every(a => a.star >= 0 && a.star <= 6));
  const b = list.find(a => a.artifactId === 7051);
  check('9771 incluye Bendecido (7051 nv8 ★6)', !!b && b.level === 8 && b.star === 6, JSON.stringify(b));
  check('9771 ids únicos en 7001..7250',
    new Set(list.map(a => a.artifactId)).size === list.length
    && list.every(a => a.artifactId >= 7001 && a.artifactId <= 7250));
}

// --- 9771: casos borde ---
check('9771 null con body de 1 byte', parse9771(Buffer.alloc(1)) === null);
check('9771 null con count inflado', parse9771(Buffer.from('8a00', 'hex')) === null);
check('9771 null con byte de más', parse9771(Buffer.concat([hex(HEX_9771), Buffer.from([0])])) === null);
check('9771 null con byte de menos', parse9771(hex(HEX_9771).subarray(0, 553)) === null);
check('9771 null con nivel 13', (() => { const x = hex(HEX_9771); x[4] = 13; return parse9771(x) === null; })());
check('9771 null con estrella 7', (() => { const x = hex(HEX_9771); x[5] = 7; return parse9771(x) === null; })());
check('9771 null con count 301', (() => {
  const x = Buffer.alloc(2 + 301 * 4);
  x.writeUInt16LE(301, 0);
  return parse9771(x) === null;
})());
check('9771 vacío → []', (() => { const r = parse9771(Buffer.from('0000', 'hex')); return Array.isArray(r) && r.length === 0; })());

// --- artifacts.json: cobertura y grados ---
const allDefs = Object.values(ARTIFACT_DEFS);
check('244 artefactos', allDefs.length === 244, 'got ' + allDefs.length);
check('todos con exactamente 12 niveles (1..12)',
  allDefs.every(d => d.levels.length === 12 && d.levels.every((l, i) => l.level === i + 1)),
  JSON.stringify(allDefs.filter(d => d.levels.length !== 12).map(d => d.id).slice(0, 5)));
const gradeCounts: Record<number, number> = {};
for (const d of allDefs) gradeCounts[d.grade] = (gradeCounts[d.grade] || 0) + 1;
check('grados 39 Extraordinarios / 105 Épicos / 100 Legendarios',
  gradeCounts[3] === 39 && gradeCounts[4] === 105 && gradeCounts[5] === 100, JSON.stringify(gradeCounts));
check('starMultipliers = 10000..15000 + 20000 (Bendecido)',
  JSON.stringify(STAR_MULTIPLIERS) === JSON.stringify([10000, 11000, 12000, 13000, 14000, 15000, 20000]),
  JSON.stringify(STAR_MULTIPLIERS));
check('etiquetas de grado ES', GRADE_NAMES[3] === 'Extraordinario' && GRADE_NAMES[4] === 'Épico' && GRADE_NAMES[5] === 'Legendario',
  JSON.stringify(GRADE_NAMES));

// --- nombres concretos ---
const a7003 = ARTIFACT_DEFS[7003]!;
check('7003 = Cosmosfera grado 4', a7003.name === 'Cosmosfera' && a7003.grade === 4 && gradeName(4) === 'Épico', JSON.stringify({ n: a7003.name, g: a7003.grade }));
check('7002 = Brújula de Atenea grado 5', ARTIFACT_DEFS[7002]!.name === 'Brújula de Atenea' && ARTIFACT_DEFS[7002]!.grade === 5);
check('7006 = Nebulita', ARTIFACT_DEFS[7006]!.name === 'Nebulita');
check('artifactName 9999 → relleno', artifactName(9999) === 'Artefacto #9999');
check('starName 0/3/6', starName(0) === 'Sin estrellas' && starName(3) === '★ 3' && starName(6) === 'Bendecido');

// --- valores por nivel (totales acumulados, no deltas) ---
const raw = (id: number, level: number) =>
  ARTIFACT_DEFS[id]!.levels[level - 1]!.effects.map(e => [e.id, e.value]);
check('7003 nv12 = (249,800) + (220,800)',
  JSON.stringify(raw(7003, 12)) === JSON.stringify([[249, 800], [220, 800]]), JSON.stringify(raw(7003, 12)));
check('7003 nv1 = (249,160) (el total crece con el nivel)',
  JSON.stringify(raw(7003, 1)) === JSON.stringify([[249, 160], [220, 160]]));
check('7001 efect206: nv1 80 → nv12 400',
  raw(7001, 1)[0]![1] === 80 && raw(7001, 12)[0]![1] === 400, JSON.stringify(raw(7001, 12)));
check('7001 coste nv11 = 55000 y nv12 = 0',
  ARTIFACT_DEFS[7001]!.levels[10]!.cost === 55000 && ARTIFACT_DEFS[7001]!.levels[11]!.cost === 0);
check('valores monótonos no decrecientes por efecto (todos los artefactos)',
  allDefs.every(d => {
    const series = new Map<number, number[]>();
    for (const lvl of d.levels) {
      for (const e of lvl.effects) {
        const arr = series.get(e.id) || [];
        arr.push(e.value);
        series.set(e.id, arr);
      }
    }
    for (const arr of series.values()) {
      if (arr.length !== 12) return false;
      for (let i = 1; i < arr.length; i++) if (arr[i]! < arr[i - 1]!) return false;
    }
    return true;
  }));
check('todo efecto resuelve nombre+unidad (12 niveles x 244)',
  allDefs.every(d => d.levels.every(l => artifactEffectsAt(d, l.level, 0).length === l.effects.length
    && artifactEffectsAt(d, l.level, 0).every(e => !!e.name && e.unit === '%'))));

// --- estrellas ---
check('applyStarMultiplier 512 ★4 = 717 (×1.4)', applyStarMultiplier(512, 4) === 717);
check('applyStarMultiplier 400 ★6 = 800 (Bendecido ×2)', applyStarMultiplier(400, 6) === 800);
check('applyStarMultiplier 80 ★0 = 80 (×1.0)', applyStarMultiplier(80, 0) === 80);
check('applyStarMultiplier 100 ★5 = 150 (×1.5)', applyStarMultiplier(100, 5) === 150);
check('applyStarMultiplier estrella fuera de rango se recorta a ★6', applyStarMultiplier(100, 99) === 200);

// --- sets (RelicsCombination) ---
check('3 sets', ARTIFACT_SETS.length === 3, 'got ' + ARTIFACT_SETS.length);
const set2 = ARTIFACT_SETS.find(s => s.id === 2)!;
check('set2 = Atemporal, piezas [7022,7036,7070], tiers 200/300/500',
  artifactSetName(set2) === 'Set Atemporal'
  && JSON.stringify(set2.artifacts) === JSON.stringify([7022, 7036, 7070])
  && JSON.stringify(set2.tiers.map(t => [t.condition, t.effects[0]!.id, t.effects[0]!.value])) ===
     JSON.stringify([['collect', 249, 200], ['star3', 249, 300], ['blessed', 249, 500]]),
  JSON.stringify(set2.tiers));
const set1 = ARTIFACT_SETS.find(s => s.id === 1)!;
check('set1 sin nombre → "Set 1", 2 tiers (251: 100 y 200)',
  artifactSetName(set1) === 'Set 1'
  && JSON.stringify(set1.tiers.map(t => [t.condition, t.effects[0]!.id, t.effects[0]!.value])) ===
     JSON.stringify([['collect', 251, 100], ['star3', 251, 200]]),
  JSON.stringify(set1));
const set3 = ARTIFACT_SETS.find(s => s.id === 3)!;
check('set3 Viaje del rey: piezas [7009,7084,7089] y tiers (217,218,216)×500',
  artifactSetName(set3) === 'Set Viaje del rey'
  && JSON.stringify(set3.artifacts) === JSON.stringify([7009, 7084, 7089])
  && JSON.stringify(set3.tiers.map(t => [t.condition, t.effects[0]!.id, t.effects[0]!.value])) ===
     JSON.stringify([['collect', 217, 500], ['star3', 218, 500], ['blessed', 216, 500]]),
  JSON.stringify(set3.tiers));

// --- vistas ---
check('buildArtifactViews(undefined) → []', buildArtifactViews(undefined).length === 0);
const v = buildArtifactViews({ list: [{ artifactId: 7003, level: 8, star: 4 }] })[0]!;
check('view 7003 nv8★4: nombre/grado/nivel/estrella',
  v.name === 'Cosmosfera' && v.gradeName === 'Épico' && v.level === 8 && v.maxLevel === 12
  && v.star === 4 && v.starName === '★ 4', JSON.stringify(v));
check('view efectos ×1.4: 249 y 220 = 717',
  v.effects.length === 2 && v.effects.every(e => e.value === 717)
  && v.effects[0]!.name === 'Vel. investigación +' && v.effects[0]!.unit === '%',
  JSON.stringify(v.effects));
check('view nextLevel nv9 = 818', v.nextLevel?.level === 9 && v.nextLevel.effects.every(e => e.value === 818),
  JSON.stringify(v.nextLevel));
const v12 = buildArtifactViews({ list: [{ artifactId: 7003, level: 12, star: 0 }] })[0]!;
check('view nv12: sin nextLevel y efecto 800', v12.nextLevel === null && v12.effects[0]!.value === 800);
const vSort = buildArtifactViews({ list: [{ artifactId: 7001, level: 1, star: 0 }, { artifactId: 7002, level: 1, star: 0 }] });
check('view orden: grado 5 antes que grado 3', vSort[0]!.artifactId === 7002 && vSort[1]!.artifactId === 7001,
  JSON.stringify(vSort.map(x => x.artifactId)));

const emptySets = buildSetViews(undefined);
check('setViews sin datos: 3 sets, ningún tier activo',
  emptySets.length === 3 && emptySets.every(s => !s.tiers.some(t => t.met)) && emptySets.every(s => s.pieces.every(p => !p.owned)));
const s2_3 = buildSetViews({ list: [{ artifactId: 7022, level: 1, star: 3 }, { artifactId: 7036, level: 1, star: 3 }, { artifactId: 7070, level: 1, star: 4 }] })[1]!;
check('setViews set2 con ★3+: tiers [collect ✓, star3 ✓, blessed ✗]',
  JSON.stringify(s2_3.tiers.map(t => t.met)) === JSON.stringify([true, true, false]),
  JSON.stringify(s2_3.tiers.map(t => t.met)));
const s2_6 = buildSetViews({ list: [{ artifactId: 7022, level: 1, star: 6 }, { artifactId: 7036, level: 1, star: 6 }, { artifactId: 7070, level: 1, star: 6 }] })[1]!;
check('setViews set2 bendecido: los 3 tiers activos', s2_6.tiers.every(t => t.met));
const s2_1 = buildSetViews({ list: [{ artifactId: 7022, level: 1, star: 6 }] })[1]!;
check('setViews set2 con 1 pieza: ningún tier activo',
  !s2_1.tiers.some(t => t.met) && s2_1.pieces.filter(p => p.owned).length === 1);

// --- stats ---
check('computeArtifactStats(undefined) → []', computeArtifactStats(undefined).length === 0);
check('computeArtifactStats(lista vacía) → []', computeArtifactStats({ list: [] }).length === 0);
const st7003 = computeArtifactStats({ list: [{ artifactId: 7003, level: 8, star: 4 }] });
const inv = st7003.find(s => s.key === 'Vel. investigación +|%');
check('stat 7003: "Vel. investigación +|%" total 717 count 1',
  !!inv && inv.total === 717 && inv.count === 1 && inv.unit === '%', JSON.stringify(inv));
check('item del stat = Cosmosfera nv8 ★4',
  inv?.artifacts[0]?.name === 'Cosmosfera' && inv.artifacts[0].level === 8 && inv.artifacts[0].star === 4,
  JSON.stringify(inv?.artifacts));
check('keys con formato name|unit (igual que las demás fuentes)', st7003.every(s => s.key === `${s.name}|${s.unit}`));

// Sets: piezas al nivel 0 no aportan (solo existen en la cuenta), sí el bonus
const setOnly = computeArtifactStats({ list: [{ artifactId: 7022, level: 0, star: 0 }, { artifactId: 7036, level: 0, star: 0 }, { artifactId: 7070, level: 0, star: 0 }] });
check('set collect: +200 (solo el tier, piezas nv0 no aportan)',
  setOnly.length === 1 && setOnly[0]!.total === 200 && setOnly[0]!.count === 1
  && setOnly[0]!.artifacts[0]!.name === 'Set Atemporal', JSON.stringify(setOnly));
const setStar3 = computeArtifactStats({ list: [{ artifactId: 7022, level: 0, star: 3 }, { artifactId: 7036, level: 0, star: 3 }, { artifactId: 7070, level: 0, star: 4 }] });
check('set 3★: 200+300 = 500 (2 aportes)', setStar3[0]!.total === 500 && setStar3[0]!.count === 2,
  JSON.stringify(setStar3[0]));
const setBlessed = computeArtifactStats({ list: [{ artifactId: 7022, level: 0, star: 6 }, { artifactId: 7036, level: 0, star: 6 }, { artifactId: 7070, level: 0, star: 6 }] });
check('set bendecido: 200+300+500 = 1000 = 10% (wiki Timeless)', setBlessed[0]!.total === 1000 && setBlessed[0]!.count === 3,
  JSON.stringify(setBlessed[0]));

// --- stats del jugador: los artefactos entran en playerStats ---
const merged = computePlayerStats({ artifacts: { list: [{ artifactId: 7003, level: 8, star: 4 }] } });
const mInv = merged.find(s => s.name === 'Vel. investigación +' && s.unit === '%');
check('playerStats: total 717 con fuente "artifact" / label "Artefactos"',
  !!mInv && mInv.total === 717
  && mInv.contributions[0]?.source === 'artifact' && mInv.contributions[0]?.label === 'Artefactos',
  JSON.stringify(mInv?.contributions.map(c => [c.source, c.label])));
check('item del aporte: Cosmosfera nv8', mInv?.contributions[0]?.items[0]?.name === 'Cosmosfera'
  && mInv.contributions[0].items[0]?.level === 8, JSON.stringify(mInv?.contributions[0]?.items));

// Fusión con investigación: tech6 (efect248, nv1 = 100) + artefacto 7052 (nv1 = 100)
const rKeys = computeResearchStats([0, 0, 0, 0, 0, 1]).map(r => r.key);
check('research comparte key con artefactos (Vel. construcción +|%)',
  rKeys.includes('Vel. construcción +|%'), JSON.stringify(rKeys));
const merged2 = computePlayerStats({
  research: { techLevels: [0, 0, 0, 0, 0, 1] },
  artifacts: { list: [{ artifactId: 7052, level: 1, star: 0 }] },
});
const mVel = merged2.find(s => s.name === 'Vel. construcción +' && s.unit === '%');
check('playerStats suma research+artefacto: 100+100=200',
  !!mVel && mVel.total === 200, JSON.stringify(mVel));
check('contribuciones: research + Artefactos',
  !!mVel && mVel.contributions.map(c => c.source).join(',') === 'research,artifact'
  && mVel.contributions[1]?.label === 'Artefactos', JSON.stringify(mVel?.contributions.map(c => c.label)));

// --- fixture real completo ---
if (list) {
  const fs = computeArtifactStats({ list });
  check('fixture: stats no vacíos', fs.length > 20, 'got ' + fs.length);
  check('fixture: keys name|unit', fs.every(s => s.key === `${s.name}|${s.unit}`));
  const fInv = fs.find(s => s.key === 'Vel. investigación +|%');
  check('fixture: 7003 aporta 717 (nv8 ★4 = ×1.4)',
    !!fInv && fInv.artifacts.some(a => a.artifactId === 7003 && a.value === 717 && a.level === 8 && a.star === 4),
    JSON.stringify(fInv?.artifacts.filter(a => a.artifactId === 7003)));
  check('fixture: Set Atemporal aporta 200+300 (piezas ★3, sin bendecir)',
    !!fInv && JSON.stringify(fInv.artifacts.filter(a => a.name === 'Set Atemporal').map(a => a.value)) === JSON.stringify([200, 300]),
    JSON.stringify(fInv?.artifacts.filter(a => a.name === 'Set Atemporal')));
  const fTrain = fs.find(s => s.key === 'Vel. entrenamiento +|%');
  check('fixture: Set 1 aporta 100+200',
    !!fTrain && JSON.stringify(fTrain.artifacts.filter(a => a.name === 'Set 1').map(a => a.value)) === JSON.stringify([100, 200]),
    JSON.stringify(fTrain?.artifacts.filter(a => a.name === 'Set 1')));
  const fSet3 = fs.filter(s => s.artifacts.some(a => a.name === 'Set Viaje del rey'));
  check('fixture: Set Viaje del rey solo "collect" (★ mínima 2 → +500)',
    fSet3.length === 1 && fSet3[0]!.artifacts.filter(a => a.name === 'Set Viaje del rey').length === 1
    && fSet3[0]!.artifacts.find(a => a.name === 'Set Viaje del rey')!.value === 500,
    JSON.stringify(fSet3.map(s => [s.key, s.artifacts.filter(a => a.name === 'Set Viaje del rey')])));
}

console.log('---');
console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
