import type { BotInstance } from '../core/bot-instance';
import { parse3610 } from '../parsers/event-rewards.parser';
import { databaseService } from '../../database/database.service';

function getHourTimestamp(): number {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const hourStart = new Date(utcMs);
  hourStart.setUTCMinutes(0, 0, 0);
  return Math.floor(hourStart.getTime() / 1000);
}

export function handle3610(bot: BotInstance, body: Buffer): void {
  if (body.length < 48) return;
  try {
    const data = parse3610(body);
    if (!data) return;
    bot.eventRewards = data;
    bot.emit('eventRewardsUpdated', { data, body });
    const [c1, c2, c3] = data.counts;
    const totalGemas = data.levels[0].valorGemas + data.levels[1].valorGemas + data.levels[2].valorGemas;
    const missionHex = data.missionIds.map(id => `0x${id.toString(16).padStart(4, '0')}`).join('+');
    bot.bot.log(`[EVENT-REWARDS 3610] mission=${missionHex} N1(${c1}) N2(${c2}) N3(${c3}) gemas=${totalGemas} records=${data.records.length}`);

    if (databaseService.isConnected()) {
      const hourTs = getHourTimestamp();
      databaseService.EventRewardDataModel.updateOne(
        { eventType: data.eventType, hourTimestamp: hourTs },
        {
          $set: {
            eventType: data.eventType,
            hourTimestamp: hourTs,
            missionIds: data.missionIds,
            levels: data.levels,
            counts: data.counts,
            records: data.records,
            rawHex: body.toString('hex'),
            receivedAt: new Date(),
          },
        },
        { upsert: true }
      ).catch(() => {});
    }
  } catch {}
}
