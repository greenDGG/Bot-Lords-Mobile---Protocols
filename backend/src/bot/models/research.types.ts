export const TECH_COUNT = 500;

export interface ResearchData {
  /** Nivel actual de cada investigación: techLevels[id - 1]. Fuera del rango = 0. */
  techLevels: number[];
  /** Investigación en curso (0 = ninguna). */
  activeTechId: number;
  /** Nivel que se está investigando en la activa. */
  activeLevel: number;
  /** Timestamp del servidor (unix, segundos). */
  timestamp: number;
  /** Segundos restantes de la investigación activa. */
  remainingSeconds: number;
}
