import { heroName, heroNameEn, heroSkills, heroBattleSkills } from '../data/heros-db';

export interface HeroEntry {
  heroId: number;
  level: number;
  /** u32 en +3: aparente EXP/poder acumulada (máx observado 174617) */
  power: number;
  rank: number;
  grade: number;
  /** u8 en +9 (0-63), sin identificar */
  unknown: number;
}

/** Forma en que se envía la lista al frontend (nombres ya resueltos). */
export interface HeroView {
  heroId: number;
  name: string;
  nameEn: string;
  level: number;
  power: number;
  rank: number;
  grade: number;
  skills: { id: number; name: string; nameEn: string }[];
  battleSkills: { id: number; name: string; nameEn: string }[];
}

/**
 * Proto 1201 — Lista de héroes del jugador.
 *
 * Wire por entrada (20 bytes):
 *   +0  u16 LE  heroId (1..1000)
 *   +2  u8      level  (1..60)
 *   +3  u32 LE  power/EXP acumulada (1..174617)
 *   +7  u8      rank   (1..8)
 *   +8  u8      grade  (1..5)
 *   +9  u8      unknown (0..63)
 *   +10 6 bytes ceros
 *   +16 u16     0x3c3c (constante)
 *   +18 u16     0x1428 (constante)
 *
 * Header: 4 bytes de magic + 4 bytes `00000000` + count. El count es u16 en
 * la hipótesis de header de 10 bytes y u8 en la de 9 bytes; la fuente real no
 * está capturada, así que se prueban ambas alineaciones (y también entries de
 * 19 bytes) y se elige la que cuadre con count, longitud del buffer y los
 * rangos de level/rank/grade. Si ninguna valida, se usa la lectura laxa
 * (header 10 / entry 20) con el count del header.
 */

const LAYOUTS: { headerLen: number; entryLen: number }[] = [
  { headerLen: 10, entryLen: 20 },
  { headerLen: 9, entryLen: 20 },
  { headerLen: 10, entryLen: 19 },
  { headerLen: 9, entryLen: 19 },
];

function readCount(body: Buffer, headerLen: number): number {
  return headerLen === 10 ? body.readUInt16LE(8) : body[8];
}

function readEntry(body: Buffer, off: number): HeroEntry {
  return {
    heroId: body.readUInt16LE(off),
    level: body[off + 2],
    power: body.readUInt32LE(off + 3),
    rank: body[off + 7],
    grade: body[off + 8],
    unknown: body[off + 9],
  };
}

function entryOk(e: HeroEntry): boolean {
  return e.heroId > 0 && e.heroId <= 1000 && e.level <= 60 && e.rank <= 8 && e.grade <= 5;
}

function tryLayout(body: Buffer, headerLen: number, entryLen: number, strict: boolean): HeroEntry[] | null {
  if (body.length < headerLen + entryLen) return null;
  const rest = body.length - headerLen;
  const available = Math.floor(rest / entryLen);
  const count = readCount(body, headerLen);
  if (strict) {
    if (rest % entryLen !== 0 || count !== available) return null;
  }
  const n = Math.min(count, available);
  if (n <= 0) return null;
  const out: HeroEntry[] = [];
  for (let i = 0; i < n; i++) {
    const off = headerLen + i * entryLen;
    const e = readEntry(body, off);
    if (!entryOk(e)) return null;
    // en la lectura laxa la firma 0x3c3c (+16) descarta alineaciones rotas
    if (!strict && entryLen === 20 && body.readUInt16LE(off + 16) !== 0x3c3c) return null;
    out.push(e);
  }
  return out;
}

export interface ParsedHeroList {
  heroes: HeroEntry[];
  /** ej. `header 10 / entry 20` */
  layout: string;
  /** false = se usó la lectura laxa (algún byte sobrante o falta) */
  strict: boolean;
}

export function parseHeroListDetailed(body: Buffer): ParsedHeroList {
  for (const { headerLen, entryLen } of LAYOUTS) {
    const heroes = tryLayout(body, headerLen, entryLen, true);
    if (heroes) return { heroes, layout: `header ${headerLen} / entry ${entryLen}`, strict: true };
  }
  for (const { headerLen, entryLen } of LAYOUTS) {
    const heroes = tryLayout(body, headerLen, entryLen, false);
    if (heroes) return { heroes, layout: `header ${headerLen} / entry ${entryLen}`, strict: false };
  }
  return { heroes: [], layout: 'sin layout válido', strict: false };
}

export function parseHeroList(body: Buffer): HeroEntry[] {
  return parseHeroListDetailed(body).heroes;
}

/** Lista con nombres ES/EN y skills resueltas, para enviar por socket. */
export function serializeHeroes(heroes: HeroEntry[]): HeroView[] {
  return heroes.map(h => ({
    heroId: h.heroId,
    name: heroName(h.heroId),
    nameEn: heroNameEn(h.heroId),
    level: h.level,
    power: h.power,
    rank: h.rank,
    grade: h.grade,
    skills: heroSkills(h.heroId).map(s => ({ id: s.id, name: s.name, nameEn: s.nameEn })),
    battleSkills: heroBattleSkills(h.heroId).map(s => ({ id: s.id, name: s.name, nameEn: s.nameEn })),
  }));
}

export function formatHeroList(heroes: HeroEntry[]): string {
  return heroes.map(h =>
    `  ${heroName(h.heroId)} (id ${h.heroId}) — nivel ${h.level} rango ${h.rank} grado ${h.grade}`
  ).join('\n');
}
