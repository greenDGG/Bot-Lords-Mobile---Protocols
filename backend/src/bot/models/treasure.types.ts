export interface TreasureChamberData {
  level: number;
  gems: number;
  startTime: number;
  durationType: number; // 1=7d, 2=14d, 3=30d
  endTime: number;
}

const DURATION_MAP: Record<number, number> = { 1: 7, 2: 14, 3: 30 };
const BASE_ROI: Record<number, number> = { 1: 3, 2: 27, 3: 85 };
const LEVEL_BONUS: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 12, 9: 20 };

/** Máximo de gemas que se pueden depositar por nivel de la cámara del tesoro */
const MAX_DEPOSIT: Record<number, number> = {
  1: 10250,
  2: 10500,
  3: 11000,
  4: 12000,
  5: 13000,
  6: 14000,
  7: 15000,
  8: 16000,
  9: 20000,
};

export function parseTreasureChamber(body: Buffer): TreasureChamberData | null {
  if (body.length < 12) return null;
  const level = body.readUInt8(0);
  const gems = body.readUInt16LE(1);
  const startTime = body.readUInt32LE(3);
  const durationType = body.readUInt8(11);
  // Si todo son ceros, no hay inversión activa
  if (level === 0 && gems === 0 && startTime === 0) return null;
  const days = DURATION_MAP[durationType] || 0;
  const endTime = startTime + days * 86400;
  return { level, gems, startTime, durationType, endTime };
}

export function getRoiPercent(level: number, durationType: number): number {
  const base = BASE_ROI[durationType] || 0;
  const bonus = LEVEL_BONUS[level] || 0;
  return base + bonus;
}

export function getMaxDeposit(level: number): number {
  return MAX_DEPOSIT[level] || 0;
}

export function getReturnGems(gems: number, level: number, durationType: number): number {
  const pct = getRoiPercent(level, durationType);
  return Math.floor(gems * pct / 100);
}

export function getTotalPayout(gems: number, level: number, durationType: number): number {
  return gems + getReturnGems(gems, level, durationType);
}
