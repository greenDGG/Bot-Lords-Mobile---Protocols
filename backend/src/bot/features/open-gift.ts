import type { BotEngine } from '../engine/bot-engine';
import { openGiftChest, claimGuildGift } from '../commands/guild-gift.commands';

export async function openGuildGift(bot: BotEngine): Promise<void> {
  openGiftChest(bot);
  await new Promise(resolve => setTimeout(resolve, 2000));
  claimGuildGift(bot);
}
