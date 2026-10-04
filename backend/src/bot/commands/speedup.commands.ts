import { BotEngine } from '../engine/bot-engine';
import { OwnMarch } from '../models/march.types';
import { UI_SECTION_ARMY_STATUS, UI_SECTION_SPEEDUP } from './formation.commands';

export type SpeedupField = 'a' | 'b';
export type AccelIndexSource = 'sorted' | 'slot' | 'participant';

export const ACCEL_RETRY_DELAY_MS = 2000;
export const ACCEL_STATUS_RETRIES = 3;

export const GENERIC_SPEEDUP_IDS = [
  1029, 1148, 1144, 1149, 1040, 1041, 1042,
  1081, 1082, 1083, 1084, 1085, 1086, 1087,
];

export const MAX_ACCEL_ATTEMPTS = 5;

export interface AccelCandidate {
  field: SpeedupField;
  source: AccelIndexSource;
}

export const ACCEL_CANDIDATES: AccelCandidate[] = [
  { field: 'a', source: 'sorted' },
  { field: 'b', source: 'sorted' },
  { field: 'b', source: 'participant' },
  { field: 'a', source: 'slot' },
  { field: 'b', source: 'slot' },
];

export interface ParticipantLike {
  index: number;
  mask: number;
  troops: { count: number }[];
}

export interface LastWarSend {
  mask: number;
  quantities: number[];
}

export function resolveParticipantIndex(
  participants: ParticipantLike[],
  last: LastWarSend | null,
): number {
  if (!participants.length) return 0;
  if (!last) return 0;
  const lastTotal = last.quantities.reduce((a, b) => a + b, 0);
  const hit = participants.find(
    p => p.mask === last.mask && p.troops.reduce((a, t) => a + t.count, 0) === lastTotal,
  );
  if (hit) return hit.index;
  const byMask = participants.find(p => p.mask === last.mask);
  return byMask ? byMask.index : 0;
}

export const EVENT_BOOTS_ID = 1405;
export const MARCH_BOOTS_IDS = [EVENT_BOOTS_ID, 1039, 1121, 1122];
const BOOTS_FRACTION = 0.25;

export interface SpeedupPick {
  itemId: number;
  seconds: number;
  qty: number;
}

export function sendArmyStatus(bot: BotEngine): void {
  const payload = Buffer.alloc(6);
  payload.writeUInt16LE(UI_SECTION_ARMY_STATUS, 0);
  bot.sendCommandPacket(1144, payload, true);
}

export function sendSpeedupSelect(bot: BotEngine, field: SpeedupField, index: number): void {
  const payload = Buffer.alloc(6);
  payload.writeUInt16LE(UI_SECTION_SPEEDUP, 0);
  payload.writeUInt16LE(index, field === 'a' ? 2 : 4);
  bot.sendCommandPacket(1144, payload, true);
}

export function sendSpeedupUse(bot: BotEngine, itemId: number, quantity: number, field: SpeedupField, index: number): void {
  const payload = Buffer.alloc(14);
  payload.writeUInt16LE(itemId, 0);
  payload.writeUInt16LE(quantity, 2);
  payload.writeUInt16LE(index, field === 'a' ? 4 : 6);
  bot.sendCommandPacket(1406, payload, true);
}

export function speedupSeconds(itemsDb: Record<string, any>, itemId: number): number {
  const entry = itemsDb?.[String(itemId)];
  const effect = entry?.effect;
  if (!Array.isArray(effect)) return 0;
  const seconds = Number(effect[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

export function pickSpeedupItem(
  inventory: Map<number, number>,
  gapSec: number,
  itemsDb: Record<string, any>,
  remainingSec = 0,
): SpeedupPick | null {
  if (gapSec <= 0) return null;

  const bootsSeconds = remainingSec > 0 ? Math.max(1, Math.floor(remainingSec * BOOTS_FRACTION)) : 0;

  if (bootsSeconds > 0 && (inventory.get(EVENT_BOOTS_ID) || 0) > 0) {
    return { itemId: EVENT_BOOTS_ID, seconds: bootsSeconds, qty: 1 };
  }

  const owned: SpeedupPick[] = [];
  for (const itemId of GENERIC_SPEEDUP_IDS) {
    if ((inventory.get(itemId) || 0) <= 0) continue;
    const seconds = speedupSeconds(itemsDb, itemId);
    if (seconds > 0) owned.push({ itemId, seconds, qty: 1 });
  }
  if (owned.length) {
    owned.sort((a, b) => a.seconds - b.seconds);
    const covering = owned.find(o => o.seconds >= gapSec);
    const base = covering ?? owned[owned.length - 1];
    const needed = Math.max(1, Math.ceil(gapSec / base.seconds));
    const available = inventory.get(base.itemId) || 0;
    return { itemId: base.itemId, seconds: base.seconds, qty: Math.max(1, Math.min(needed, available)) };
  }

  if (bootsSeconds <= 0) return null;
  for (const itemId of MARCH_BOOTS_IDS) {
    if ((inventory.get(itemId) || 0) > 0) return { itemId, seconds: bootsSeconds, qty: 1 };
  }
  return null;
}

function remainingSec(entry: OwnMarch, nowSec: number): number {
  return Math.max(0, entry.startAt + entry.durationSec - nowSec);
}

export function resolveAccelIndex(
  entries: OwnMarch[],
  target: OwnMarch,
  source: AccelIndexSource,
  nowSec: number,
): number {
  if (source === 'slot') return target.index;
  const sorted = [...entries].sort((a, b) => remainingSec(a, nowSec) - remainingSec(b, nowSec));
  let pos = sorted.indexOf(target);
  if (pos < 0) pos = sorted.findIndex(e => e.index === target.index);
  return pos >= 0 ? pos : 0;
}
