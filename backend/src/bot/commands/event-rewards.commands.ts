import { BotEngine } from '../engine/bot-engine';

export function requestHellEvent(bot: BotEngine): void {
  bot.sendCommandPacket(3609, Buffer.from([0x01, 0x06]), true);
}

export function requestSolitaryEvent(bot: BotEngine): void {
  bot.sendCommandPacket(3609, Buffer.from([0x00, 0x06]), true);
}
