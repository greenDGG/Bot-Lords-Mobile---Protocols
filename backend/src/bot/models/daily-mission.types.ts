export interface DailyMissionEntry {
  id: number;
  /** u32 crudo: 0xffffffff = reclamada, si no = progreso contra `requirement`. */
  value: number;
}

/**
 * Snapshot del "Diario" (proto 3144). El servidor lo manda solo al entrar y
 * después sólo empuja 3143 con un contador; no hay REQUEST de lista.
 */
export interface DailyMissionSnapshot {
  /** PA (puntos de actividad) ganados reclamando misiones: 0..150 en rank 7. */
  pa: number;
  /** máscara de cofres de PA ya reclamados: bit0 = cofre 1 (20 PA), bit1 = 40... */
  chestMask: number;
  /** rango de misiones del día (5..8 visto en logs). */
  missionRank: number;
  missions: DailyMissionEntry[];
}

/** Snapshot + clave de día con la que se tomó (para limpiarlo en el reset). */
export interface DailyMissionCache extends DailyMissionSnapshot {
  dayKey: string;
}

/**
 * 3144 _MSG_RESP_DAILY_MISSION — push, 154 B de body:
 *   [u8 pa][u8 chestMask][u8 missionRank][u8 count] + count × [u16 id][u32 value]
 * count = 25 siempre en los logs (ids 144..168 en rank 7).
 */
export function parse3144(body: Buffer): DailyMissionSnapshot | null {
  if (body.length < 4) return null;
  const pa = body.readUInt8(0);
  const chestMask = body.readUInt8(1);
  const missionRank = body.readUInt8(2);
  const count = body.readUInt8(3);
  if (count === 0 || body.length < 4 + count * 6) return null;
  const missions: DailyMissionEntry[] = [];
  for (let i = 0; i < count; i++) {
    const offset = 4 + i * 6;
    missions.push({ id: body.readUInt16LE(offset), value: body.readUInt32LE(offset + 2) });
  }
  return { pa, chestMask, missionRank, missions };
}

/**
 * 3143 _MSG_RESP_DAILY_UPDATE — push de UN contador, 6 B de body:
 *   [u16 id][u32 value]
 */
export function parse3143(body: Buffer): DailyMissionEntry | null {
  if (body.length < 6) return null;
  return { id: body.readUInt16LE(0), value: body.readUInt32LE(2) };
}
