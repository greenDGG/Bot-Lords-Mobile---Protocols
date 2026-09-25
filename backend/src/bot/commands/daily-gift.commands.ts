import { BotEngine } from '../engine/bot-engine';

export function claimDaily(bot: BotEngine, index: number): void {
  const payload3605 = Buffer.alloc(5);
  payload3605.writeUInt32LE(0x06060606, 0);
  payload3605[4] = 0x00;
  bot.sendCommandPacket(3605, payload3605, true);
  bot.enqueueCommand(async () => {
    bot.sendCommandPacket(3130, Buffer.from([index]), true);
  });
}
