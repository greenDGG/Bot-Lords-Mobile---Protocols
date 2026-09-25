import { BotEngine } from '../engine/bot-engine';

export function removeMission1(bot: BotEngine): void {
  bot.sendCommandPacket(9660, Buffer.alloc(0), true);
}

export function removeMission2(bot: BotEngine): void {
  bot.sendCommandPacket(9662, Buffer.from([0x00]), true);
}

export function removeMission3(bot: BotEngine): void {
  bot.sendCommandPacket(9662, Buffer.from([0x01]), true);
}

export function removeMission4(bot: BotEngine): void {
  bot.sendCommandPacket(9662, Buffer.from([0x02]), true);
}
