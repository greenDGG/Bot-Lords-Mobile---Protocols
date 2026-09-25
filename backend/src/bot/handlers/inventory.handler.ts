import type { BotInstance } from '../core/bot-instance';

export function handleInventory(bot: BotInstance, body: Buffer): void {
  if (body.length <= 500) return;
  try {
    bot.inventory.clear();
    let offset = 3;
    while (offset + 4 <= body.length) {
      const itemId = body.readUInt16LE(offset);
      const amount = body.readUInt16LE(offset + 2);
      bot.inventory.set(itemId, (bot.inventory.get(itemId) || 0) + amount);
      offset += 4;
    }
    bot.emit('inventoryUpdated');
  } catch {}
}
