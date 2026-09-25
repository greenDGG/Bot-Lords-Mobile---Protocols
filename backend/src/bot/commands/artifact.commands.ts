import { BotEngine } from '../engine/bot-engine';

export function openArtifactChest(bot: BotEngine): void {
  bot.sendCommandPacket(9794, Buffer.from([0x00, 0x01]), true);
}

export function claimArtifactReward(bot: BotEngine): void {
  bot.sendCommandPacket(9778, Buffer.from([0x01, 0x00, 0x01]), true);
}

export function closeArtifactChest(bot: BotEngine): void {
  bot.sendCommandPacket(9794, Buffer.from([0x00, 0x00]), true);
}
