import { BotEngine } from '../engine/bot-engine';

export function exchangeShipSlot(bot: BotEngine, slotIndex: number): void {
  const payload = Buffer.from([slotIndex]);
  bot.sendCommandPacket(6305, payload, true);
}
