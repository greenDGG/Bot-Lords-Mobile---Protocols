import { BotEngine } from '../engine/bot-engine';

export function investTreasureChamber(bot: BotEngine, gems: number, slot: number): void {
  const payload = Buffer.alloc(3);
  payload.writeUInt16LE(gems, 0);
  payload.writeUInt8(slot, 2);
  bot.sendCommandPacket(4202, payload, true);
}

export function claimTreasureChamber(bot: BotEngine): void {
  bot.sendCommandPacket(4206, Buffer.alloc(0), true);
}
