import { missionName } from '../data/extravagant-mission-ids';
import {
  MissionEntry,
  MissionData,
  FdgMissionExtensionData,
  MissionRecordData,
  MissionRecord,
} from '../models/missions.types';

// ── Extravagant Missions (9652/9661/9663) ──

const ENTRY_SIZE = 19;

export function parse9652(body: Buffer, hasProgress = true): MissionData | null {
  if (body.length < 1) return null;

  let off = 0;
  let progress = 0;
  if (hasProgress) {
    if (body.length < 4) return null;
    progress = body.readUInt32LE(off); off += 4;
  } else {
    if (body[0] === 0x00) off = 1;
  }

  const now = Math.floor(Date.now() / 1000);
  const allEntries: MissionEntry[] = [];
  while (off + ENTRY_SIZE <= body.length) {
    const missionId = body.readUInt16LE(off);
    const timestamp = body.readUInt32LE(off + 2);
    const total = body.readUInt32LE(off + 10);
    const points = body.readUInt8(off + 18);
    const available = timestamp <= now;
    allEntries.push({ missionId, name: missionName(missionId), timestamp, total, points, available });
    off += ENTRY_SIZE;
  }

  let activeMission: MissionEntry | null = null;
  let missions: MissionEntry[];

  if (hasProgress && allEntries.length > 0) {
    activeMission = allEntries[0];
    missions = allEntries.slice(1);
  } else {
    missions = allEntries;
  }

  return { progress, activeMission, missions };
}

// ── FDG Mission Extension (3638) ──

const ACTIVE_SIZE = 35;
const SLOT_SIZE = 12;
const TOTAL_SIZE = ACTIVE_SIZE + SLOT_SIZE + SLOT_SIZE;

export function parse3638(body: Buffer): FdgMissionExtensionData | null {
  if (body.length < TOTAL_SIZE) return null;

  let off = 0;

  const unknown = body[off]; off += 1;
  const missionId = body.readUInt16LE(off); off += 2;
  const level = body[off]; off += 1;
  const remaining = body[off]; off += 1;
  const endTimestamp = body.readUInt32LE(off); off += 4;
  const separator1 = Buffer.from(body.subarray(off, off + 4)); off += 4;
  const timeMinutes = body.readUInt32LE(off); off += 4;
  const startTimestamp = body.readUInt32LE(off); off += 4;
  const reserved = Buffer.from(body.subarray(off, off + 12)); off += 12;
  const missionType = body[off]; off += 1;
  const specialFlag = body[off] === 1; off += 1;

  const appearanceTimestamp200 = body.readUInt32LE(off); off += 4;
  const separator200 = Buffer.from(body.subarray(off, off + 4)); off += 4;
  const level200 = body[off]; off += 1;
  const missionId200 = body.readUInt16LE(off); off += 2;
  const completed200 = body[off]; off += 1;

  const appearanceTimestamp120 = body.readUInt32LE(off); off += 4;
  const separator120 = Buffer.from(body.subarray(off, off + 4)); off += 4;
  const level120 = body[off]; off += 1;
  const missionId120 = body.readUInt16LE(off); off += 2;
  const completed120 = body[off]; off += 1;

  return {
    activeMission: {
      unknown, missionId, level, remaining, endTimestamp,
      separator1, timeMinutes, startTimestamp, reserved,
      missionType, specialFlag,
    },
    mission200: {
      appearanceTimestamp: appearanceTimestamp200, separator: separator200,
      level: level200, missionId: missionId200, completed: completed200,
    },
    mission120: {
      appearanceTimestamp: appearanceTimestamp120, separator: separator120,
      level: level120, missionId: missionId120, completed: completed120,
    },
  };
}

// ── Mission Records (3633) ──

const HEADER_SIZE = 4;
const RECORD_SIZE = 10;
const WAITING_MARKER = 0x03e9;

export function parse3633(body: Buffer): MissionRecordData | null {
  if (body.length < HEADER_SIZE) return null;

  const header = body.subarray(0, HEADER_SIZE);
  const records: MissionRecord[] = [];

  for (let off = HEADER_SIZE; off + RECORD_SIZE <= body.length; off += RECORD_SIZE) {
    const first2 = body.readUInt16LE(off);

    if (first2 === WAITING_MARKER) {
      records.push({
        type: 'waiting',
        status: first2,
        timestamp: body.readUInt32LE(off + 2),
      });
    } else {
      records.push({
        type: 'normal',
        missionId: body.readUInt16LE(off),
        level: body[off + 2],
        unknown3: Buffer.from(body.subarray(off + 3, off + 6)),
      });
    }
  }

  return { header: Buffer.from(header), records };
}
