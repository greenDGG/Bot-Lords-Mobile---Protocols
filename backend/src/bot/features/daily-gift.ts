import type { BotEngine } from '../engine/bot-engine';
import { claimDaily as claimDailyCmd } from '../commands/daily-gift.commands';

export async function claimDaily(bot: BotEngine, index: number): Promise<void> {
  claimDailyCmd(bot, index);
}
