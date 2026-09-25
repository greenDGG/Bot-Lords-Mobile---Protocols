import { BotEngine } from '../engine/bot-engine';

export function sendSweep(bot: BotEngine, payload: Buffer): void {
  bot.sendCommandPacket(1805, payload, false);
}

export function refineMana(bot: BotEngine): void {
  bot.sendCommandPacket(2038, Buffer.from([0x00, 0x01, 0x00]), true);
}
