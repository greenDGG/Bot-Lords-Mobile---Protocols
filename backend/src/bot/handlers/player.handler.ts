import type { BotInstance } from '../core/bot-instance';
import { parsePlayerInfo } from '../parsers/player.parser';
import { parseGuildInfo } from '../models/guild.types';

export function handlePlayerInfo(bot: BotInstance, body: Buffer): void {
  if (body.length < 8) return;
  try {
    bot.playerInfo = parsePlayerInfo(body);
    bot.lastRes = bot.playerInfo.res;
    bot.syncEnergyFromServer();
    bot.emit('playerInfoUpdated');
  } catch {}
}

export function handleBuffs(bot: BotInstance, body: Buffer): void {
  if (body.length < 1) return;
  bot.buffs.handlePacket(body);
}

export function handleGuildInfo(bot: BotInstance, body: Buffer): void {
  if (body.length < 8) return;
  try {
    bot.guildInfo = parseGuildInfo(body);
    bot.guildName = bot.guildInfo.guildDisplayName;
    bot.guildId = bot.guildInfo.guildId;
    bot.guildTag = bot.guildInfo.guildTag;
    bot.emit('guildInfoUpdated');
    bot.bot.log(`[GUILD] ${bot.guildInfo.guildDisplayName} [${bot.guildInfo.guildTag}] (ID ${bot.guildInfo.guildId})`);
  } catch {}
}
