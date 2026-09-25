import { BotEngine } from '../engine/bot-engine';

export function buyShield24h(bot: BotEngine): void {
  const payload = Buffer.alloc(7);
  payload.writeUInt32LE(469785857, 0);
  payload[4] = 0x04;
  payload[5] = 0x01;
  payload[6] = 0x00;
  bot.sendCommandPacket(1408, payload, true);
}

export function activateShield(bot: BotEngine): void {
  const payload = Buffer.alloc(14);
  payload.writeUInt32LE(66588, 0);
  bot.sendCommandPacket(1406, payload, true);
}
