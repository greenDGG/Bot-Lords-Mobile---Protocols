import { BotEngine } from '../engine/bot-engine';

export function openMysteryBox(bot: BotEngine): void {
  bot.sendCommandPacket(1117, Buffer.alloc(0), true);
}

export function claimForgeGift(bot: BotEngine): void {
  bot.sendCommandPacket(9903, Buffer.alloc(0), true);
}
