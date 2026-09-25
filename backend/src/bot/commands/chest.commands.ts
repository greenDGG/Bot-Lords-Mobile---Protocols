import { BotEngine } from '../engine/bot-engine';

export function openChestBatch(bot: BotEngine, itemId: number, quantity: number): void {
  const payload = Buffer.alloc(14);
  payload.writeUInt16LE(itemId, 0);
  payload.writeUInt16LE(quantity, 2);
  bot.sendCommandPacket(1406, payload, true);
}

export function claimEternalTreasure(bot: BotEngine): void {
  bot.sendCommandPacket(4045, Buffer.alloc(0), true);
}
