import type { BotInstance } from '../core/bot-instance';
import type { BotAction } from './bot-action';
import { claimDaily } from '../commands/daily-gift.commands';
import { openMysteryBox, claimForgeGift } from '../commands/gift.commands';
import { nextByResetTime } from './action-helpers';

export class ReclaimDailyAction implements BotAction {
  name = 'reclaimDaily';
  async execute(bot: BotInstance): Promise<boolean> {
    const cfg = bot.config.giftDaily;
    if (!cfg.autoreclaim) return false;
    if (cfg.next !== 0 && cfg.next > Math.floor(Date.now() / 1000)) return false;
    const idx = cfg.index;
    bot.bot.log(`[ACTION] Reclamando daily index ${idx}...`);
    await claimDaily(bot.bot, idx);
    cfg.index = idx >= 20 ? 0 : idx + 1;
    cfg.next = nextByResetTime(bot.getDailyResetSec());
    bot.saveConfig();
    return true;
  }
}

export class MysteryBoxAction implements BotAction {
  name = 'mysteryBox';
  async execute(bot: BotInstance): Promise<boolean> {
    const cfg = bot.config.mysteryBox;
    if (!cfg.enable) return false;
    if (cfg.next !== 0 && cfg.next > Math.floor(Date.now() / 1000)) return false;
    bot.bot.log('[ACTION] Abriendo mystery box...');
    openMysteryBox(bot.bot);
    await new Promise(r => setTimeout(r, 2000));
    return true;
  }
}

export class ForgeGiftAction implements BotAction {
  name = 'forgeGift';
  async execute(bot: BotInstance): Promise<boolean> {
    const cfg = bot.config.forgeGift;
    if (!cfg.enable) return false;
    if (cfg.next !== 0 && cfg.next > Math.floor(Date.now() / 1000)) return false;
    bot.bot.log('[ACTION] Reclamando forge gift...');
    claimForgeGift(bot.bot);
    cfg.next = nextByResetTime(bot.getDailyResetSec());
    bot.saveConfig();
    await new Promise(r => setTimeout(r, 2000));
    return true;
  }
}
