import { BotEngine } from '../engine/bot-engine';

export function acceptGuildApplication(bot: BotEngine, userId: number): void {
  const buf = Buffer.alloc(9);
  buf.writeUInt8(0x01, 0);
  buf.writeUInt32LE(userId, 1);
  bot.sendCommandPacket(2813, buf, true);
}

export function rejectGuildApplication(bot: BotEngine, userId: number): void {
  const buf = Buffer.alloc(9);
  buf.writeUInt8(0x02, 0);
  buf.writeUInt32LE(userId, 1);
  bot.sendCommandPacket(2813, buf, true);
}
