import './daily-missions.json'; // hace que tsc copie daily-missions.json a dist
import * as fs from 'fs';
import * as path from 'path';

/** Valor u32 del 3144/3143 que marca una misión ya reclamada. */
export const DAILY_MISSION_CLAIMED_VALUE = 0xffffffff;

export interface DailyMissionInfo {
  /** rango de misión (nuestra cuenta está en 7); el 3144 lo reporta en su header */
  rank: number;
  /** kind = DailyMissionKind (1..31): tipo de acción contada */
  type: number;
  /** objetivo del contador (p.ej. 18000 de energía cazando) */
  requirement: number;
  /** PA que suma reclamarla */
  energy: number;
  icon: number;
  desc: string | null;
  descEn: string | null;
  /** texto de desbloqueo con {0} = parámetro (nivel de castillo / capítulo) */
  hint: string | null;
  restr: number;
  param: number;
}

interface DailyMissionsDoc {
  chests?: number[];
  maxPaByRank?: Record<string, number>;
  missions?: Record<string, DailyMissionInfo>;
}

/**
 * Misiones diarias ("Diario", proto 3144/3143).
 * daily-missions.json generado por scripts/gen-daily-missions.py
 * (DailyMission.txt + DailyMissionKind.txt + StringTable).
 */
const DOC: DailyMissionsDoc = (() => {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'daily-missions.json'), 'utf-8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
})();

export const DAILY_MISSIONS: Record<number, DailyMissionInfo> = (() => {
  const out: Record<number, DailyMissionInfo> = {};
  for (const [key, value] of Object.entries(DOC.missions || {})) {
    const id = Number(key);
    if (Number.isFinite(id)) out[id] = value;
  }
  return out;
})();

/** Umbrales de los 5 cofres de PA (20/40/60/80/100): no están en ninguna tabla. */
export const DAILY_MISSION_CHESTS: number[] = Array.isArray(DOC.chests) ? DOC.chests : [20, 40, 60, 80, 100];

/** PA máxima del día por rango (rank 7 = 150). */
export function maxDailyPa(rank: number): number {
  const v = DOC.maxPaByRank?.[String(rank)];
  return typeof v === 'number' ? v : 0;
}

export function dailyMissionInfo(id: number): DailyMissionInfo | undefined {
  return DAILY_MISSIONS[id];
}

export function dailyMissionRequirement(id: number): number {
  return DAILY_MISSIONS[id]?.requirement ?? 0;
}

export function dailyMissionEnergy(id: number): number {
  return DAILY_MISSIONS[id]?.energy ?? 0;
}

export function dailyMissionDesc(id: number): string | null {
  return DAILY_MISSIONS[id]?.desc ?? null;
}

/** Índice del cofre ya reclamado según la máscara del header del 3144 (bit0 = cofre 1). */
export function isChestClaimed(mask: number, index: number): boolean {
  return (mask & (1 << index)) !== 0;
}

/** PA que hay que tener para abrir el cofre `index` (0-based). */
export function chestRequirement(index: number): number {
  return DAILY_MISSION_CHESTS[index] ?? 0;
}

export type DailyMissionState = 'claimed' | 'complete' | 'progress';

/**
 * Estado de una misión a partir del valor crudo del 3144/3143:
 * 0xffffffff = reclamada; >= requirement = completa sin reclamar; si no, en curso.
 */
export function dailyMissionState(id: number, value: number): DailyMissionState {
  if (value === DAILY_MISSION_CLAIMED_VALUE) return 'claimed';
  const req = dailyMissionRequirement(id);
  return req > 0 && value >= req ? 'complete' : 'progress';
}
