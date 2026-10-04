import './hero-stages.json'; // hace que tsc copie hero-stages.json a dist
import * as fs from 'fs';
import * as path from 'path';

export interface SweepEliteStage {
  /** byte2 del proto 1805 (1..48) = fila de AdvanceStage = (capítulo-1)*6+posición. */
  idx: number;
  position: number;
  mainStage: number;
  heroId: number;
  heroName: string;
  medalItemId: number | null;
  enemyLevel: number | null;
}

export interface SweepChapter {
  id: number;
  name: string;
  nameEn: string;
  needLevel: number;
  /** resistencia de una batalla Normal en este capítulo (Chapter.Power) */
  staminaNormal: number;
  /** resistencia de una batalla Elite (Power x2) */
  staminaElite: number;
  heroId: number;
  heroName: string;
  heroMedalItemId: number;
  heroMedalCount: number;
  mainStages: number[];
  elite: SweepEliteStage[];
}

export interface SweepHeroStages {
  id: number;
  name: string;
  nameEn: string;
  medalItemId: number | null;
  stages: Array<{ chapter: number; position: number; mainStage: number; idx: number }>;
}

interface HeroStagesDoc {
  source?: string;
  chapters?: SweepChapter[];
  heroes?: Record<string, SweepHeroStages>;
}

/**
 * Capítulos de etapas de héroe (stamina + medalla por etapa élite).
 * hero-stages.json generado por scripts/gen-hero-stages.py (tablas del cliente
 * + wiki para el mapa etapa élite -> héroe, que no existe en las tablas).
 */
const DOC: HeroStagesDoc = (() => {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'hero-stages.json'), 'utf-8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
})();

export const SWEEP_CHAPTERS: SweepChapter[] = Array.isArray(DOC.chapters) ? DOC.chapters : [];

export const SWEEP_HEROES: Record<number, SweepHeroStages> = (() => {
  const out: Record<number, SweepHeroStages> = {};
  for (const [key, value] of Object.entries(DOC.heroes || {})) {
    const id = Number(key);
    if (Number.isFinite(id)) out[id] = value;
  }
  return out;
})();

export function getChapter(id: number): SweepChapter | undefined {
  return SWEEP_CHAPTERS.find(c => c.id === id);
}

/** Etapas normales por capítulo (mini + main): NormalMiniStage.u5 + NormalStage.u5 = 1..144. */
export const STAGES_PER_CHAPTER = 18;
/** Etapas main/élite por capítulo: AdvanceStage.id = 1..48. */
export const MAIN_PER_CHAPTER = 6;

/** byte2 de un barrido Normal: número global de etapa 1..144 (cap1 = 1..18). */
export function normalSweepIdx(chapter: number, stage: number): number {
  return (chapter - 1) * STAGES_PER_CHAPTER + stage;
}

/** byte2 de un barrido Élite: id de AdvanceStage 1..48. */
export function eliteSweepIdx(chapter: number, position: number): number {
  return (chapter - 1) * MAIN_PER_CHAPTER + position;
}

export function sweepIdx(chapter: number, position: number): number {
  return eliteSweepIdx(chapter, position);
}

/**
 * Capítulo (1..8) de un byte2. Normal cuenta 18 etapas por capítulo,
 * Élite/Desafío 6; null si está fuera de rango.
 */
export function chapterForSweepIdx(etapa: number, idx: number): number | null {
  const per = etapa === 1 ? STAGES_PER_CHAPTER : MAIN_PER_CHAPTER;
  if (!Number.isFinite(idx) || idx < 1 || idx > SWEEP_CHAPTERS.length * per) return null;
  return Math.ceil(idx / per);
}

/**
 * Etapa de un byte2: 1..18 en Normal (número real de etapa), 1..6 en
 * Élite/Desafío (posición de la etapa main, = etapa 3·posición).
 */
export function stageForSweepIdx(etapa: number, idx: number): number | null {
  const per = etapa === 1 ? STAGES_PER_CHAPTER : MAIN_PER_CHAPTER;
  if (!Number.isFinite(idx) || idx < 1 || idx > SWEEP_CHAPTERS.length * per) return null;
  return ((idx - 1) % per) + 1;
}

export function getEliteStage(chapter: number, position: number): SweepEliteStage | undefined {
  return getChapter(chapter)?.elite.find(e => e.position === position);
}

export function eliteStagesForHero(heroId: number): SweepHeroStages['stages'] {
  return SWEEP_HEROES[heroId]?.stages || [];
}

/**
 * Resistencia que gasta un barrido (proto 1805):
 *   tipo 1 = x1, tipo 2 = x10 (diez corridas);
 *   etapa 1 = Normal (staminaNormal), 2/3 = Elite/Desafío (staminaElite).
 * El capítulo sale del byte2 según el modo (Normal: 18/cap, Élite: 6/cap);
 * con un idx inválido se usa el capítulo 1 (costos 6/12).
 */
export function sweepStaminaCost(tipo: number, etapa: number, idx: number): number {
  const chapter = getChapter(chapterForSweepIdx(etapa, idx) ?? 1);
  const base = etapa === 1 ? chapter?.staminaNormal ?? 6 : chapter?.staminaElite ?? 12;
  return tipo === 2 ? base * 10 : base;
}
