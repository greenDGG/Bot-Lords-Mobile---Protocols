/** Estado de un artefacto poseído (proto 9771). */
export interface ArtifactState {
  artifactId: number;
  /** Nivel 1..12. */
  level: number;
  /** Estrellas 0..5, 6 = Bendecido (RelicsEnhance). */
  star: number;
}

/** Estado crudo de los artefactos de una cuenta (9771). */
export interface ArtifactsData {
  list: ArtifactState[];
}

/** Efecto de artefacto ya resuelto (nombre/unidad) y con estrellas aplicadas. */
export interface ArtifactEffectView {
  id: number;
  name: string;
  unit: string;
  /** Valor final en la escala del stat ('%': centésimas; sin unidad: entero). */
  value: number;
}

/** Artefacto poseído enriquecido con su definición estática. */
export interface ArtifactView {
  artifactId: number;
  name: string;
  nameEn: string;
  desc: string;
  /** 3 = Extraordinario/Rare, 4 = Épico/Epic, 5 = Legendario/Legendary. */
  grade: number;
  gradeName: string;
  level: number;
  maxLevel: number;
  /** 0..5 estrellas, 6 = Bendecido. */
  star: number;
  starName: string;
  /** Efectos TOTALES del nivel actual con el multiplicador de estrellas. */
  effects: ArtifactEffectView[];
  /** Siguiente nivel (mismas estrellas); null si está al máximo. */
  nextLevel: { level: number; effects: ArtifactEffectView[] } | null;
}

/** Pieza de un set (artefacto incluido o no en la cuenta). */
export interface ArtifactSetPieceView {
  artifactId: number;
  name: string;
  owned: boolean;
  /** Nivel/estrellas si está poseído; 0 si no. */
  level: number;
  star: number;
}

/** Bonus de un set: se activa cuando la condición del tier se cumple. */
export interface ArtifactSetTierView {
  /** 'collect' = las 3 piezas, 'star3' = con 3+ estrellas, 'blessed' = todas bendecidas. */
  condition: string;
  met: boolean;
  effects: ArtifactEffectView[];
}

/** Set de artefactos (RelicsCombination) con el estado de sus tiers. */
export interface ArtifactSetView {
  id: number;
  name: string;
  pieces: ArtifactSetPieceView[];
  tiers: ArtifactSetTierView[];
}
