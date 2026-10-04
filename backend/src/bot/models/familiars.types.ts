/** Estado de una habilidad de monstruito (proto 8210). */
export interface FamiliarSkillState {
  /** 1..10 (10 = máx). */
  level: number;
  /** Experiencia dentro del nivel actual (0 si nv1 o nv máx). */
  exp: number;
}

/** Estado de un monstruito visto en 8210. */
export interface FamiliarState {
  petId: number;
  /** Nivel 1..60. */
  level: number;
  exp: number;
  /** 0 = Crías, 1 = Adulto, 2 = Anciano (hipótesis de etapa). */
  stage: number;
  /** Byte @6 del registro: siempre 0 en las capturas (sin uso conocido). */
  flags: number;
  /** 4 habilidades de PetTbl.PetSkill[4], en el mismo orden. */
  skills: FamiliarSkillState[];
}

/** Talento de ejército desbloqueado (proto 8245): petId → nivel 1..10. */
export interface FamiliarTalentState {
  petId: number;
  level: number;
}

/** Cooldown de una habilidad activa (proto 8231). */
export interface FamiliarCooldownState {
  skillId: number;
  /** Época Unix (s) en que la skill vuelve a estar disponible = último uso + CD[nivel]. */
  availableAt: number;
}

/** Fatiga de skills ofensivas (proto 8230). */
export interface FamiliarFatigueState {
  /** Fatiga consumida (0 en casi todas las capturas). */
  fatigue: number;
  /** Tope del pool (45 observado). */
  max: number;
  /** Época (s) del reset/regeneración observada en el paquete. */
  resetAt: number;
}

/** Buff activo de una skill (proto 8232). */
export interface FamiliarBuffState {
  skillId: number;
  /** Nivel de la skill que aplicó el buff. */
  level: number;
  /** Época (s) de inicio. */
  startTs: number;
  /** Duración en segundos. */
  durationSec: number;
}

/**
 * Respuesta de uso de skill (proto 8227).
 *
 * `result = 0` → usada (ecóa petId/skillId y trae el `availableAt` nuevo);
 * `result = 6` → rechazada (petId/skillId en 0 en las capturas del bot).
 */
export interface FamiliarUseResponse {
  result: number;
  petId: number;
  skillId: number;
  /** Época (s) en que la skill vuelve a estar disponible (sólo en éxito). */
  availableAt: number;
}

/** Estado crudo de los monstruitos de una cuenta (8210 + 8245 + 8231/8230/8232). */
export interface FamiliarsData {
  pets: FamiliarState[];
  talents: FamiliarTalentState[];
  /** Cooldowns de skills activas (8231), merge monotónico (nunca baja). */
  cooldowns?: FamiliarCooldownState[];
  /** Pool de fatiga (8230). */
  fatigue?: FamiliarFatigueState;
  /** Buffs activos (8232). */
  buffs?: FamiliarBuffState[];
}

/** Valores de una skill por nivel (1..10) + unidad (0 = % v/100, 1 = cantidad, 2 = segundos). */
export interface FamiliarSkillValues {
  values: number[];
  unit: number;
}

/**
 * Habilidad de monstruito ya enriquecida con su definición estática.
 * type='passive' (pasiva de stats): effectText = "Vel. construcción +",
 * values/unit = magnitud por nivel de la skill, effectDesc = texto largo.
 * type='active' (marcha/combate): desc con placeholders %a..%g y
 * params = filas de valores (letra → values/unit).
 */
export interface FamiliarSkillView {
  id: number;
  name: string;
  level: number;
  maxLevel: number;
  exp: number;
  type?: 'passive' | 'active';
  effectText?: string;
  effectDesc?: string;
  values?: number[];
  unit?: number;
  desc?: string;
  params?: Record<string, FamiliarSkillValues>;
}

/** Talento de ejército enriquecido (definición + nivel desbloqueado). */
export interface FamiliarTalentView {
  id: number;
  name: string;
  desc: string;
  /** Nivel del talento (1..10); 0 = no desbloqueado. */
  level: number;
  maxLevel: number;
  /** % por nivel (10 valores) si el talento escala con %d. */
  pct?: number[];
}

/** Fila de la tabla de monstruitos enviada al frontend. */
export interface FamiliarView {
  petId: number;
  name: string;
  rare: number;
  army: string;
  level: number;
  exp: number;
  stage: number;
  stageName: string;
  skills: FamiliarSkillView[];
  talent: FamiliarTalentView | null;
}
