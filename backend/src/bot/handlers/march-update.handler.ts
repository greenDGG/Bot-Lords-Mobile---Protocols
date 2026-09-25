import type { BotInstance } from '../core/bot-instance';
import { parseMarchUpdate } from '../parsers/march.parser';
import { serverNowSec } from '../../utils/clock-sync';

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function handleMarchUpdateSmall(bot: BotInstance, body: Buffer): void {
  if (body.length < 16) return;
  try {
    const parsed = parseMarchUpdate(body);
    if (parsed) {
      const idx = bot.incomingMarches.findIndex(m => m.marchId === parsed.marchId);
      if (idx >= 0) {
        bot.incomingMarches[idx].arrivalTimestamp = parsed.arrivalTimestamp;
        bot.incomingMarches[idx].updated = true;
        if (bot.config.warMode) bot.armCounterTimer(bot.incomingMarches[idx]);
        const remain = Math.max(0, parsed.arrivalTimestamp - serverNowSec());
        bot.bot.log(`[ATALAYA] Marcha ${parsed.marchId} actualizada — llega en ${formatDuration(remain)}`);
      } else {
        bot.incomingMarches.push({ marchId: parsed.marchId, arrivalTimestamp: parsed.arrivalTimestamp, updated: true, arrived: false, countered: false });
        const remain = Math.max(0, parsed.arrivalTimestamp - serverNowSec());
        bot.bot.log(`[ATALAYA] Marcha ${parsed.marchId} (update sin incoming previo) — llega en ${formatDuration(remain)}`);
      }
      bot.emit('marchesUpdated');
    }
  } catch {}
}
