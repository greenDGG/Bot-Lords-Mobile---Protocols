'use strict';

const TOTAL_SIZE = 59;

function parse3638(buf) {
  if (buf.length < TOTAL_SIZE) return null;

  let off = 0;

  const unknown = buf[off]; off += 1;
  const missionId = buf[off] | (buf[off + 1] << 8); off += 2;
  const level = buf[off]; off += 1;
  const remaining = buf[off]; off += 1;
  const endTimestamp = buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24); off += 4;
  const separator1 = buf.slice(off, off + 4); off += 4;
  const timeMinutes = buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24); off += 4;
  const startTimestamp = buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24); off += 4;
  const reserved = buf.slice(off, off + 12); off += 12;
  const missionType = buf[off]; off += 1;
  const specialFlag = buf[off] === 1; off += 1;

  const appearanceTimestamp200 = buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24); off += 4;
  const separator200 = buf.slice(off, off + 4); off += 4;
  const level200 = buf[off]; off += 1;
  const missionId200 = buf[off] | (buf[off + 1] << 8); off += 2;
  const completed200 = buf[off]; off += 1;

  const appearanceTimestamp120 = buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24); off += 4;
  const separator120 = buf.slice(off, off + 4); off += 4;
  const level120 = buf[off]; off += 1;
  const missionId120 = buf[off] | (buf[off + 1] << 8); off += 2;
  const completed120 = buf[off]; off += 1;

  return {
    activeMission: {
      unknown,
      missionId,
      level,
      remaining,
      endTimestamp,
      separator1: Buffer.from(separator1),
      timeMinutes,
      startTimestamp,
      reserved: Buffer.from(reserved),
      missionType,
      specialFlag,
    },
    mission200: {
      appearanceTimestamp: appearanceTimestamp200,
      separator: Buffer.from(separator200),
      level: level200,
      missionId: missionId200,
      completed: completed200,
    },
    mission120: {
      appearanceTimestamp: appearanceTimestamp120,
      separator: Buffer.from(separator120),
      level: level120,
      missionId: missionId120,
      completed: completed120,
    },
  };
}

module.exports = { parse3638 };
