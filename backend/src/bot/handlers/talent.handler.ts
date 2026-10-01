import type { BotInstance } from '../core/bot-instance';
import { parse3801 } from '../parsers/talent.parser';
import { computePlayerStats } from '../features/player-stats';

export function handleTalentInfo(bot: BotInstance, body: Buffer): void {
  try {
    const data = parse3801(body);
    if (!data) return;
    const prev = bot.talents;
    bot.talents = data;
    bot.playerStats = computePlayerStats(bot);
    const changed =
      !prev ||
      prev.unassigned !== data.unassigned ||
      prev.levels.length !== data.levels.length ||
      prev.levels.some((l, i) => l !== data.levels[i]);
    if (changed) {
      const active = data.levels.filter(l => l > 0).length;
      bot.bot.log(`[TALENTOS] ${active} talentos activos, ${data.unassigned} puntos sin asignar`);
    }
    bot.emit('talentsUpdated');
  } catch {}
}
