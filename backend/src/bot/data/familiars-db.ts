import './familiars.json';
import * as fs from 'fs';
import * as path from 'path';
import { FamiliarState, FamiliarTalentState, FamiliarsData, FamiliarView } from '../models/familiars.types';

interface FamiliarDef {
  id: number;
  name: string;
  nameEn: string;
  rare: number;
  army: string;
  talent: number;
  skills: number[];
}

interface SkillDef {
  id: number;
  name: string;
  nameEn: string;
  maxLevel: number;
  /** 'passive' = pasiva de stats (Effect + valores), 'active' = skill de marcha/combate. */
  type?: 'passive' | 'active';
  effectId?: number;
  /** Texto corto del efecto, p. ej. "Vel. construcción +" (el valor va detrás). */
  effectText?: string;
  effectTextEn?: string;
  /** Unidad del stat según Effect.ValueID ('', '%', 'minutos'); misma key que investigación/talentos. */
  effectUnit?: string;
  /** Texto largo del efecto (Effect.StringID). */
  effectDesc?: string;
  effectDescEn?: string;
  /** Magnitud por nivel de skill (10 valores). */
  values?: number[];
  /** 0 = % (valor/100), 1 = cantidad, 2 = segundos. */
  unit?: number;
  /** Sólo activas: desc con placeholders %a..%g. */
  desc?: string;
  descEn?: string;
  /** Sólo activas: letra de placeholder → valores por nivel. */
  params?: Record<string, { values: number[]; unit: number }>;
  /** Sólo activas: 1 = soporte (no gasta fatiga), 2 = ofensiva (gasta fatiga). */
  subject?: number;
  /** Sólo activas: fatiga que cuesta el uso (PetSkill.Fatigue @38; 0 = no gasta). */
  fatigue?: number;
}

interface TalentDef {
  id: number;
  name: string;
  nameEn: string;
  desc: string;
  pct?: number[];
  sec?: number[];
}

interface FamiliarsDoc {
  pets: Record<string, FamiliarDef>;
  skills: Record<string, SkillDef>;
  talents: Record<string, TalentDef>;
}

/** Etapas del monstruito (byte @7 del registro 8210). */
export const STAGE_NAMES = ['Crías', 'Adulto', 'Anciano'];

const DOC: FamiliarsDoc = (() => {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'familiars.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { pets: {}, skills: {}, talents: {} };
  }
})();

export const FAMILIAR_DEFS: Record<number, FamiliarDef> = (() => {
  const out: Record<number, FamiliarDef> = {};
  for (const [k, v] of Object.entries(DOC.pets || {})) out[Number(k)] = v;
  return out;
})();

export const SKILL_DEFS: Record<number, SkillDef> = (() => {
  const out: Record<number, SkillDef> = {};
  for (const [k, v] of Object.entries(DOC.skills || {})) out[Number(k)] = v;
  return out;
})();

export const TALENT_DEFS: Record<number, TalentDef> = (() => {
  const out: Record<number, TalentDef> = {};
  for (const [k, v] of Object.entries(DOC.talents || {})) out[Number(k)] = v;
  return out;
})();

export function familiarName(petId: number): string {
  return FAMILIAR_DEFS[petId]?.name || `Monstruito #${petId}`;
}

/** Estado crudo (8210 + 8245) → filas enriquecidas con defs estáticas. */
export function buildFamiliarViews(data: FamiliarsData): FamiliarView[] {
  const talentByPet = new Map<number, FamiliarTalentState>(data.talents.map(t => [t.petId, t]));
  return data.pets.map((p: FamiliarState) => {
    const def = FAMILIAR_DEFS[p.petId];
    const talentId = def?.talent || 0;
    const talentDef = talentId ? TALENT_DEFS[talentId] : undefined;
    const unlocked = talentByPet.get(p.petId);
    return {
      petId: p.petId,
      name: def?.name || `Monstruito #${p.petId}`,
      rare: def?.rare ?? 0,
      army: def?.army || '',
      level: p.level,
      exp: p.exp,
      stage: p.stage,
      stageName: STAGE_NAMES[p.stage] || `Etapa ${p.stage}`,
      skills: p.skills.map((s, i) => {
        const skillId = def?.skills?.[i] || 0;
        const skillDef = skillId ? SKILL_DEFS[skillId] : undefined;
        return {
          id: skillId,
          name: skillDef?.name || (skillId ? `Skill #${skillId}` : '—'),
          level: s.level,
          maxLevel: skillDef?.maxLevel || 10,
          exp: s.exp,
          type: skillDef?.type,
          effectText: skillDef?.effectText,
          effectDesc: skillDef?.effectDesc,
          values: skillDef?.values,
          unit: skillDef?.unit,
          desc: skillDef?.desc,
          params: skillDef?.params,
        };
      }),
      talent: talentDef
        ? {
            id: talentId,
            name: talentDef.name,
            desc: talentDef.desc,
            level: unlocked?.level || 0,
            maxLevel: 10,
            pct: talentDef.pct,
          }
        : null,
    };
  });
}
