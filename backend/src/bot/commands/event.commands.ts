import { BotEngine } from '../engine/bot-engine';

export function claimEvent(bot: BotEngine, proto: number, payload: Buffer): void {
  bot.sendCommandPacket(proto, payload, true);
}
