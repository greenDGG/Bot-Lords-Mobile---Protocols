import type { BotInstance } from '../core/bot-instance';
import { parse7317 } from '../models/essence.types';

export function handleEssenceTransmutation(bot: BotInstance, body: Buffer): void {
  if (body.length < 41) return;
  try {
    const parsed = parse7317(body);
    if (parsed) {
      bot.essenceState = parsed;
      const active = parsed.slots.filter(s => s.isRunning);
      if (active.length > 0) {
        for (const s of active) {
          bot.bot.log(`[TRANSMUTACIÓN] Slot ${s.index}: esencia nivel ${s.essenceLevel} — termina en ${s.finishTimestamp}s`);
        }
      }
      bot.emit('essenceUpdated');
    }
  } catch {}
}
