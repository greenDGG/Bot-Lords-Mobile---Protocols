import { BotEngine } from '../engine/bot-engine';

export function requestRivals(bot: BotEngine): void {
  const payload = Buffer.from([0x01]);
  bot.sendCommandPacket(5204, payload, true);
}

export function attackRival(bot: BotEngine, rivalIndex: number, rivalId: number, rivalName: string, heroIds: number[]): void {
  const payload = Buffer.alloc(28);
  payload.writeUInt8(rivalIndex, 0);
  payload.writeUInt32LE(rivalId, 1);
  const name = Buffer.from(rivalName, 'ascii');
  name.copy(payload, 5, 0, Math.min(name.length, 13));
  for (let i = 0; i < 5; i++) {
    payload.writeUInt16LE(heroIds[i], 18 + i * 2);
  }
  bot.sendCommandPacket(5208, payload, true);
}

export function claimColiseumGems(bot: BotEngine): void {
  bot.sendCommandPacket(5214, Buffer.alloc(0), true);
}
