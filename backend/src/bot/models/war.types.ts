export interface WarEvent {
  iggId: number;
  active: boolean;
  detectedAt: Date;
  /** epoch ms de la última vez que este entry fue refrescado (2478/6611/7315) */
  updatedAt?: number;
  warTimestamp?: Date;
  timeRemainingSec: number;
  coordX: number;
  coordY: number;
  rallyLeader: string;
  enemyName: string;
  rallyType: number;
  /** índice de selección (1144/2480): lo reasigna assignIndexes por menor
   *  timeRemainingSec. NO es el índice del paquete 6611 (ver `slot`). */
  index: number;
  type: string;
  /** 6611: 'own' = propias del gremio (lado 0), 'against' = en contra (lado 1).
   *  'castle'/'fortress' no setean lado (2478/7315 no lo traen). */
  side?: 'own' | 'against';
  /** 6611: índice de la entrada dentro de la lista de su lado (0..N-1, byte 1
   *  del header). Se usa para hacer upsert y para limpiar el lote en slot 0. */
  slot?: number;
  /** 7315: true = agrupación en marcha, false = en espera */
  inMarch?: boolean;
  /** 7315: nivel de la fortaleza */
  level?: number;
  /** 7315: tropas actuales / capacidad máxima de la agrupación */
  troopsCurrent?: number;
  troopsMax?: number;
}
