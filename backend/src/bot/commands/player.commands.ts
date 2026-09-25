import { BotEngine } from '../engine/bot-engine';
import { build1109Payload, parse1110, build2204Payload, parse2205 } from '../parsers/player.parser';
import { PlayerLocationResult } from '../models/player.types';

export function searchPlayerProfile(bot: BotEngine, name: string): void {
  const payload = build1109Payload(name);
  bot.sendCommandPacket(1109, payload, true);
}

export async function getPlayerLocation(bot: BotEngine, name: string): Promise<PlayerLocationResult | null> {
  const payload = build2204Payload(name);
  bot.sendCommandPacket(2204, payload, true);
  const body = await bot.waitForReply<Buffer>(2205, 8000);
  if (!body) return null;
  const result = parse2205(body);
  if (!result || !result.sameRealm) return null;
  return result;
}

export async function verifyPlayerProfile(bot: BotEngine, name: string): Promise<boolean> {
  searchPlayerProfile(bot, name);
  const body = await bot.waitForReply<Buffer>(1110, 8000);
  if (!body) return false;
  const result = parse1110(body);
  return !!(result && result.valid);
}
