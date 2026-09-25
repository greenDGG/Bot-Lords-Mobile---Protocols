import type { BotInstance } from '../core/bot-instance';
import { parse3633 } from '../parsers/missions.parser';

export function handleMissionRecords(bot: BotInstance, body: Buffer): void {
  if (body.length < 4) return;
  try {
    const data = parse3633(body);
    if (!data) return;
    bot.missionRecords = data;
    bot.emit('missionRecordsUpdated');
    bot.bot.log(`[MISIONES 3633] ${data.records.length} registros`);
  } catch {}
}
