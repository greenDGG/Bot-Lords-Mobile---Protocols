import { TALENT_COUNT } from '../data/talent-db';

export interface TalentInfo {
  /** puntos de talento sin asignar */
  unassigned: number;
  /** nivel de cada talento, indexado por talentId - 1 */
  levels: number[];
}

/**
 * 3801 _MSG_RESP_TALENTINFO (S→C). Llega como push de login, sin request.
 *
 * body (102 B):
 *   u16 LE @0   = puntos sin asignar
 *   47 x u8 @2  = nivel del talento id 1..47
 *   @49..101    = reservado (siempre 0 en las 43 capturas vistas)
 */
export function parse3801(body: Buffer): TalentInfo | null {
  const count = TALENT_COUNT;
  if (count <= 0 || body.length < 2 + count) return null;
  const unassigned = body.readUInt16LE(0);
  const levels: number[] = [];
  for (let i = 0; i < count; i++) levels.push(body[2 + i]);
  return { unassigned, levels };
}
