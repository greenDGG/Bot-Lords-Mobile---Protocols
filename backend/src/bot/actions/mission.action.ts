import type { BotInstance } from '../core/bot-instance';
import { missionName } from '../data/extravagant-mission-ids';
import { removeMission1, removeMission2 } from '../commands/mission.commands';

export class MissionCheckAction {
  name = 'MissionCheck';

  async execute(bot: BotInstance): Promise<boolean> {
    const config = bot.config.missions;
    if (!config?.autoEliminate || !config.wantedMissionIds.length) return false;
    if (!bot.missions) return false;

    const now = Date.now() / 1000;
    const data = bot.missions;
    const wanted = config.wantedMissionIds;
    let eliminated = false;

    while (true) {
      // Primero: misión activa (slot 0)
      if (data.activeMission && !wanted.includes(data.activeMission.missionId) && data.activeMission.available) {
        bot.bot.log(`[MISIONES] Eliminando activa: ${missionName(data.activeMission.missionId)} (ID: ${data.activeMission.missionId})`);
        data.activeMission = data.missions.shift() || null;
        removeMission1(bot.bot);
        eliminated = true;
        continue;
      }

      // Segundo: primer slot secundario disponible no deseado (siempre es slot 1)
      let found = false;
      for (let i = 0; i < data.missions.length; i++) {
        const m = data.missions[i];
        if (!wanted.includes(m.missionId) && m.available) {
          bot.bot.log(`[MISIONES] Eliminando slot ${i + 1}: ${missionName(m.missionId)} (ID: ${m.missionId})`);
          data.missions.splice(i, 1);
          removeMission2(bot.bot);
          eliminated = true;
          found = true;
          break;
        }
      }

      if (!found) break;
    }

    if (eliminated) bot.emit('missionsUpdated');
    return eliminated;
  }
}
