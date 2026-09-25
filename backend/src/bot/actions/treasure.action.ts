import type { BotInstance } from '../core/bot-instance';
import type { BotAction } from './bot-action';
import { claimEternalTreasure } from '../commands/chest.commands';
import { investTreasureChamber, claimTreasureChamber } from '../commands/treasure.commands';
import { getMaxDeposit, getReturnGems } from '../models/treasure.types';

export class EternalTreasureAction implements BotAction {
  name = 'eternalTreasure';
  async execute(bot: BotInstance): Promise<boolean> {
    const cfg = bot.config.eternalTreasure;
    if (!cfg.enable) return false;
    if (bot.eternalTreasureClaimed) return false;
    if (!bot.eternalTreasureAvailable) return false;
    bot.bot.log('[ACTION] Reclamando cofre tesoro eterno (4045)...');
    claimEternalTreasure(bot.bot);
    bot.eternalTreasureClaimed = true;
    await new Promise(r => setTimeout(r, 2000));
    return true;
  }
}

export class TreasureChamberAction implements BotAction {
  name = 'treasureChamber';
  async execute(bot: BotInstance): Promise<boolean> {
    const cfg = bot.config.treasureChamber;
    if (!cfg.enable) return false;
    const bLevel = bot.buildingState.getBuildingLevel(16);
    const maxGems = getMaxDeposit(bLevel);
    const tc = bot.treasureChamber;
    const nowSec = Date.now() / 1000;

    if (!tc) {
      const invest = Math.max(1, maxGems);
      investTreasureChamber(bot.bot, invest, 3);
      if (bot.playerInfo) {
        bot.playerInfo.gems = Math.max(0, bot.playerInfo.gems - invest);
        bot.emit('playerInfoUpdated');
      }
      bot.bot.log(`[CÁMARA] Invirtiendo ${invest.toLocaleString()} gemas en 30 días (nivel ${bLevel})`);
      await new Promise(r => setTimeout(r, 2000));
      return true;
    }

    if (nowSec >= tc.endTime) {
      claimTreasureChamber(bot.bot);
      const payout = getReturnGems(tc.gems, tc.level, tc.durationType);
      if (bot.playerInfo) {
        bot.playerInfo.gems += tc.gems + payout;
        bot.emit('playerInfoUpdated');
      }
      bot.treasureChamber = undefined;
      bot.bot.log(`[CÁMARA] Reclamada inversión de ${tc.gems.toLocaleString()} gemas (+${payout.toLocaleString()} ganancia)`);
      await new Promise(r => setTimeout(r, 2000));
      return true;
    }

    return false;
  }
}
