import type { BotInstance } from '../core/bot-instance';
import { ResearchData, TECH_COUNT } from '../models/research.types';
import { computePlayerStats } from '../features/player-stats';

/**
 * 3208: notificación de investigación.
 *   [0..1] u16 LE TechID
 *   [2]    u8     nivel (alcanzado / en curso)
 */
export function handleResearchEvent(bot: BotInstance, body: Buffer): void {
  if (body.length < 3) return;
  try {
    const techId = body.readUInt16LE(0);
    const level = body[2];
    let research = bot.research;
    if (!research) {
      research = { techLevels: new Array<number>(TECH_COUNT).fill(0), activeTechId: 0, activeLevel: 0, timestamp: 0, remainingSeconds: 0 };
      bot.research = research;
    }
    if (techId >= 1 && techId <= TECH_COUNT) {
      if (research.techLevels[techId - 1] === level) return;
      research.techLevels[techId - 1] = level;
    }
    bot.bot.log(`[3208] investigación ${techId} -> nivel ${level}`);
    bot.playerStats = computePlayerStats(bot);
    bot.refreshResistenciaMax();
    bot.refreshEnergyRegen();
    bot.emit('researchUpdated');
  } catch {}
}
