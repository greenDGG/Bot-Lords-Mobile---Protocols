import type { BotInstance } from '../core/bot-instance';
import { BuildingId } from '../models/buildings.types';
import { BuffCategory, BuffInstance } from '../models/player.types';
import { getBuffDef } from '../parsers/player.parser';

/**
 * Duración de Furia de Batalla según nivel de castillo (en minutos).
 * Niveles 9-12: 2 min
 * 13-16: 3 min
 * 17: 4 min
 * 18: 5 min
 * 19: 6 min
 * 20: 7 min
 * 21: 8 min
 * 22: 9 min
 * 23: 11 min
 * 24: 13 min
 * 25+: 15 min
 */
const FURY_DURATION_BY_CASTLE_LEVEL: Record<number, number> = {
  9: 120_000,
  10: 120_000,
  11: 120_000,
  12: 120_000,
  13: 180_000,
  14: 180_000,
  15: 180_000,
  16: 180_000,
  17: 240_000,
  18: 300_000,
  19: 360_000,
  20: 420_000,
  21: 480_000,
  22: 540_000,
  23: 660_000,
  24: 780_000,
  25: 900_000,
};

export function getFuryDurationMs(castleLevel: number): number {
  return FURY_DURATION_BY_CASTLE_LEVEL[castleLevel] ?? 900_000;
}

export function hasFury(bot: BotInstance): boolean {
  return !!bot.buffs.fury && bot.buffs.fury!.remaining > 0;
}

export function getFuryRemaining(bot: BotInstance): number {
  return bot.buffs.fury?.remaining ?? 0;
}

export function isFuryBlockingShield(bot: BotInstance): boolean {
  return hasFury(bot);
}

export function activateFury(bot: BotInstance): void {
  const castleLevel = bot.buildingState.getBuildingLevel(BuildingId.Castle);
  const durationMs = getFuryDurationMs(castleLevel);
  const durationSec = Math.floor(durationMs / 1000);

  bot.buffs.setFury(new Date(), durationMs);
  bot.furyBattle = Date.now() + durationMs;

  const min = Math.floor(durationMs / 60_000);
  const sec = Math.floor((durationMs % 60_000) / 1000);
  bot.bot.log(`[FURIA] Activada: castillo nivel ${castleLevel}, duración ${min}m ${sec}s`);

  bot.emit('buffsUpdated');
}

export function deactivateFury(bot: BotInstance): void {
  bot.furyBattle = 0;
  bot.buffs.expire(0x050A);
  bot.bot.log('[FURIA] Desactivada');
  bot.emit('buffsUpdated');
}
