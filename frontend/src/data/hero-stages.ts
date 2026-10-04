export interface SweepEliteStage {
  /** byte2 del proto 1805 en modo Élite (1..48) = AdvanceStage.id. */
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
  staminaNormal: number;
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

export interface HeroStagesDoc {
  chapters?: SweepChapter[];
  heroes?: Record<string, SweepHeroStages>;
  staminaNote?: string;
  sweepIdxNote?: string;
}

export interface SweepSel {
  /** 01 = x1, 02 = x10 */
  tipo: number;
  /** 01 = Normal, 02 = Elite, 03 = Desafío */
  etapa: number;
  /** Normal: 1..144 (etapa global). Élite: 1..48 (AdvanceStage.id). */
  idx: number;
}

let cached: HeroStagesDoc | null = null;
let resolvers: Array<(data: HeroStagesDoc) => void> = [];

export function setHeroStagesData(data: HeroStagesDoc): void {
  cached = data;
  for (const r of resolvers) r(data);
  resolvers = [];
}

export function getHeroStagesData(): Promise<HeroStagesDoc> {
  if (cached) return Promise.resolve(cached);
  return new Promise(resolve => resolvers.push(resolve));
}

export function getHeroStagesSync(): HeroStagesDoc | null {
  return cached;
}

export function sweepChapters(): SweepChapter[] {
  return cached?.chapters || [];
}

export function getChapter(id: number): SweepChapter | undefined {
  return sweepChapters().find(c => c.id === id);
}

export function getEliteStage(chapter: number, position: number): SweepEliteStage | undefined {
  return getChapter(chapter)?.elite.find(e => e.position === position);
}

const STAGES_PER_CHAPTER = 18;
const MAIN_PER_CHAPTER = 6;
const HEX_RE = /^[0-9a-fA-F]+$/;

export function parseSweepHex(hex: string): SweepSel | null {
  const clean = (hex || '').replace(/\s/g, '');
  if (clean.length < 10 || !HEX_RE.test(clean)) return null;
  return {
    tipo: parseInt(clean.slice(0, 2), 16),
    etapa: parseInt(clean.slice(2, 4), 16),
    idx: parseInt(clean.slice(4, 6), 16),
  };
}

export function buildSweepHex(sel: SweepSel): string {
  const byte = (n: number) => (n & 0xff).toString(16).padStart(2, '0');
  return `${byte(sel.tipo)}${byte(sel.etapa)}${byte(sel.idx)}0001`;
}

/** byte2 en modo Normal: número global de etapa 1..144 (cap1 = 1..18). */
export function normalSweepIdx(chapter: number, stage: number): number {
  return (chapter - 1) * STAGES_PER_CHAPTER + stage;
}

/** byte2 en modo Élite: AdvanceStage.id 1..48 (posición 1..6 por capítulo). */
export function eliteSweepIdx(chapter: number, position: number): number {
  return (chapter - 1) * MAIN_PER_CHAPTER + position;
}

export function chapterForSweepIdx(etapa: number, idx: number): number | null {
  const per = etapa === 1 ? STAGES_PER_CHAPTER : MAIN_PER_CHAPTER;
  const total = (sweepChapters().length || 8) * per;
  if (!Number.isFinite(idx) || idx < 1 || idx > total) return null;
  return Math.ceil(idx / per);
}

/** 1..18 en Normal; 1..6 (posición de la main) en Élite/Desafío. */
export function stageForSweepIdx(etapa: number, idx: number): number | null {
  const per = etapa === 1 ? STAGES_PER_CHAPTER : MAIN_PER_CHAPTER;
  const total = (sweepChapters().length || 8) * per;
  if (!Number.isFinite(idx) || idx < 1 || idx > total) return null;
  return ((idx - 1) % per) + 1;
}

/** Resistencia por corrida x1 (diez veces eso en x10). */
export function sweepStaminaCost(tipo: number, etapa: number, idx: number): number {
  const chapter = getChapter(chapterForSweepIdx(etapa, idx) ?? 1);
  const base = etapa === 1 ? chapter?.staminaNormal ?? 6 : chapter?.staminaElite ?? 12;
  return tipo === 2 ? base * 10 : base;
}

export function sweepTipoLabel(tipo: number): string {
  return tipo === 1 ? 'x1' : tipo === 2 ? 'x10' : `tipo ${tipo}`;
}

export function sweepEtapaLabel(etapa: number): string {
  return etapa === 1 ? 'Normal' : etapa === 2 ? 'Elite' : etapa === 3 ? 'Desafío' : `etapa ${etapa}`;
}
