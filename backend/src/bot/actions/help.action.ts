import type { BotInstance } from '../core/bot-instance';
import type { BotAction } from './bot-action';

export class AutoHelpAction implements BotAction {
  name = 'autoHelp';
  async execute(bot: BotInstance): Promise<boolean> {
    if (!bot.config.sendHelp) return false;
    if (bot.bot.helpIdList.length === 0) return false;
    bot.bot.log('[ACTION] Enviando ayuda...');
    bot.bot.sendHelp();
    await new Promise(r => setTimeout(r, 2000));
    return true;
  }
}
