import type { BotInstance } from '../core/bot-instance';

export function handleInventory(bot: BotInstance, body: Buffer): void {
  if (body.length < 7) return;
  try {
    const page = body.readUInt8(0);
    const count = body.readUInt16LE(1);
    if (!count || 3 + count * 4 !== body.length) return;
    if (page === 1) bot.inventory.clear();
    for (let offset = 3; offset + 4 <= body.length; offset += 4) {
      const itemId = body.readUInt16LE(offset);
      const amount = body.readUInt16LE(offset + 2);
      if (!itemId) continue;
      bot.inventory.set(itemId, (bot.inventory.get(itemId) || 0) + amount);
    }
    bot.emit('inventoryUpdated');
  } catch {}
}
