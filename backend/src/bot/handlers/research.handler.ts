import type { BotInstance } from '../core/bot-instance';
import { parse3201 } from '../parsers/research.parser';
import { computePlayerStats } from '../features/player-stats';

export function handleResearch(bot: BotInstance, body: Buffer): void {
  if (body.length < 15) return;
  try {
    const data = parse3201(body);
    if (!data) return;
    const prev = bot.research;
    bot.research = data;
    bot.playerStats = computePlayerStats(bot);
    bot.refreshResistenciaMax();
    bot.refreshEnergyRegen();
    if (data.activeTechId > 0 && data.remainingSeconds > 0 && (!prev || prev.activeTechId !== data.activeTechId || prev.activeLevel !== data.activeLevel)) {
      bot.bot.log(`[INVESTIGANDO] tech ${data.activeTechId} nivel ${data.activeLevel} — quedan ${data.remainingSeconds}s`);
    }
    bot.emit('researchUpdated');
  } catch {}
}
