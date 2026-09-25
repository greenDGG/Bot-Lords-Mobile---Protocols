export interface QuestMission {
  index: number;
  completed: boolean;
}

export interface QuestMemory {
  type: 'admin' | 'guild';
  endTimestamp: number;
  missions: QuestMission[];
  count: number;
  completedCount: number;
  pendingCount: number;
}

export function parse3112(body: Buffer): QuestMemory | null {
  if (body.length < 19) return null;
  const typeVal = body[1];
  const type = typeVal === 1 ? 'admin' : typeVal === 2 ? 'guild' : null;
  if (!type) return null;
  const endTimestamp = body.readUInt32LE(2);
  const count = body.readUInt8(18);
  const expectedLen = 19 + count * 9;
  if (body.length < expectedLen) return null;
  const missions: QuestMission[] = [];
  for (let i = 0; i < count; i++) {
    const offset = 19 + i * 9;
    const status = body.readUInt8(offset + 8);
    missions.push({ index: i, completed: status === 1 });
  }
  const completedCount = missions.filter(m => m.completed).length;
  const pendingCount = count - completedCount;
  return { type, endTimestamp, missions, count, completedCount, pendingCount };
}
