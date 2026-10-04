export interface SpeedupUseResult {
  ok: boolean;
  status?: number;
  itemId?: number;
  qtyLeft?: number;
  fieldA?: number;
  extra16?: number;
  newStartTs?: number;
  newTimeSec?: number;
  arrivalTs?: number;
  tsOffset?: number;
}

const TS_MIN = 1500000000;
const TS_MAX = 2200000000;
const MAX_DURATION_SEC = 60 * 60 * 24 * 400;
const MIN_BODY_SIZE = 19;

const LAYOUTS = [
  { tsOffset: 7, hasExtra: false },
  { tsOffset: 11, hasExtra: true },
];

export function parse1407(body: Buffer): SpeedupUseResult {
  if (body.length < MIN_BODY_SIZE) return { ok: false };

  const status = body.readUInt8(0);
  const itemId = body.readUInt16LE(1);
  if (itemId === 0) return { ok: false, status };

  const qtyLeft = body.readUInt16LE(3);
  const fieldA = body.readUInt16LE(5);

  for (const layout of LAYOUTS) {
    if (layout.tsOffset + 12 > body.length) continue;
    const newStartTs = body.readUInt32LE(layout.tsOffset);
    const newTimeSec = body.readUInt32LE(layout.tsOffset + 8);
    if (newStartTs < TS_MIN || newStartTs > TS_MAX) continue;
    if (newTimeSec <= 0 || newTimeSec > MAX_DURATION_SEC) continue;
    return {
      ok: true,
      status,
      itemId,
      qtyLeft,
      fieldA,
      extra16: layout.hasExtra ? body.readUInt16LE(7) : undefined,
      newStartTs,
      newTimeSec,
      arrivalTs: newStartTs + newTimeSec,
      tsOffset: layout.tsOffset,
    };
  }

  return { ok: false, status, itemId, qtyLeft, fieldA };
}
