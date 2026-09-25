import type { BotInstance } from '../core/bot-instance';
import { parseColiseum, parseColiseumRivals } from '../models/coliseum.types';

export function handleColiseumState(bot: BotInstance, body: Buffer): void {
  if (body.length < 30) return;
  try {
    bot.coliseumState = parseColiseum(body);
    const s = bot.coliseumState;
    bot.bot.log(`[COLISEO] Puesto ${s.rank}, ${s.fightsDone}/5 peleas, gemas ${s.gems}, ${s.rivals.length} rivales`);
    bot.emit('coliseumUpdated');
  } catch {}
}

export function handleColiseumRivals(bot: BotInstance, body: Buffer): void {
  if (body.length < 14) return;
  try {
    const rivals = parseColiseumRivals(body);
    if (bot.coliseumState) {
      bot.coliseumState.rivals = rivals;
    } else {
      bot.coliseumState = { rank: 0, fightsDone: 0, gems: 0, unknown: '', rivals };
    }
    bot.bot.log(`[COLISEO] 5205: ${rivals.length} rivales actualizados`);
    bot.emit('coliseumUpdated');
  } catch {}
}
