export interface ResourcesData {
  wheat: number;
  wheatProd: number;
  stone: number;
  stoneProd: number;
  wood: number;
  woodProd: number;
  mineral: number;
  mineralProd: number;
  gold: number;
  goldProd: number;
}

export function parseResources(payload: Buffer): ResourcesData | null {
  if (payload.length < 60) return null;
  return {
    wheat: payload.readUInt32LE(0),
    wheatProd: payload.readInt32LE(4),
    stone: payload.readUInt32LE(12),
    stoneProd: payload.readInt32LE(16),
    wood: payload.readUInt32LE(24),
    woodProd: payload.readInt32LE(28),
    mineral: payload.readUInt32LE(36),
    mineralProd: payload.readInt32LE(40),
    gold: payload.readUInt32LE(48),
    goldProd: payload.readInt32LE(52),
  };
}
