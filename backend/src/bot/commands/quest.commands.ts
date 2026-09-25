import { BotEngine } from '../engine/bot-engine';

export function completeQuest(bot: BotEngine, typeByte: number, questIndex: number): void {
  bot.sendCommandPacket(3117, Buffer.from([typeByte, questIndex + 1]), true);
}
