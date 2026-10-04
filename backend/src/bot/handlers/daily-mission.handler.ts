import type { BotInstance } from '../core/bot-instance';
import { parse3143, parse3144 } from '../models/daily-mission.types';
import { dailyMissionState, dailyMissionDesc, dailyMissionEnergy } from '../data/daily-missions-db';

function countClaimedChests(mask: number): number {
  let n = 0;
  for (let i = 0; i < 8; i++) if (mask & (1 << i)) n++;
  return n;
}

function countByState(bot: BotInstance, state: string): number {
  const cache = bot.getDailyMissions();
  if (!cache) return 0;
  let n = 0;
  for (const m of cache.missions) if (dailyMissionState(m.id, m.value) === state) n++;
  return n;
}

/**
 * 3144 _MSG_RESP_DAILY_MISSION — push con el estado completo del "Diario":
 * PA, máscara de cofres, rango y los 25 contadores (0xffffffff = reclamada).
 * El servidor sólo lo manda al entrar; a partir de ahí actualiza con 3143.
 */
export function handle3144(bot: BotInstance, body: Buffer): void {
  try {
    const snap = parse3144(body);
    if (!snap) return;
    const cache = bot.setDailyMissions(snap);
    bot.bot.log(
      `[DIARIO 3144] rango ${cache.missionRank} · PA ${cache.pa} · cofres ${countClaimedChests(cache.chestMask)}/5 · ` +
      `reclamadas ${countByState(bot, 'claimed')}/${cache.missions.length} · completas ${countByState(bot, 'complete')}`,
    );
    bot.emit('dailyMissionsUpdated');
  } catch {}
}

/**
 * 3143 _MSG_RESP_DAILY_UPDATE — push de UN contador ([u16 id][u32 value]).
 * Sólo registra cambios de estado (completa / reclamada); el progreso fino
 * no se loguea para no llenar el log. Si no hay caché del día, se ignora.
 */
export function handle3143(bot: BotInstance, body: Buffer): void {
  try {
    const entry = parse3143(body);
    if (!entry) return;
    const prevValue = bot.getDailyMissions()?.missions.find(m => m.id === entry.id)?.value;
    const cache = bot.updateDailyMission(entry.id, entry.value);
    if (!cache) return;

    const desc = dailyMissionDesc(entry.id) || '';
    const next = dailyMissionState(entry.id, entry.value);
    const prev = prevValue === undefined ? null : dailyMissionState(entry.id, prevValue);
    if (next === prev) return;

    if (next === 'claimed') {
      bot.bot.log(`[DIARIO 3143] ${entry.id} reclamada (+${dailyMissionEnergy(entry.id)} PA) — ${desc}`);
    } else if (next === 'complete') {
      bot.bot.log(`[DIARIO 3143] ${entry.id} COMPLETA, falta reclamar — ${desc}`);
    } else if (prev === 'claimed' && prevValue !== undefined) {
      bot.bot.log(`[DIARIO 3143] ${entry.id} vuelve a progreso (${entry.value}) — ${desc}`);
    }
    bot.emit('dailyMissionsUpdated');
  } catch {}
}
