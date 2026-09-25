import type { BotInstance } from '../core/bot-instance';
import { parse2401 } from '../../models/troop-state';
import { parseTroopTraining } from '../parsers/troops.parser';
import { parseHospital } from '../models/hospital.types';

export function handleTroopState(bot: BotInstance, body: Buffer): void {
  if (body.length < 80) return;
  try {
    const parsed = parse2401(body);
    if (parsed) {
      bot.troopState = parsed;
      bot.bot.log(`[TROPAS] Total: ${parsed.getTotalTroops()}`);
      bot.emit('troopsUpdated');
    }
  } catch {}
}

export function handleTroopTraining(bot: BotInstance, body: Buffer): void {
  if (body.length < 18) return;
  try {
    const parsed = parseTroopTraining(body);
    if (parsed) {
      bot.troopTraining = parsed;
      bot.emit('troopTrainingUpdated');
    }
  } catch {}
}

export function handleHospital(bot: BotInstance, body: Buffer): void {
  if (body.length < 172) return;
  try {
    const parsed = parseHospital(body);
    if (parsed) {
      bot.hospitalState = parsed;
      const injured = parsed.getTotalInjured();
      const healing = parsed.getTotalHealing();
      if (healing > 0) {
        const finish = new Date(parsed.finishTimestamp * 1000).toLocaleTimeString();
        bot.bot.log(`[ENFERMERÍA] Heridos: ${injured} | Curándose: ${healing} | Termina: ${finish} | Total: ${parsed.totalHealingSeconds}s`);
      } else {
        bot.bot.log(`[ENFERMERÍA] Heridos: ${injured} | Sin curación activa`);
      }
      bot.emit('hospitalUpdated');
    }
  } catch {}
}
