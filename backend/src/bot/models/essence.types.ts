export interface EssenceTransmutationSlot {
  index: number;
  essenceLevel: number;
  finishTimestamp: number;
  baseMinutes: number;
  isRunning: boolean;
  isEmpty: boolean;
}

export interface EssenceTransmutationState {
  slots: EssenceTransmutationSlot[];
  rawUnknown: number;
  autoStoreLevel: number;
}

export function parse7317(body: Buffer): EssenceTransmutationState | null {
  if (body.length < 41) return null;

  const slots: EssenceTransmutationSlot[] = [];
  for (let i = 0; i < 3; i++) {
    const off = i * 12;
    const essenceLevel = body.readUInt16LE(off);
    const finishTimestamp = body.readUInt32LE(off + 2);
    // bytes 6-9 reserved, skip
    const baseMinutes = body.readUInt16LE(off + 10);
    slots.push({
      index: i + 1,
      essenceLevel,
      finishTimestamp,
      baseMinutes,
      isRunning: finishTimestamp !== 0,
      isEmpty: essenceLevel === 0,
    });
  }

  const rawUnknown = body.readUInt32LE(36);
  const autoStoreLevel = body[40];

  return { slots, rawUnknown, autoStoreLevel };
}
