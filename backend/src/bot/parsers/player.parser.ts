import { decodeCoordBytes } from '../../models/map-coords';
import {
  PlayerInfo,
  BuffCategory,
  BuffDefinition,
  BuffInstance,
  PlayerLocationResult,
} from '../models/player.types';

// ── Buff Definitions ──

const ALL_BUFFS: BuffDefinition[] = [
  { id: 0x047A, name: 'Escudo 4h', category: BuffCategory.Shield, durationMs: 4 * 3600 * 1000 },
  { id: 0x041B, name: 'Escudo 8h', category: BuffCategory.Shield, durationMs: 8 * 3600 * 1000 },
  { id: 0x041C, name: 'Escudo 1d', category: BuffCategory.Shield, durationMs: 24 * 3600 * 1000 },
  { id: 0x041D, name: 'Escudo 3d', category: BuffCategory.Shield, durationMs: 3 * 24 * 3600 * 1000 },
  { id: 0x050A, name: 'Furia', category: BuffCategory.Fury, durationMs: 15 * 60 * 1000 },
];

const BUFF_MAP = new Map<number, BuffDefinition>();
for (const b of ALL_BUFFS) BUFF_MAP.set(b.id, b);

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
  const unknownBlock2 = Buffer.from(body.subarray(o, o + 156)); o += 156;
  const energy = body.readUInt32LE(o); o += 4;
  const tail = Buffer.from(body.subarray(o));

  return {
    header, playerId: Number(playerId), playerName, level, unknown1, res,
    timestamp1, timestamp2, timestamp3, fixedFlag, flag2, gems,
    unknownBlock1, castleX: castleCoord.x, castleY: castleCoord.y,
    power: Number(power), kills: Number(kills), vipExp,
    unknownBlock2, energy, tail,
  };
}

// ── Buff Parser ──

export function parseBuffs(data: Buffer): BuffInstance[] {
  if (!data || data.length < 4) return [];
  const count = data[0];
  const offset = 3;
  const entrySize = 14;
  const result: BuffInstance[] = [];
  for (let i = 0; i < count && offset + i * entrySize + entrySize <= data.length; i++) {
    const entryOff = offset + i * entrySize;
    const buffId = data.readUInt16LE(entryOff);
    const known = getBuffDef(buffId);
    if (!known) continue;
    const startTs = Number(data.readBigInt64LE(entryOff + 2));
    const durSec = data.readInt32LE(entryOff + 10);
    const start = new Date(startTs * 1000);
    result.push(new BuffInstance(known, start, durSec * 1000));
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
