import {
  MAIN_PER_CHAPTER,
  STAGES_PER_CHAPTER,
  SWEEP_CHAPTERS,
  SWEEP_HEROES,
  chapterForSweepIdx,
  eliteStagesForHero,
  eliteSweepIdx,
  getChapter,
  getEliteStage,
  normalSweepIdx,
  stageForSweepIdx,
  sweepIdx,
  sweepStaminaCost,
} from '../src/bot/data/hero-stages-db';
import { parseSweepPayload } from '../src/models/bot-config';

let failed = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.log(`  FALLO: ${msg}`);
  }
}

console.log('== hero-stages-db ==');

check(SWEEP_CHAPTERS.length === 8, `8 capítulos (hay ${SWEEP_CHAPTERS.length})`);
check(STAGES_PER_CHAPTER === 18 && MAIN_PER_CHAPTER === 6, '18 etapas/cap, 6 main/cap');

let eliteTotal = 0;
for (const ch of SWEEP_CHAPTERS) {
  check(ch.elite.length === 6, `cap ${ch.id}: 6 etapas élite (hay ${ch.elite.length})`);
  eliteTotal += ch.elite.length;
  check(
    ch.elite.some(e => e.heroId === ch.heroId),
    `cap ${ch.id}: Chapter.HeroID=${ch.heroId} está en sus etapas élite`
  );
  check(
    ch.staminaNormal === (ch.id === 8 ? 8 : 6),
    `cap ${ch.id}: staminaNormal ${ch.staminaNormal}`
  );
  check(ch.staminaElite === ch.staminaNormal * 2, `cap ${ch.id}: staminaElite ${ch.staminaElite}`);
  for (const e of ch.elite) {
    const eliteIdx = eliteSweepIdx(ch.id, e.position);
    check(eliteIdx === e.idx, `cap ${ch.id} pos ${e.position}: eliteSweepIdx ${eliteIdx} vs json ${e.idx}`);
    check(sweepIdx(ch.id, e.position) === e.idx, `sweepIdx alias`);
    check(chapterForSweepIdx(2, e.idx) === ch.id, `elite idx ${e.idx} → capítulo ${ch.id}`);
    check(stageForSweepIdx(2, e.idx) === e.position, `elite idx ${e.idx} → posición ${e.position}`);
    const mainStage = e.mainStage;
    check(normalSweepIdx(ch.id, mainStage) === (ch.id - 1) * 18 + mainStage, `normal idx cap ${ch.id}`);
    check(chapterForSweepIdx(1, normalSweepIdx(ch.id, mainStage)) === ch.id,
      `normal idx ${normalSweepIdx(ch.id, mainStage)} → capítulo ${ch.id}`);
    check(stageForSweepIdx(1, normalSweepIdx(ch.id, mainStage)) === mainStage,
      `normal idx → etapa ${mainStage}`);
    check(ch.mainStages.includes(e.mainStage), `cap ${ch.id} pos ${e.position}: mainStage`);
    check(e.heroId > 0 && e.medalItemId != null, `cap ${ch.id} pos ${e.position}: héroe/medalla`);
    check(getEliteStage(ch.id, e.position) === e, `getEliteStage(${ch.id},${e.position})`);
  }
}
check(eliteTotal === 48, `48 etapas élite en total (hay ${eliteTotal})`);
check(Object.keys(SWEEP_HEROES).length === 20, `${Object.keys(SWEEP_HEROES).length} héroes con medalla`);

for (const [key, hero] of Object.entries(SWEEP_HEROES)) {
  const id = Number(key);
  check(hero.id === id, `SWEEP_HEROES[${key}].id = ${hero.id}`);
  check(hero.stages.length >= 1, `${hero.name}: al menos 1 etapa`);
  for (const s of hero.stages) {
    const e = getEliteStage(s.chapter, s.position);
    check(!!e && e.heroId === id, `${hero.name}: etapa c${s.chapter}p${s.position} le pertenece`);
    check(eliteStagesForHero(id).includes(s), `${hero.name}: aparece en eliteStagesForHero`);
  }
}

console.log('== capturas reales del cliente ==');
const c1 = parseSweepPayload('0101030001');
check(!!c1 && c1.tipo === 1 && c1.etapa === 1 && c1.idx === 3, `normal 1-3 → ${JSON.stringify(c1)}`);
check(!!c1 && chapterForSweepIdx(c1.etapa, c1.idx) === 1, 'normal 1-3 → capítulo 1');
check(!!c1 && stageForSweepIdx(c1.etapa, c1.idx) === 3, 'normal 1-3 → etapa 3');
const c2 = parseSweepPayload('0102010001');
check(!!c2 && c2.tipo === 1 && c2.etapa === 2 && c2.idx === 1, `elite 1-3 → ${JSON.stringify(c2)}`);
check(!!c2 && chapterForSweepIdx(c2.etapa, c2.idx) === 1, 'elite 1-3 → capítulo 1');
check(!!c2 && stageForSweepIdx(c2.etapa, c2.idx) === 1, 'elite 1-3 → posición 1 (etapa 1-3)');
check(normalSweepIdx(2, 3) === 21, 'predicción: normal 2-3 → 21 (0x15)');
check(eliteSweepIdx(2, 1) === 7, 'predicción: elite 2-3 → 7 (0x07)');
check(normalSweepIdx(1, 4) === 4, 'predicción: normal 1-4 (mini) → 4 (0x04)');

console.log('== costos de resistencia ==');
const casos: Array<[number, number, number, number, string]> = [
  [1, 1, normalSweepIdx(1, 3), 6, 'cap1 Normal x1 = 6'],
  [2, 1, normalSweepIdx(1, 3), 60, 'cap1 Normal x10 = 60'],
  [1, 2, eliteSweepIdx(1, 1), 12, 'cap1 Elite x1 = 12'],
  [2, 2, eliteSweepIdx(1, 1), 120, 'cap1 Elite x10 = 120'],
  [1, 1, normalSweepIdx(2, 1), 6, 'cap2 Normal x1 = 6 (idx 19)'],
  [2, 2, eliteSweepIdx(7, 6), 120, 'cap7 Elite x10 = 120'],
  [1, 1, normalSweepIdx(8, 18), 8, 'cap8 Normal x1 = 8 (idx 144)'],
  [2, 1, normalSweepIdx(8, 1), 80, 'cap8 Normal x10 = 80 (idx 127)'],
  [1, 2, eliteSweepIdx(8, 6), 16, 'cap8 Elite x1 = 16 (idx 48)'],
  [2, 2, eliteSweepIdx(8, 6), 160, 'cap8 Elite x10 = 160 (idx 48)'],
  [1, 3, eliteSweepIdx(4, 3), 12, 'cap4 Desafío x1 = 12 (usa costo Elite)'],
  [2, 2, 0, 120, 'elite idx inválido → cap1 Elite x10 = 120'],
  [2, 2, 99, 120, 'elite idx 99 → cap1 Elite x10 = 120'],
  [2, 1, 200, 60, 'normal idx 200 → cap1 Normal x10 = 60'],
];
for (const [tipo, etapa, idx, esperado, label] of casos) {
  const got = sweepStaminaCost(tipo, etapa, idx);
  check(got === esperado, `${label}: esperado ${esperado}, got ${got}`);
}

console.log('== rangos ==');
check(chapterForSweepIdx(1, 0) === null, 'normal idx 0 → null');
check(chapterForSweepIdx(1, 145) === null, 'normal idx 145 → null');
check(chapterForSweepIdx(2, 49) === null, 'elite idx 49 → null');
check(chapterForSweepIdx(2, 48) === 8, 'elite idx 48 → capítulo 8');
check(chapterForSweepIdx(1, 144) === 8, 'normal idx 144 → capítulo 8');
check(stageForSweepIdx(1, 144) === 18, 'normal idx 144 → etapa 18');
check(getChapter(9) === undefined, 'capítulo 9 no existe');

console.log('== payload 1805 ==');
const p2 = parseSweepPayload('02 02 2d 00 01');
check(!!p2 && p2.idx === 0x2d, JSON.stringify(p2));
check(parseSweepPayload('020201') === null, 'payload corto → null');
check(parseSweepPayload('zz') === null, 'payload no hex → null');

if (failed > 0) {
  console.log(`\n${failed} comprobaciones fallidas`);
  process.exit(1);
}
console.log('\nTodas las comprobaciones OK');
