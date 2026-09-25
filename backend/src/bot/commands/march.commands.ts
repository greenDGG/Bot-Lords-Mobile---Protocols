import { BotEngine } from '../engine/bot-engine';

export function requestMarchData(bot: BotEngine, marchId: number): void {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(marchId, 0);
  bot.sendCommandPacket(2445, buf, true);
}
