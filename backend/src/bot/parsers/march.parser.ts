import { TroopTier } from '../../models/troop-state';
import {
  MarchIncomingPacket,
  MarchUpdatePacket,
  MarchPacket,
  MarchTroopEntry,
  MarchHeroEntry,
  TYPE_ORDER,
  TIER_MASK_VALUES,
} from '../models/march.types';

// ── March Incoming Parser ──

export function parseMarchIncoming(body: Buffer): MarchIncomingPacket | null {
  if (body.length < 18) return null;

  let offset = 0;
  const marchId = body.readUInt32LE(offset); offset += 4;
  const marchType = body.readUInt16LE(offset); offset += 2;
  const startTimestamp = body.readUInt32LE(offset); offset += 4;
  const unknown2 = body.readUInt32LE(offset); offset += 4;
  const seconds = body.readUInt32LE(offset); offset += 4;
  const rawTail = body.subarray(offset);

  return { marchId, marchType, startTimestamp, unknown2, seconds, rawTail };
}

// ── March Update Parser ──

export function parseMarchUpdate(body: Buffer): MarchUpdatePacket | null {
  if (body.length < 16) return null;

  let offset = 4; // skip header
  const marchId = body.readUInt32LE(offset); offset += 4;
  const arrivalTimestamp = body.readUInt32LE(offset); offset += 4;
  const rawUnknown = body.readUInt32LE(offset);

  return { marchId, arrivalTimestamp, rawUnknown };
}

// ── March Full Packet Parser ──

const HEADER_SEP = 5;
const HEADER_NAME = 13;
const HEADER_TAG = 3;
const HEADER_TROOP_CNT = 23;
const HEADER_HERO_CNT = 27;
const DATA_START = 31;

// Line types from EWATCHTOWER_LINE_TYPE
const LINE_TYPE_ATTACK = 5;
const LINE_TYPE_SCOUT = 8;
const LINE_TYPE_REINFORCE = 10;
const LINE_TYPE_RALLY = 12;

const LINE_TYPE_LABELS: Record<number, string> = {
  [LINE_TYPE_ATTACK]: 'ataque',
  [LINE_TYPE_SCOUT]: 'exploración',
  [LINE_TYPE_REINFORCE]: 'refuerzo',
  [LINE_TYPE_RALLY]: 'rally',
};

/** Etiqueta legible del lineType del 2446 (null si no se conoce). */
export function lineTypeLabel(lineType: number): string | null {
  return LINE_TYPE_LABELS[lineType] ?? null;
}

function readCString(body: Buffer, offset: number, len: number): string {
  let end = offset;
  const max = offset + len;
  while (end < max && body[end] !== 0) end++;
  return body.toString('ascii', offset, end);
}

function parseScoutOrShort(body: Buffer, debugLog?: (msg: string) => void): MarchPacket | null {
  const lineType = body[0];
  const attackerName = readCString(body, HEADER_SEP, HEADER_NAME);
  const guildTag = readCString(body, HEADER_SEP + HEADER_NAME, HEADER_TAG);
  const label = lineTypeLabel(lineType) ?? `tipo=${lineType}`;

  debugLog?.(`[PARSE] short packet lineType=${lineType} (${label}) name="${attackerName}" tag="${guildTag}" len=${body.length}`);

  const rawHeader = body.subarray(0, Math.min(body.length, DATA_START));

  return {
    lineType,
    rawHeader, attackerName, guildTag,
    totalTroops: 0, totalGroups: 0,
    heroCount: 0, tierMask: 0, tiersPresent: [],
    unknownFlag: 0, leaderFlag: 0,
    troops: [], heroes: [],
    rawBuffs: Buffer.alloc(0), rawT5Flags: Buffer.alloc(0),
    t5Troops: [], rawFooter: Buffer.alloc(0),
  };
}

export function parseMarch(body: Buffer, debugLog?: (msg: string) => void): MarchPacket | null {
  if (body.length < HEADER_SEP + HEADER_NAME + HEADER_TAG) {
    debugLog?.(`[PARSE] body too short: ${body.length} < ${HEADER_SEP + HEADER_NAME + HEADER_TAG}`);
    return null;
  }

  const lineType = body[0];

  if (lineType !== LINE_TYPE_ATTACK) {
    return parseScoutOrShort(body, debugLog);
  }

  if (body.length < DATA_START + 20) {
    debugLog?.(`[PARSE] attack body too short: ${body.length} < ${DATA_START + 20}`);
    return null;
  }

  let offset = DATA_START;

  const rawHeader = body.subarray(0, DATA_START);
  const attackerName = readCString(body, HEADER_SEP, HEADER_NAME);
  const guildTag = readCString(body, HEADER_SEP + HEADER_NAME, HEADER_TAG);
  const totalTroops = body.readUInt32LE(HEADER_TROOP_CNT);
  const heroCount = body[HEADER_HERO_CNT];
  const troopTypes = body[HEADER_HERO_CNT + 1];
  debugLog?.(`[PARSE] dataStart=${DATA_START} name="${attackerName}" tag="${guildTag}" totalTroops=${totalTroops} heroCount=${heroCount} troopTypes=0x${troopTypes.toString(16)}`);

  const totalGroups = totalTroops;
  const heroIds: number[] = [];

  // Tropas T1-T4 (16×uint32)
  const troops: MarchTroopEntry[] = [];
  let troopIdx = 0;
  for (const type of TYPE_ORDER) {
    for (let tierNum = 1; tierNum <= 4; tierNum++) {
      const count = body.readUInt32LE(offset + troopIdx * 4);
      troops.push({ type, tier: tierNum as TroopTier, count });
      troopIdx++;
    }
  }
  offset += 64;

  let tierMask = 0;
  for (const t of troops) if (t.count > 0) tierMask |= (1 << (t.tier - 1));
  const unknownFlag = 0;
  const leaderFlag = totalTroops > 0 ? 5 : 0;

  // Heroes
  const heroes: MarchHeroEntry[] = [];
  for (let i = 0; i < heroCount; i++) {
    heroIds.push(body.readUInt16LE(offset));
    offset += 2;
  }
  for (let i = 0; i < heroCount; i++) {
    const rank = body[offset];
    const grade = body[offset + 1];
    heroes.push({ heroId: heroIds[i], rank, grade });
    offset += 2;
  }

  // Buffs
  const buffsLen = Math.max(0, 32 - heroCount * 4);
  const rawBuffs = body.length >= offset + buffsLen ? body.subarray(offset, offset + buffsLen) : Buffer.alloc(0);
  offset += buffsLen;

  // T5 flags
  const rawT5Flags = body.subarray(offset, offset + 3);
  debugLog?.(`[PARSE] T5 flags: ${rawT5Flags.toString('hex')} offset=${offset}`);

  // Tropas T5
  const t5Troops: MarchTroopEntry[] = [];
  for (let i = 0; i < 4; i++) {
    const count = body.readUInt32LE(offset + 3 + i * 4);
    t5Troops.push({ type: TYPE_ORDER[i], tier: TroopTier.T5, count });
  }
  debugLog?.(`[PARSE] T5 troops raw: ${body.subarray(offset, offset + 19).toString('hex')}`);
  offset += 3 + 16;

  const rawFooter = body.subarray(offset);

  const tiersPresent: TroopTier[] = [];
  for (const [mask, tier] of Object.entries(TIER_MASK_VALUES)) {
    if (tierMask & Number(mask)) tiersPresent.push(tier);
  }
  return {
    lineType,
    rawHeader, attackerName, guildTag,
    totalTroops, totalGroups,
    heroCount, tierMask, tiersPresent, unknownFlag, leaderFlag,
    troops, heroes, rawBuffs, rawT5Flags, t5Troops, rawFooter,
  };
}
