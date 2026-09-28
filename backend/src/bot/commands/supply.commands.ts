import { BotEngine } from '../engine/bot-engine';
import { waitMapProtoCooldown } from './map.commands';

export async function sendCaravan(bot: BotEngine, coordBytes: Buffer, resourceIndex: number, amount: number): Promise<void> {
  const payload = Buffer.alloc(23);
  coordBytes.copy(payload, 0);
  payload.writeUInt32LE(amount, 3 + resourceIndex * 4);
  await waitMapProtoCooldown(bot);
  bot.sendCommandPacket(2452, payload, true);
}

export function claimVipChest(bot: BotEngine, index: number): void {
  bot.sendCommandPacket(3126, Buffer.from([index]), true);
}
