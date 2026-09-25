import type { BotInstance } from '../core/bot-instance';
import { parseEquippedCostumes } from '../parsers/equipped.parser';

export function handleEquippedCostumes(bot: BotInstance, body: Buffer): void {
  if (!body || body.length === 0) return;

  const items = parseEquippedCostumes(body);

  if (items.length === 0) {
    bot.bot.log('[EQUIP] 3804 sin items equipados');
    return;
  }

  bot.equippedCostumes = items;

  const summary = items.map(i => `${i.id.toString(16)}G${i.grade}`).join(', ');
  bot.bot.log(`[EQUIP] 3804: ${items.length} trajes equipados [${summary}]`);

  bot.emit('equippedCostumesUpdated', bot.equippedCostumes);
}
