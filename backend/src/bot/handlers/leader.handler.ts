import type { BotInstance } from '../core/bot-instance';
import { parseLordCaptive } from '../models/leader.types';

export function handleLeaderCaptured(bot: BotInstance, body: Buffer): void {
  if (body.length < 48) return;
  try {
    const parsed = parseLordCaptive(body);
    if (parsed) {
      bot.isLeaderCaptured = true;
      bot.captiveData = parsed;
      bot.bot.log(`[LÍDER] Líder capturado — clan ${parsed.guildTag}, jugador ${parsed.playerName}`);
      bot.emit('leaderUpdated');
    }
  } catch {}
}

export function handleLeaderFreed(_bot: BotInstance, _body: Buffer): void {
  _bot.isLeaderCaptured = false;
  _bot.isLeaderExecuted = false;
  _bot.leaderFreeRevivalAt = 0;
  _bot.captiveData = undefined;
  _bot.bot.log('[LÍDER] Líder liberado');
  _bot.emit('leaderUpdated');
}

export function handleLeaderExecuted(bot: BotInstance, body: Buffer): void {
  if (body.length < 13) return;
  try {
    const execTimestamp = body.readUInt32LE(0);
    const freeRevivalSeconds = body.readUInt32LE(8);
    const execType = body[12];
    bot.isLeaderCaptured = false;
    bot.isLeaderExecuted = true;
    bot.leaderFreeRevivalAt = execTimestamp + freeRevivalSeconds;
    bot.captiveData = undefined;
    bot.bot.log(`[LÍDER] Líder ejecutado — revivir gratis en ${freeRevivalSeconds}s (tipo=${execType})`);
    bot.emit('leaderUpdated');
  } catch {}
}
