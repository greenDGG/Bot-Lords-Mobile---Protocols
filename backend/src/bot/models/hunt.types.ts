export type HuntStatus = 'hunting' | 'killed' | 'gone' | 'stopped' | 'no-energy' | 'no-target';

export interface HuntTarget {
  tileId: number;
  x: number;
  y: number;
  level: number;
  hp: number;
  hits: number;
  energySpent: number;
  status: HuntStatus;
  startedAt: number;
  lastHitAt: number;
  /** Golpes que el servidor confirmó con el 2220 de HP */
  hitsLanded: number;
  /** Unix seconds de la ida (llegada del 2220 de marcha), 0 si no se vio */
  departedAt: number;
  /** Segundos de ida según la marcha, 0 si no se vio */
  outboundSeconds: number;
  /** Unix seconds en que la marcha vuelve al castillo (0 si no se sabe) */
  returnAt: number;
}

export const HUNT_STATUS_LABEL: Record<HuntStatus, string> = {
  hunting: 'Cazando',
  killed: 'Muerto',
  gone: 'Desapareció',
  stopped: 'Detenido',
  'no-energy': 'Sin energía',
  'no-target': 'Sin objetivo',
};
