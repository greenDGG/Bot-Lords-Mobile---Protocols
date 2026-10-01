import { ResearchData, TECH_COUNT } from '../models/research.types';

const HEADER_SIZE = 15;
const TAIL_SIZE = 250;
const BODY_SIZE = HEADER_SIZE + TAIL_SIZE;

/**
 * 3201 (265 bytes): cabecera de 15 B + AllTechData de 250 B.
 *
 * Cabecera:
 *   [0..1]  u16 LE  id de la investigación activa (0 = ninguna)
 *   [2]     u8      nivel que se está investigando
 *   [3..6]  u32 LE  timestamp del servidor
 *   [7..10] u32 LE  reservado
 *   [11..14] u32 LE segundos restantes
 *
 * Cola (AllTechData): 500 niveles empaquetados, 2 por byte.
 *   id impar  -> nibble bajo, id par -> nibble alto.
 */
export function parse3201(body: Buffer): ResearchData | null {
  if (body.length < BODY_SIZE) return null;

  const techLevels = new Array<number>(TECH_COUNT);
  const tail = HEADER_SIZE;
  for (let id = 1; id <= TECH_COUNT; id++) {
    const byte = body[tail + ((id - 1) >> 1)];
    techLevels[id - 1] = id % 2 === 1 ? byte & 0x0f : (byte >> 4) & 0x0f;
  }

  return {
    techLevels,
    activeTechId: body.readUInt16LE(0),
    activeLevel: body[2],
    timestamp: body.readUInt32LE(3),
    remainingSeconds: body.readUInt32LE(11),
  };
}

export function isActiveResearch(data: ResearchData): boolean {
  return data.activeTechId > 0 && data.remainingSeconds > 0;
}
