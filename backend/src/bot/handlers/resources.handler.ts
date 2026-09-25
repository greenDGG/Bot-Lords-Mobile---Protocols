import type { BotInstance } from '../core/bot-instance';
import { parseResources } from '../models/resources.types';

export function handleResources(bot: BotInstance, body: Buffer): void {
  if (body.length < 60) return;
  try {
    bot.resources = parseResources(body)!;
    if (bot.resources) {
      bot.resTracker.init(bot.resources, bot.config.resourceLimit);
      bot.emit('resourcesUpdated');
    }
  } catch {}
}

export function handleRefineMana(bot: BotInstance, body: Buffer): void {
  if (body.length < 20) return;
  try {
    const count = body.readUInt32LE(16);
    bot.refineManaCount = count;
    bot.bot.log(`[REFINE MANA] Estado 2037: ${count}/5 reclamados`);
    bot.emit('refineManaUpdated');
  } catch {}
}
