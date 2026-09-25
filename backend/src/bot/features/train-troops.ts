import { BotEngine } from '../engine/bot-engine';

export function trainTroops(bot: BotEngine, troopType: number, tier: number, amount: number, requestId: number, itemBytes?: Buffer): void {
  const payload = Buffer.alloc(8);
  payload.writeInt32LE(requestId, 0);
  payload[4] = troopType;
  payload[5] = tier;
  payload.writeUInt16LE(amount, 6);

  if (itemBytes && itemBytes.length > 0) {
    const extended = Buffer.concat([payload, itemBytes]);
    bot.sendEncrypted(2403, extended);
  } else {
    bot.sendEncrypted(2403, payload);
  }
}
