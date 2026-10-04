import './artifacts.json';
import * as fs from 'fs';
import * as path from 'path';
import {
  ArtifactEffectView,
  ArtifactSetTierView,
  ArtifactSetView,
  ArtifactView,
  ArtifactsData,
} from '../models/artifacts.types';

interface ArtifactEffectDef {
  name: string;
  nameEn: string;
  unit: string;
}

interface ArtifactLevelDef {
  level: number;
  cost: number;
  recordItem: number;
  recordCount: number;
  effects: { id: number; value: number }[];
}

interface ArtifactDef {
  id: number;
  name: string;
  nameEn: string;
  desc: string;
  grade: number;
  levels: ArtifactLevelDef[];
}

interface ArtifactSetDef {
  id: number;
  name: string;
  nameEn: string;
  artifacts: number[];
  tiers: { condition: string; effects: { id: number; value: number }[] }[];
}

interface ArtifactsDoc {
  maxLevel: number;
  grades: Record<string, { name: string; nameEn: string }>;
  starMultipliers: number[];
  effects: Record<string, ArtifactEffectDef>;
  artifacts: Record<string, ArtifactDef>;
  sets: ArtifactSetDef[];
}

const DOC: ArtifactsDoc = (() => {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'artifacts.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { maxLevel: 12, grades: {}, starMultipliers: [], effects: {}, artifacts: {}, sets: [] };
  }
})();

export const ARTIFACT_MAX_LEVEL = DOC.maxLevel || 12;

export const STAR_MULTIPLIERS: number[] = DOC.starMultipliers || [];

export const GRADE_NAMES: Record<number, string> = (() => {
  const out: Record<number, string> = {};
  for (const [k, v] of Object.entries(DOC.grades || {})) out[Number(k)] = v.name;
  return out;
})();

const EFFECT_DEFS: Record<number, ArtifactEffectDef> = (() => {
  const out: Record<number, ArtifactEffectDef> = {};
  for (const [k, v] of Object.entries(DOC.effects || {})) out[Number(k)] = v;
  return out;
})();

export const ARTIFACT_DEFS: Record<number, ArtifactDef> = (() => {
  const out: Record<number, ArtifactDef> = {};
  for (const [k, v] of Object.entries(DOC.artifacts || {})) out[Number(k)] = v;
  return out;
})();

export const ARTIFACT_SETS: ArtifactSetDef[] = DOC.sets || [];

export function artifactName(artifactId: number): string {
  const def = ARTIFACT_DEFS[artifactId];
  return def?.name || `Artefacto #${artifactId}`;
}

export function gradeName(grade: number): string {
  return GRADE_NAMES[grade] || `Grado ${grade}`;
}

/** Nombre visible de un set: "Set Atemporal" o "Set <id>" si no tiene traducción. */
export function artifactSetName(def: ArtifactSetDef): string {
  return def.name ? `Set ${def.name}` : `Set ${def.id}`;
}

export function starName(star: number): string {
  if (star >= 6) return 'Bendecido';
  if (star <= 0) return 'Sin estrellas';
  return `★ ${star}`;
}

/**
 * Valor final de un efecto de artefacto: el valor del nivel es el total
 * acumulado en la escala nativa del stat y las estrellas lo multiplican por
 * el factor de RelicsEnhance (★0 = ×1.0, ★5 = ×1.5, Bendecido = ×2.0).
 */
export function applyStarMultiplier(value: number, star: number): number {
  const idx = Math.min(Math.max(star, 0), STAR_MULTIPLIERS.length - 1);
  const mult = STAR_MULTIPLIERS[idx] ?? 10000;
  return Math.round((value * mult) / 10000);
}

function resolveEffects(raw: { id: number; value: number }[], star?: number): ArtifactEffectView[] {
  const out: ArtifactEffectView[] = [];
  for (const e of raw) {
    const def = EFFECT_DEFS[e.id];
    if (!def) continue;
    const value = star === undefined ? e.value : applyStarMultiplier(e.value, star);
    if (!value) continue;
    out.push({ id: e.id, name: def.name, unit: def.unit, value });
  }
  return out;
}

/** Efectos TOTALES de un artefacto en `level` con las estrellas aplicadas. */
export function artifactEffectsAt(def: ArtifactDef, level: number, star: number): ArtifactEffectView[] {
  const idx = Math.min(Math.max(level, 1), def.levels.length) - 1;
  const lvl = def.levels[idx];
  return lvl ? resolveEffects(lvl.effects, star) : [];
}

/**
 * Estado crudo (9771) → filas enriquecidas con las definiciones estáticas:
 * nombre, grado, estrellas y efectos actuales (con estrellas) + previsualización
 * del siguiente nivel. Orden: por grado descendente y luego por nombre.
 */
export function buildArtifactViews(data: ArtifactsData | undefined): ArtifactView[] {
  if (!data || !data.list) return [];
  const views: ArtifactView[] = [];
  for (const a of data.list) {
    const def = ARTIFACT_DEFS[a.artifactId];
    if (!def) continue;
    const level = Math.min(Math.max(a.level, 0), def.levels.length);
    const star = Math.min(Math.max(a.star, 0), 6);
    const next = level > 0 && level < def.levels.length
      ? { level: level + 1, effects: artifactEffectsAt(def, level + 1, star) }
      : null;
    views.push({
      artifactId: a.artifactId,
      name: def.name || `Artefacto #${a.artifactId}`,
      nameEn: def.nameEn || '',
      desc: def.desc || '',
      grade: def.grade,
      gradeName: gradeName(def.grade),
      level,
      maxLevel: def.levels.length || ARTIFACT_MAX_LEVEL,
      star,
      starName: starName(star),
      effects: level > 0 ? artifactEffectsAt(def, level, star) : [],
      nextLevel: next,
    });
  }
  return views.sort((x, y) => y.grade - x.grade || x.name.localeCompare(y.name, 'es'));
}

/**
 * Sets de artefactos con el estado de cada tier según las piezas poseídas:
 * tier 'collect' = las 3 piezas, 'star3' = todas con 3+ estrellas,
 * 'blessed' = todas bendecidas (estrella 6).
 */
export function buildSetViews(data: ArtifactsData | undefined): ArtifactSetView[] {
  const owned = new Map((data?.list || []).map(a => [a.artifactId, a]));
  return ARTIFACT_SETS.map(def => {
    const pieces = def.artifacts.map(id => {
      const state = owned.get(id);
      const pdef = ARTIFACT_DEFS[id];
      return {
        artifactId: id,
        name: pdef?.name || `Artefacto #${id}`,
        owned: !!state,
        level: state ? state.level : 0,
        star: state ? Math.min(Math.max(state.star, 0), 6) : 0,
      };
    });
    const allOwned = pieces.every(p => p.owned);
    const tiers: ArtifactSetTierView[] = def.tiers.map(tier => {
      const met =
        tier.condition === 'collect' ? allOwned
        : tier.condition === 'star3' ? allOwned && pieces.every(p => p.star >= 3)
        : tier.condition === 'blessed' ? allOwned && pieces.every(p => p.star >= 6)
        : false;
      return { condition: tier.condition, met, effects: resolveEffects(tier.effects) };
    });
    return { id: def.id, name: artifactSetName(def), pieces, tiers };
  });
}
