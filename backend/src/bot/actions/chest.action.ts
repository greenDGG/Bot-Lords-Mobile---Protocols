import type { BotInstance } from '../core/bot-instance';
import type { BotAction } from './bot-action';
import { openArtifactChest, claimArtifactReward, closeArtifactChest } from '../commands/artifact.commands';
import { claimVipChest } from '../commands/supply.commands';
import { openGuildGift } from '../features/open-gift';

export class ArtifactFairAction implements BotAction {
  name = 'artifactFair';
  async execute(bot: BotInstance): Promise<boolean> {
    const cfg = bot.config.artifactFair;
    if (!cfg.enable) return false;
    if (cfg.reset !== 0) {
      const resetTime = new Date(cfg.reset * 1000);
      if (Date.now() < resetTime.getTime()) return false;
    }
    bot.bot.log('[ACTION] Abriendo cofre feria de artefactos...');
    openArtifactChest(bot.bot);
    await new Promise(r => setTimeout(r, 2000));
    claimArtifactReward(bot.bot);
    await new Promise(r => setTimeout(r, 2000));
    closeArtifactChest(bot.bot);
    const nextReset = new Date();
    nextReset.setUTCHours(2, 0, 0, 0);
    nextReset.setDate(nextReset.getDate() + 1);
    cfg.reset = Math.floor(nextReset.getTime() / 1000);
    bot.saveConfig();
    return true;
  }
}

export class ChestVipAction implements BotAction {
  name = 'chestVip';
  async execute(bot: BotInstance): Promise<boolean> {
    if (!bot.config.chestVip.enable) return false;
    if (!bot.vipChestMem) { return false; }
    const mem = bot.vipChestMem;
    if (mem.nextIndex === -1) { return false; }
    if (Date.now() < mem.nextClaim * 1000) { return false; }
    bot.bot.log(`[ACTION] Reclamando chest VIP índice ${mem.nextIndex}...`);
    claimVipChest(bot.bot, mem.nextIndex);
    const idx = mem.nextIndex;
    mem.mask |= (1 << idx);
    mem.nextClaim = Math.floor(Date.now() / 1000) + 3600;
    let next = -1;
    for (let i = 0; i < 10; i++) {
      if (!(mem.mask & (1 << i))) { next = i; break; }
    }
    mem.nextIndex = next;
    return true;
  }
}

export class OpenGuildChestAction implements BotAction {
  name = 'openGuildChest';
  async execute(bot: BotInstance): Promise<boolean> {
    if (!bot.config.openGuildChest.enable) return false;
    bot.bot.log('[ACTION] Abriendo cofre de gremio...');
    await openGuildGift(bot.bot);
    await new Promise(r => setTimeout(r, 2000));
    return true;
  }
}
