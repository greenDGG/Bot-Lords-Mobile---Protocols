import type { BotInstance } from '../core/bot-instance';
import { ResourceTracker } from '../features/resource-tracker';
import { openChestBatch } from '../commands/chest.commands';
import { serverNow } from '../../utils/clock-sync';
import itemsData from '../data/items.json';

export type BagDefs = { wheat: [number, number][]; stone: [number, number][]; wood: [number, number][]; mineral: [number, number][]; gold: [number, number][] };
export const BAG_ITEMS: BagDefs = itemsData.BAG_ITEMS as unknown as BagDefs;
export const BAG_RES_KEYS: Record<string, string> = { wheat: 'wheat', stone: 'stone', wood: 'wood', ore: 'mineral', gold: 'gold' };

export function calcSimpleDeficit(tracker: ResourceTracker, wheat: number, wood: number, stone: number, ore: number, gold: number): { wheat: number; wood: number; stone: number; ore: number; gold: number } | null {
  let dw = 0, dwo = 0, ds = 0, do_ = 0, dg = 0;
  if (wheat > 0 && tracker.wheat < wheat) dw = wheat - Math.max(0, tracker.wheat);
  if (wood > 0 && tracker.wood < wood) dwo = wood - Math.max(0, tracker.wood);
  if (stone > 0 && tracker.stone < stone) ds = stone - Math.max(0, tracker.stone);
  if (ore > 0 && tracker.ore < ore) do_ = ore - Math.max(0, tracker.ore);
  if (gold > 0 && tracker.gold < gold) dg = gold - Math.max(0, tracker.gold);
  if (dw === 0 && dwo === 0 && ds === 0 && do_ === 0 && dg === 0) return null;
  return { wheat: dw, wood: dwo, stone: ds, ore: do_, gold: dg };
}

/**
 * Próximo unix (segundos) en que va a ocurrir el reset diario de la cuenta.
 *
 * @param resetSec Segundos desde medianoche UTC en que resetea la cuenta
 *   (`bot.getDailyResetSec()`, tomado del 1008). Valores fuera de `[0, 86400)`
 *   caen a 0 = 00:00 UTC. Usa `serverNow()` (reloj contra worldtimeapi) para
 *   no depender de la hora local del host.
 */
export function nextByResetTime(resetSec: number): number {
  const base = serverNow();
  const sec = Number.isFinite(resetSec) && resetSec >= 0 && resetSec < 86400 ? Math.floor(resetSec) : 0;
  const next = new Date(base);
  next.setUTCHours(0, 0, 0, 0);
  next.setUTCMilliseconds(next.getUTCMilliseconds() + sec * 1000);
  if (next.getTime() <= base) next.setUTCDate(next.getUTCDate() + 1);
  return Math.floor(next.getTime() / 1000);
}

export function getResourceAmount(bot: BotInstance, cr: number): number {
  return cr === 0 ? bot.resTracker.wheat : cr === 1 ? bot.resTracker.stone : cr === 2 ? bot.resTracker.wood : cr === 3 ? bot.resTracker.ore : cr === 4 ? bot.resTracker.gold : 0;
}

export async function useItemsForResource(bot: BotInstance, bagKey: string, need: number): Promise<boolean> {
  const defs = (BAG_ITEMS as any)[bagKey] as [number, number][];
  if (!defs || defs.length === 0) return false;
  const sorted = [...defs].sort((a, b) => a[1] - b[1]);
  let remaining = need;
  for (const [itemId, value] of sorted) {
    if (remaining <= 0) break;
    const have = bot.inventory.get(itemId) || 0;
    if (have === 0) continue;
    const useQty = Math.min(have, Math.floor(remaining / value));
    if (useQty > 0) {
      openChestBatch(bot.bot, itemId, useQty);
      bot.bot.log(`[BAG] ${useQty}x item ${itemId} (${(useQty * value).toLocaleString()} ${bagKey})`);
      const remainingInv = have - useQty;
      if (remainingInv <= 0) bot.inventory.delete(itemId);
      else bot.inventory.set(itemId, remainingInv);
      resTrackerAdd(bot, bagKey, useQty * value);
      remaining -= useQty * value;
      await new Promise(r => setTimeout(r, 300));
    }
  }
  if (remaining > 0) {
    for (const [itemId, value] of sorted) {
      if (remaining <= 0) break;
      const have = bot.inventory.get(itemId) || 0;
      if (have === 0) continue;
      openChestBatch(bot.bot, itemId, 1);
      bot.bot.log(`[BAG] 1x item ${itemId} (${value.toLocaleString()} ${bagKey}) — resto`);
      const remainingInv = have - 1;
      if (remainingInv <= 0) bot.inventory.delete(itemId);
      else bot.inventory.set(itemId, remainingInv);
      resTrackerAdd(bot, bagKey, value);
      remaining -= value;
      await new Promise(r => setTimeout(r, 300));
      break;
    }
  }
  return remaining <= 0;
}

export function resTrackerAdd(bot: BotInstance, bagKey: string, amount: number): void {
  if (bagKey === 'wheat') bot.resTracker.wheat += amount;
  else if (bagKey === 'stone') bot.resTracker.stone += amount;
  else if (bagKey === 'wood') bot.resTracker.wood += amount;
  else if (bagKey === 'mineral') bot.resTracker.ore += amount;
  else if (bagKey === 'gold') bot.resTracker.gold += amount;
}
