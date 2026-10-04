import { decodeCoordBytes } from '../../models/map-coords';
import { WarEvent } from '../models/war.types';

/**
 * Proto 6611: agrupaciones a TORRES.
 *
 * UN paquete = UNA agrupación (body siempre de 87 B); N torres => N paquetes.
 *
 * Header (body[0..5]):
 *   [0] lado: 0 = propias del gremio, 1 = en contra
 *   [1] slot: índice dentro de la lista de ese lado (0..N-1). Se usa para hacer
 *             upsert y para limpiar el lado cuando vuelve a 0.
 *   [2..4] = 00, [5] = 00|01 (sin usar)
 *
 * El resto de los campos comparten valores entre lados, pero no la posición:
 *   lado 0: ts@6  timeRem@14  PointCode@18  AllyHead@21  nombre@23 (13B)
 *           tropas@36 (cur u32, max u32, type u8)  gremio@45 (20B)
 *   lado 1: ts@6  timeRem@14  type@18  tropas@19 (cur u32, max u32)
 *           PointCode@27  AllyHead@30  nombre@32 (13B)  gremio@54 (parcial)
 *
 * Coords: PointCode de 3 bytes (mismo decode que 2478/7315). En torres el
 * segundo byte siempre es 0 => y <= 255.
 */
export interface Entry6611 {
  side: 'own' | 'against';
  slot: number;
  ts: number;
  timeRemainingSec: number;
  coordX: number;
  coordY: number;
  rallyLeader: string;
  troopsCurrent: number;
  /** undefined cuando el campo de la derecha es menor que el actual (casos
   *  raros del lado "en contra": ese campo no es la capacidad) */
  troopsMax?: number;
}

export function parse6611(payload: Buffer): Entry6611 | null {
  if (payload.length < 87) return null;

  const side: 'own' | 'against' = payload[0] === 1 ? 'against' : 'own';
  const slot = payload[1];

  const ts = payload.readUInt32LE(6);
  const timeRemainingSec = payload.readUInt32LE(14);

  const pointOff = side === 'own' ? 18 : 27;
  const coord = decodeCoordBytes([payload[pointOff], payload[pointOff + 1], payload[pointOff + 2]]);

  const nameOff = side === 'own' ? 23 : 32;
  const rallyLeader = payload.toString('ascii', nameOff, nameOff + 13).replace(/\0+$/, '');

  const troopsOff = side === 'own' ? 36 : 19;
  const troopsCurrent = payload.readUInt32LE(troopsOff);
  const troopsMaxRaw = payload.readUInt32LE(troopsOff + 4);
  const troopsMax = troopsMaxRaw >= troopsCurrent ? troopsMaxRaw : undefined;

  return {
    side,
    slot,
    ts,
    timeRemainingSec,
    coordX: coord.x,
    coordY: coord.y,
    rallyLeader,
    troopsCurrent,
    troopsMax,
  };
}

export interface Apply6611Result {
  /** lista resultante (misma referencia si no hubo que podar) */
  list: WarEvent[];
  /** torres borradas porque llegó el slot 0 = lote nuevo de ese lado */
  dropped: number;
  /** true si la entrada no existía y se creó */
  created: boolean;
}

/**
 * Incorpora una entrada 6611 a la lista de eventos:
 *  - slot 0 => empieza un lote nuevo de ese lado: se borran las torres viejas
 *    de ese lado (así una lista que baja de N a M<N queda limpia sin esperar
 *    al siguiente refresco completo)
 *  - después se hace upsert por (lado, slot): los paquetes se repiten en cada
 *    refresco y hay que actualizarlos, no duplicarlos.
 */
export function apply6611(list: WarEvent[], e: Entry6611, iggId: number): Apply6611Result {
  let next = list;
  let dropped = 0;
  if (e.slot === 0) {
    next = list.filter(w => !(w.type === 'tower' && w.side === e.side));
    dropped = list.length - next.length;
  }

  const now = Date.now();
  const existing = next.find(w => w.type === 'tower' && w.side === e.side && w.slot === e.slot);
  if (existing) {
    existing.timeRemainingSec = e.timeRemainingSec;
    existing.updatedAt = now;
    existing.warTimestamp = new Date(e.ts * 1000);
    existing.rallyLeader = e.rallyLeader;
    existing.coordX = e.coordX;
    existing.coordY = e.coordY;
    existing.troopsCurrent = e.troopsCurrent;
    existing.troopsMax = e.troopsMax;
    existing.active = true;
    return { list: next, dropped, created: false };
  }

  next = [...next, {
    iggId,
    active: true,
    detectedAt: new Date(),
    updatedAt: now,
    warTimestamp: new Date(e.ts * 1000),
    timeRemainingSec: e.timeRemainingSec,
    coordX: e.coordX,
    coordY: e.coordY,
    rallyLeader: e.rallyLeader,
    enemyName: '',
    rallyType: 0,
    index: 0,
    type: 'tower',
    side: e.side,
    slot: e.slot,
    troopsCurrent: e.troopsCurrent,
    troopsMax: e.troopsMax,
  }];
  return { list: next, dropped, created: true };
}

/** Borra las torres de un lado cuando 2477 dice que ese lado quedó en 0. */
export function pruneTowerSide(list: WarEvent[], side: 'own' | 'against'): WarEvent[] {
  return list.filter(w => !(w.type === 'tower' && w.side === side));
}
