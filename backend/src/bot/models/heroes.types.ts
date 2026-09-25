import { heroName } from '../data/hero-ids';

export interface HeroEntry {
  heroId: number;
  level: number;
  unknown1: Buffer;
  rank: number;
  grade: number;
  trailing: Buffer;
}

/**
 * Proto 1201 — Lista de héroes del jugador.
 *
 * Formato por entrada (después del header de9 bytes):
 *   2 bytes: heroId (uint16 LE)
 *   1 byte:  level
 *   4 bytes: unknown1
 *   1 byte:  rank (1-8)
 *   1 byte:  grade (1-5)
 *   9-10 bytes: trailing (varía según rank/grade)
 */
export function parseHeroList(body: Buffer): HeroEntry[] {
  const heroes: HeroEntry[] = [];
  let offset = 9; // saltar header inicial (fdebf668 00000000 19)

  while (offset + 18 <= body.length) {
    const heroId = body.readUInt16LE(offset);
    if (heroId === 0) break; // fin de lista
    const level = body[offset + 2];
    const unknown1 = body.subarray(offset + 3, offset + 7);
    const rank = body[offset + 7];
    const grade = body[offset + 8];

    // El trailing varía: rank 7-8 tiene ~9 bytes, otros pueden tener más
    let trailLen = 9;
    if (offset + 9 + 10 <= body.length) {
      // Detectar si hay byte extra (0x14 al final suele indicar rank alto)
      const peek = body[offset + 9 + 9];
      if (peek === 0x14 || peek === 0x00) trailLen = 10;
    }
    const trailing = body.subarray(offset + 9, offset + 9 + trailLen);

    heroes.push({ heroId, level, unknown1, rank, grade, trailing });
    offset += 9 + trailLen;
  }

  return heroes;
}

export function formatHeroList(heroes: HeroEntry[]): string {
  return heroes.map(h =>
    `  ${heroName(h.heroId)} (0x${h.heroId.toString(16).padStart(4,'0')}) — lvl ${h.level} rank ${h.rank} grade ${h.grade}`
  ).join('\n');
}
