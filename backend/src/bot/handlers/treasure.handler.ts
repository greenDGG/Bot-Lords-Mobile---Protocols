import type { BotInstance } from '../core/bot-instance';
import { parseTreasureChamber } from '../models/treasure.types';
import * as fs from 'fs';
import * as path from 'path';

const ITEMS_DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'items.json'), 'utf-8'));

export function handleTreasureChamber(bot: BotInstance, body: Buffer): void {
  if (body.length < 12) return;
  try {
    const parsed = parseTreasureChamber(body);
    if (parsed) {
      bot.treasureChamber = parsed;
      bot.emit('treasureChamberUpdated');
    }
  } catch {}
}

export function handleEternalTreasure(bot: BotInstance, body: Buffer): void {
  if (body.length < 1) return;
  try {
    const count = body[0];
    const items: { id: number; amount: number }[] = [];
    if (count > 0 && body.length >= 1 + count * 5) {
      for (let i = 0; i < count; i++) {
        const off = 1 + i * 5;
        items.push({ id: body.readUInt16LE(off), amount: body.readUInt16LE(off + 2) });
      }
    }
    bot.eternalTreasureItems = items;
    bot.eternalTreasureAvailable = true;
    for (const it of items) {
      const cur = bot.inventory.get(it.id) || 0;
      bot.inventory.set(it.id, cur + it.amount);
    }
    const label = items.length > 0
      ? items.map(it => `${eternalTreasureItemName(it.id)} x${it.amount}`).join(', ')
      : 'sin items';
    bot.bot.log(`[TESORO ETERNO] Cofre disponible (4044): ${label}`);
    bot.emit('eternalTreasureUpdated');
  } catch {}
}

function eternalTreasureItemName(id: number): string {
  const entry: any = (ITEMS_DATA as any).ITEMS_DB?.[String(id)];
  return entry?.name || `item ${id}`;
}
