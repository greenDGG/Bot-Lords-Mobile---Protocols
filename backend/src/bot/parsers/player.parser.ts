import { decodeCoordBytes } from '../../models/map-coords';
import {
  PlayerInfo,
  BuffCategory,
  BuffDefinition,
  BuffInstance,
  PlayerLocationResult,
} from '../models/player.types';

// ── Buff Definitions ──
//
// `id` es el **itemId** del objeto que otorga el buff (segundo campo de cada
// entrada del proto 1111, y el mismo número que usa `items.json`). El 1er campo
// de la entrada es el buffId de la tabla `buff.bytes` (varios itemIds pueden
// compartir buffId: 0x041B/0x041C/0x041D/0x0507 son todos buffId 2 = "Escudo").
// `durationMs` es sólo el nominal del ítem; el valor real siempre viene en el
// paquete (durSec). Documentación completa: docs/protocols/1111.md.

const ALL_BUFFS: BuffDefinition[] = [
  // Escudos (buffId 2) + mantenimiento (buffId 1)
  { id: 0x047A, name: 'Escudo 4h', category: BuffCategory.Shield, durationMs: 4 * 3600 * 1000 },
  { id: 0x041B, name: 'Escudo 8h', category: BuffCategory.Shield, durationMs: 8 * 3600 * 1000 },
  { id: 0x041C, name: 'Escudo 1d', category: BuffCategory.Shield, durationMs: 24 * 3600 * 1000 },
  { id: 0x041D, name: 'Escudo 3d', category: BuffCategory.Shield, durationMs: 3 * 24 * 3600 * 1000 },
  { id: 0x0507, name: 'Escudo 7d', category: BuffCategory.Shield, durationMs: 7 * 24 * 3600 * 1000 },
  { id: 0x054A, name: 'Escudo de Mantenimiento', category: BuffCategory.Shield, durationMs: 5 * 60 * 1000 },
  // Furia (buffId 27)
  { id: 0x050A, name: 'Furia', category: BuffCategory.Fury, durationMs: 15 * 60 * 1000 },
  // Anti-exploración (buffId 5)
  { id: 0x047B, name: 'Antiexplor. 4h', category: BuffCategory.AntiScout, durationMs: 4 * 3600 * 1000 },
  { id: 0x0484, name: 'Antiexplor. 8h', category: BuffCategory.AntiScout, durationMs: 8 * 3600 * 1000 },
  { id: 0x041E, name: 'Antiexplor. 24h', category: BuffCategory.AntiScout, durationMs: 24 * 3600 * 1000 },
  { id: 0x0420, name: 'Antiexplor. 7d', category: BuffCategory.AntiScout, durationMs: 7 * 24 * 3600 * 1000 },
  // ATQ / DEF de ejército (buffId 3 / 4)
  { id: 0x0421, name: 'Potenc. ATQ ejército 20%', category: BuffCategory.ArmyAtk, durationMs: 4 * 3600 * 1000 },
  { id: 0x0487, name: 'Potenc. ATQ ejército 20%', category: BuffCategory.ArmyAtk, durationMs: 4 * 3600 * 1000 },
  { id: 0x0422, name: 'Potenc. DEF ejército 20%', category: BuffCategory.ArmyDef, durationMs: 4 * 3600 * 1000 },
  { id: 0x0488, name: 'Potenc. DEF ejército 20%', category: BuffCategory.ArmyDef, durationMs: 4 * 3600 * 1000 },
  // Tamaño de ejército (buffId 6)
  { id: 0x0424, name: 'Potenc. tamaño ejército 20%', category: BuffCategory.ArmySize, durationMs: 4 * 3600 * 1000 },
  { id: 0x0428, name: 'Potenc. tamaño ejército 50%', category: BuffCategory.ArmySize, durationMs: 4 * 3600 * 1000 },
  // Recolección (buffId 16) y entrenamiento (buffId 25); viaje sin buffId confirmado
  { id: 0x040D, name: 'Potenc. recolección 50%', category: BuffCategory.Gather, durationMs: 24 * 3600 * 1000 },
  { id: 0x04F7, name: 'Potenc. entrenamiento 10%', category: BuffCategory.Train, durationMs: 4 * 3600 * 1000 },
  { id: 0x0474, name: 'Potenc. viaje 50%', category: BuffCategory.March, durationMs: 4 * 3600 * 1000 },
];

const BUFF_MAP = new Map<number, BuffDefinition>();
for (const b of ALL_BUFFS) BUFF_MAP.set(b.id, b);

/** Definiciones conocidas (por itemId). Para documentación/tests. */
export function getKnownBuffs(): readonly BuffDefinition[] {
  return ALL_BUFFS;
}

/**
 * Resuelve la definición de un buff por su **itemId**. Si el ítem no está en
 * la lista se devuelve un genérico (categoría `Other`) para no perderlo.
 */
export function getBuffDef(id: number): BuffDefinition | undefined {
  return BUFF_MAP.get(id);
}

// ── Player Info Parser ──

function decodeCastleCoord(b0: number, b1: number, b2: number): { x: number; y: number } {
  const xiHigh = b0 & 0x0F;
  const xiLow = b2 & 0x0F;
  const yiLow = b2 >> 5;
  const yiMid = (b0 >> 4) & 0x0F;
  const yiHigh = b1;
  const xi = (xiHigh << 4) | xiLow;
  const yi = (yiHigh << 7) | (yiMid << 3) | yiLow;
  return { x: xi * 2, y: yi * 2 };
}

function readFixedAscii(buf: Buffer, offset: number, maxLen: number): string {
  let end = offset;
  const limit = Math.min(offset + maxLen, buf.length);
  while (end < limit && buf[end] !== 0) end++;
  return buf.toString('ascii', offset, end);
}

export function parsePlayerInfo(body: Buffer): PlayerInfo {
  let o = 0;
  const header = body.readUInt32LE(o); o += 4;
  const playerId = body.readBigUInt64LE(o); o += 8;
  const playerName = readFixedAscii(body, o, 15); o += 15;
  const level = body[o++];
  const unknown1 = body.readUInt32LE(o); o += 4;
  const res = body.readUInt16LE(o); o += 2;
  const timestamp1 = new Date(body.readUInt32LE(o) * 1000); o += 8;
  const timestamp2 = new Date(body.readUInt32LE(o) * 1000); o += 8;
  const timestamp3 = new Date(body.readUInt32LE(o) * 1000); o += 8;
  const fixedFlag = body.readUInt16LE(o); o += 2;
  const flag2 = body.readUInt16LE(o); o += 2;
  const gems = body.readUInt16LE(o); o += 2;
  const unknownBlock1 = Buffer.from(body.subarray(o, o + 126)); o += 126;
  const castleCoord = decodeCastleCoord(unknownBlock1[111]!, unknownBlock1[112]!, unknownBlock1[113]!);
  const power = body.readBigUInt64LE(o); o += 8;
  const kills = body.readBigUInt64LE(o); o += 8;
  const vipExp = body.readUInt32LE(o); o += 4;
  // Offset 210: creación de la cuenta (redondeada a la hora); define el reset
  // diario de esta cuenta. docs/protocols/1008.md
  const accountCreatedAt = new Date((body.length >= 214 ? body.readUInt32LE(o) : 0) * 1000);
  const unknownBlock2 = Buffer.from(body.subarray(o, o + 156)); o += 156;
  const energy = body.readUInt32LE(o); o += 4;
  const tail = Buffer.from(body.subarray(o));

  return {
    header, playerId: Number(playerId), playerName, level, unknown1, res,
    timestamp1, timestamp2, timestamp3, fixedFlag, flag2, gems,
    unknownBlock1, castleX: castleCoord.x, castleY: castleCoord.y,
    power: Number(power), kills: Number(kills), vipExp,
    accountCreatedAt, unknownBlock2, energy, tail,
  };
}

// ── Buff Parser ──
//
// Proto 1111 = snapshot completo de los buffs activos del jugador
// (docs/protocols/1111.md):
//
//   offset  tamaño  campo
//   ------  ------  ---------------------------------------------
//     0       1     u8   count (cantidad de buffs activos)
//     1      16·n   entries de 16 B:
//                     +0  u16  buffId   (id en la tabla `buff.bytes`)
//                     +2  u16  itemId   (objeto que otorga el buff)
//                     +4  i64  startTs  (unix seconds)
//                    +12  i32  durSec   (duración total en segundos)
//
// El 1er campo es el identificador del buff y el 2do el del ítem; varios
// itemIds comparten buffId (los 4 escudos = buffId 2), por eso se indexa por
// itemId, que es el que trae el nombre en `items.json` y el que ya usan
// `setShield`/`setFury`/`expire`.

/** Tamaño de cada entrada del proto 1111. */
export const BUFF_ENTRY_SIZE = 16;

/**
 * Parsea el body del proto 1111.
 *
 * Devuelve la lista de buffs activos (vacía si `count = 0`) o `null` si el
 * paquete está mal formado (count que no cabe en el body): en ese caso el
 * caller NO debe tocar el estado.
 */
export function parseBuffs(data: Buffer): BuffInstance[] | null {
  if (!data || data.length < 1) return null;
  const count = data[0];
  if (data.length < 1 + count * BUFF_ENTRY_SIZE) return null;
  const result: BuffInstance[] = [];
  for (let i = 0; i < count; i++) {
    const off = 1 + i * BUFF_ENTRY_SIZE;
    const itemId = data.readUInt16LE(off + 2);
    const startTs = Number(data.readBigInt64LE(off + 4));
    const durSec = data.readInt32LE(off + 12);
    const def = getBuffDef(itemId) ?? {
      id: itemId,
      name: `Buff 0x${itemId.toString(16).toUpperCase().padStart(4, '0')}`,
      category: BuffCategory.Other,
      durationMs: durSec * 1000,
    };
    result.push(new BuffInstance(def, new Date(startTs * 1000), durSec * 1000));
  }
  return result;
}

// ── Player Location Parsers ──

export function parse2205(buf: Buffer): PlayerLocationResult | null {
  if (buf.length < 4) return null;
  const status = buf[0];
  const coordBytes: [number, number, number] = [buf[1], buf[2], buf[3]];

  if (status === 0x00) {
    const coord = decodeCoordBytes(coordBytes);
    return { sameRealm: true, coordBytes, x: coord.x, y: coord.y };
  }

  return { sameRealm: false, coordBytes: [0, 0, 0], x: 0, y: 0 };
}

export function build2204Payload(name: string): Buffer {
  const buf = Buffer.alloc(13);
  buf.write(name, 0, 'utf8');
  return buf;
}

export function build1109Payload(name: string): Buffer {
  const buf = Buffer.alloc(13);
  buf.write(name, 0, 'utf8');
  return buf;
}

export function parse1110(buf: Buffer): { valid: boolean } | null {
  if (buf.length < 1) return null;
  return { valid: buf[0] === 0x00 };
}
