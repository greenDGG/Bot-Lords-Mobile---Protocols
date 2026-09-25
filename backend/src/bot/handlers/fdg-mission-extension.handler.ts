import type { BotInstance } from '../core/bot-instance';
import { parse3638 } from '../parsers/missions.parser';

export function handle3638(bot: BotInstance, body: Buffer): void {
  if (body.length < 59) return;
  try {
    const data = parse3638(body);
    if (!data) return;
    bot.fdgExtension = data;
    bot.emit('fdgExtensionUpdated');
    bot.bot.log(`[FDG 3638] activa: ${data.activeMission.missionId} lvl ${data.activeMission.level}, 200%: ${data.mission200.missionId}, 120%: ${data.mission120.missionId}`);
  } catch {}
}
