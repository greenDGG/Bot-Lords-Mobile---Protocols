import type { BotInstance } from '../core/bot-instance';
import { parse9652 } from '../parsers/missions.parser';
import { missionName } from '../data/extravagant-mission-ids';
import { sendPushNotification } from '../features/notification.service';

export function handle9652(bot: BotInstance, body: Buffer): void {
  if (body.length < 4) return;
  try {
    const data = parse9652(body, true);
    if (!data) return;
    bot.missions = data;
    bot.emit('missionsUpdated');
    bot.bot.log(`[MISIONES] ${data.missions.length + 1} misiones, progreso: ${data.progress}/${data.activeMission?.total || 0}`);
    notifyWanted(bot, data);
  } catch {}
}

export function handle9661(bot: BotInstance, body: Buffer): void {
  if (body.length < 5) return;
  try {
    const data = parse9652(body.subarray(1), true);
    if (!data) return;
    bot.missions = data;
    bot.emit('missionsUpdated');
    bot.bot.log(`[MISIONES] 9661: ${data.missions.length + 1} misiones, progreso: ${data.progress}/${data.activeMission?.total || 0}`);
    notifyWanted(bot, data);
  } catch {}
}

export function handle9663(bot: BotInstance, body: Buffer): void {
  if (body.length < 1) return;
  try {
    const data = parse9652(body, false);
    if (!data) return;
    bot.missions = data;
    bot.emit('missionsUpdated');
    bot.bot.log(`[MISIONES] 9663: ${data.missions.length} misiones restantes`);
  } catch {}
}

function notifyWanted(bot: BotInstance, data: { activeMission: any; missions: any[] }): void {
  const config = bot.config.missions;
  if (!config) return;

  const allMissions = [data.activeMission, ...data.missions].filter(Boolean);
  const wanted = config.wantedMissionIds;

  for (const m of allMissions) {
    if (wanted.includes(m.missionId)) {
      const msg = `${missionName(m.missionId)} (ID: ${m.missionId}) - Cuenta ${bot.iggId}`;
      bot.bot.log(`[MISIONES] QUIERO: ${msg}`);
      sendPushNotification('Misión que busco disponible', msg, {
        type: 'missionAvailable',
        iggId: String(bot.iggId),
        missionId: String(m.missionId),
      });
    }
  }
}
