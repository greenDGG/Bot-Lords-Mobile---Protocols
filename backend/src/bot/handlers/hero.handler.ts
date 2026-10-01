import type { BotInstance } from '../core/bot-instance';
import { parseHeroListDetailed, formatHeroList } from '../models/heroes.types';

export function handleHeroList(bot: BotInstance, body: Buffer): void {
  if (body.length < 20) return;
  try {
    const { heroes, layout, strict } = parseHeroListDetailed(body);
    if (heroes.length === 0) {
      bot.bot.log(`[HEROES] 1201 sin layout válido (${body.length}B): ${body.subarray(0, 48).toString('hex')}`);
      return;
    }
    bot.heroes = heroes;
    bot.bot.log(`[HEROES] ${heroes.length} héroes (${layout}${strict ? '' : ', lectura laxa'}) ${body.subarray(0, 24).toString('hex')}`);
    bot.bot.log(formatHeroList(heroes));
    bot.emit('heroListUpdated', heroes);
  } catch (e: any) {
    bot.bot.log(`[HEROES] error parse 1201: ${e?.message} (${body.length}B): ${body.subarray(0, 48).toString('hex')}`);
  }
}
