import { BotEngine } from '../engine/bot-engine';

export function openGiftChest(bot: BotEngine): void {
  bot.sendCommandPacket(2868, Buffer.alloc(0), true);
}

export function claimGuildGift(bot: BotEngine): void {
  bot.sendCommandPacket(2870, Buffer.from([0x01]), true);
}
