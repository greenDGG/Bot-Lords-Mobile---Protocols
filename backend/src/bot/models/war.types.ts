export interface WarEvent {
  iggId: number;
  active: boolean;
  detectedAt: Date;
  warTimestamp?: Date;
  timeRemainingSec: number;
  coordX: number;
  coordY: number;
  rallyLeader: string;
  enemyName: string;
  rallyType: number;
  index: number;
  type: string;
  /** 7315: true = agrupación en marcha, false = en espera */
  inMarch?: boolean;
  /** 7315: nivel de la fortaleza */
  level?: number;
  /** 7315: tropas actuales / capacidad máxima de la agrupación */
  troopsCurrent?: number;
  troopsMax?: number;
}
