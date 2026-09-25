import type { BotInstance } from '../core/bot-instance';
import { parseHeroList, formatHeroList } from '../models/heroes.types';

export function handleHeroList(bot: BotInstance, body: Buffer): void {
  if (body.length < 20) return;
  try {
    const heroes = parseHeroList(body);
    if (heroes.length > 0) {
      bot.bot.log(`[HEROES] ${heroes.length} héroes cargados:\n${formatHeroList(heroes)}`);
      bot.emit('heroListUpdated', heroes);
    }
  } catch {}
}
