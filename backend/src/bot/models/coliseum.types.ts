export interface ColiseumRival {
  name: string;
  guildTag: string;
  heroId: number;
  heroData: number[];
}

export interface ColiseumState {
  rank: number;
  fightsDone: number;
  gems: number;
  unknown: string;
  rivals: ColiseumRival[];
}

function isPrintable(b: number): boolean {
  return b >= 0x20 && b <= 0x7e;
}

const RIVAL_SIZE = 52;

/** Parsea la lista de rivales desde un body de proto 5201 o 5205. */
export function parseRivals(body: Buffer, offset: number): ColiseumRival[] {
  const rivals: ColiseumRival[] = [];
  let cursor = offset;
  const len = body.length;

  while (cursor + RIVAL_SIZE <= len) {
    let end = cursor;
    while (end < cursor + 13 && isPrintable(body[end])) end++;
    const name = body.subarray(cursor, end).toString('ascii');
    if (!name) break;

    const guildTag = body.subarray(cursor + 13, cursor + 16).toString('ascii');
    const heroStart = cursor + 16;
    const heroId = body.readUInt32LE(heroStart);
    const heroData: number[] = [];
    for (let i = heroStart + 4; i < heroStart + 36; i += 2) {
      heroData.push(body.readUInt16LE(i));
    }

    rivals.push({ name, guildTag, heroId, heroData });
    cursor += RIVAL_SIZE;
  }

  return rivals;
}

/** Proto 5201 — estado completo del Coliseo (server → cliente). */
export function parseColiseum(body: Buffer): ColiseumState {
  return {
    rank: body.readUInt32LE(0),
    fightsDone: body.readUInt16LE(14),
    gems: body.readUInt32LE(24),
    unknown: body.subarray(4, 30).toString('hex'),
    rivals: parseRivals(body, 30),
  };
}

/** Proto 5205 — rivales del Coliseo (respuesta a 5204, cliente → servidor). */
export function parseColiseumRivals(body: Buffer): ColiseumRival[] {
  return parseRivals(body, 4);
}
