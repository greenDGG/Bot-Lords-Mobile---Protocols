import type { BotInstance } from '../core/bot-instance';
import type { BotAction } from './bot-action';
import { getHuntLevel } from '../../models/bot-config';

/**
 * Caza automática de monstruos (proto 2488).
 *
 * Si hunt.enable y no hay una caza en curso, elige el bicho cazable con
 * **menor HP** (a igual HP, el más cerca del castillo) y arranca el bucle de
 * BotInstance.startHunt(), que golpea hasta matarlo o hasta que desaparezca
 * del mapa / se acabe la energía.
 */
export class HuntAction implements BotAction {
  name = 'hunt';

  async execute(bot: BotInstance): Promise<boolean> {
    if (!bot.config.hunt.enable) return false;
    if (!bot.bot.isOnline) return false;
    if (bot.isHunting()) return false;

    const cand = bot.listHuntCandidates();
    if (cand.length === 0) {
      // Sin bichos cargados: mirar el mapa (2201 ventana por ventana, radio
      // de config.hunt.scanRadius). Si ya hay un escaneo en curso o el último
      // fue recién, startMapScan() no hace nada (sin spam de logs).
      bot.startMapScan();
      return false;
    }

    const t = cand[0];
    if (!t.monster) return false;
    const lvl = getHuntLevel(bot.config.hunt, t.monster.level);
    if (!lvl) return false;
    if (bot.getCurrentEnergy() < lvl.energyCost) {
      bot.bot.log(`[CAZA] Energía insuficiente: ${bot.getCurrentEnergy()}/${lvl.energyCost}`);
      return false;
    }

    const res = bot.startHunt(t.id);
    if (!res.ok) {
      bot.bot.log(`[CAZA] No se pudo iniciar: ${res.message}`);
      return false;
    }
    bot.bot.log(`[ACTION] Caza automática: ${res.message}`);
    return true;
  }
}
