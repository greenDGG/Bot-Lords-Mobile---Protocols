import { EventRewardData, EventRewardLevel, EventRewardRecord } from '../models/event-rewards.types';

export function parse3610(body: Buffer): EventRewardData | null {
  if (body.length < 48) return null;

  let off = 0;

  const eventType = body.readUInt16BE(off); off += 2;
  const missionIds: number[] = [];
  for (let i = 0; i < 6; i++) {
    const id = body.readUInt16LE(off); off += 2;
    if (id !== 0) missionIds.push(id);
  }

  const levels: EventRewardLevel[] = [];
  for (let i = 0; i < 3; i++) {
    const gemsEntrega = body.readUInt16LE(off); off += 2;
    off += 2;
    const valorGemas = body.readUInt32LE(off); off += 4;
    const sinValorar = body[off++];
    off++;
    levels.push({ gemsEntrega, valorGemas, sinValorar });
  }

  const c1 = body[off++];
  const c2 = body[off++];
  const c3 = body[off++];
  off++;

  const total = c1 + c2 + c3;
  const records: EventRewardRecord[] = [];
  for (let i = 0; i < total && off + 3 <= body.length; i++) {
    const itemId = body.readUInt16LE(off);
    const amount = body[off + 2];
    off += 4;
    records.push({ itemId, amount });
  }

  return {
    eventType,
    missionIds: missionIds as [number, ...number[]],
    levels: levels as [EventRewardLevel, EventRewardLevel, EventRewardLevel],
    counts: [c1, c2, c3],
    records,
  };
}
