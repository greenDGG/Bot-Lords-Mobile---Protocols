/**
 * Diccionario de misiones FDG (Proto 3633).
 *
 * Cada misión tiene:
 *   - id:       ID de la misión (uint16 LE del campo missionId)
 *   - name:     Nombre descriptivo (pendiente de confirmar para cada una)
 *   - level:    Nivel de la misión (uint8 del campo level en 3633)
 *   - points:   Recompensa en puntos (pendiente de confirmar)
 *   - time:     Duración en segundos (pendiente de confirmar)
 *
 * Los campos marcados con 0 significan "sin dato confirmado".
 * A medida que se obtengan datos reales del juego, se deben completar.
 */

export interface FdgMissionDef {
  id: number;
  name: string;
  level: number;
  points: number;
  time: number;
}

export const FDG_MISSIONS: Record<number, FdgMissionDef> = {
  9:   { id: 9,   name: 'FDG 9',   level: 1, points: 0, time: 0 },
  10:  { id: 10,  name: 'FDG 10',  level: 0, points: 0, time: 0 },
  14:  { id: 14,  name: 'FDG 14',  level: 2, points: 0, time: 0 },
  15:  { id: 15,  name: 'FDG 15',  level: 1, points: 0, time: 0 },
  16:  { id: 16,  name: 'FDG 16',  level: 1, points: 0, time: 0 },
  17:  { id: 17,  name: 'FDG 17',  level: 1, points: 0, time: 0 },
  24:  { id: 24,  name: 'FDG 24',  level: 0, points: 0, time: 0 },
  25:  { id: 25,  name: 'FDG 25',  level: 2, points: 0, time: 0 },
  30:  { id: 30,  name: 'FDG 30',  level: 1, points: 0, time: 0 },
  31:  { id: 31,  name: 'FDG 31',  level: 1, points: 0, time: 0 },
  38:  { id: 38,  name: 'FDG 38',  level: 2, points: 0, time: 0 },
  41:  { id: 41,  name: 'FDG 41',  level: 2, points: 0, time: 0 },
  42:  { id: 42,  name: 'FDG 42',  level: 0, points: 0, time: 0 },
  44:  { id: 44,  name: 'FDG 44',  level: 3, points: 0, time: 0 },
};

export function fdgMissionName(id: number): string {
  return FDG_MISSIONS[id]?.name || `FDG ${id}`;
}

export function fdgMissionDef(id: number): FdgMissionDef | undefined {
  return FDG_MISSIONS[id];
}
