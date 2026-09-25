import type { BotInstance } from '../core/bot-instance';
import type { BotAction } from './bot-action';
import { attackRival, claimColiseumGems } from '../commands/coliseum.commands';
import { sendSweep } from '../commands/sweep.commands';
import { getColiseumHeroes, parseSweepPayload, sweepResistenciaCost } from '../../models/bot-config';

export class ShieldAction implements BotAction {
  name = 'shield';
  async execute(bot: BotInstance): Promise<boolean> {
    if (!bot.config.shield.enable || bot.config.warMode) return false;
    bot.bot.log('[ACTION] Verificando escudo...');
    return bot.tryRenewShield();
  }
}

export class ColiseumGemsAction implements BotAction {
  name = 'coliseumGems';
  async execute(bot: BotInstance): Promise<boolean> {
    if (!bot.config.coliseum.reclaimGems) return false;
    if (!bot.coliseumState || bot.coliseumState.gems <= 0) return false;
    bot.bot.log(`[ACTION] Reclamando ${bot.coliseumState.gems} gemas del coliseo...`);
    claimColiseumGems(bot.bot);
    bot.coliseumState.gems = 0;
    bot.emit('coliseumUpdated');
    await new Promise(r => setTimeout(r, 2000));
    return true;
  }
}

export class ColiseumAutoAttackAction implements BotAction {
  name = 'coliseumAutoAttack';
  async execute(bot: BotInstance): Promise<boolean> {
    if (!bot.config.coliseum.autoAttack) return false;
    const s = bot.coliseumState;
    if (!s || s.rivals.length === 0) return false;
    if (s.fightsDone >= 5) return false;

    const heroIds = getColiseumHeroes(bot.config.coliseum);
    if (heroIds.some(h => !h)) return false;

    let attacked = false;
    while (true) {
      const s = bot.coliseumState;
      if (!s || s.fightsDone >= 5) break;
      if (s.rivals.length === 0) break;
      if (!bot.bot.isOnline) break;

      let weakestIdx = 0;
      let weakestRank = Infinity;
      for (let i = 0; i < s.rivals.length; i++) {
        if (s.rivals[i].heroId < weakestRank) {
          weakestRank = s.rivals[i].heroId;
          weakestIdx = i;
        }
      }

      const rival = s.rivals[weakestIdx];
      bot.bot.log(`[ACTION] Coliseo: pelea ${s.fightsDone + 1}/5 vs "${rival.name}" (rank ${rival.heroId})`);

      attackRival(bot.bot, weakestIdx, rival.heroId, rival.name, heroIds);
      bot.bot.log(`[ACTION] 5208: atacando rival index=${weakestIdx} id=${rival.heroId}`);
      s.fightsDone++;

      attacked = true;
      await new Promise(r => setTimeout(r, 3000));

      bot.requestColiseumRivals();
      await bot.waitForColiseumUpdate(s.fightsDone, 6000);
    }

    if (attacked) bot.bot.log('[ACTION] Coliseo: secuencia completa');
    return attacked;
  }
}

export class SweepAction implements BotAction {
  name = 'sweep';
  async execute(bot: BotInstance): Promise<boolean> {
    if (!bot.config.sweep.enable) return false;
    const hex = bot.config.sweep.payload;
    const parsed = parseSweepPayload(hex);
    if (!parsed) {
      bot.bot.log(`[SWEEP] Payload inválido: ${hex}`);
      return false;
    }

    const cost = sweepResistenciaCost(parsed.tipo, parsed.etapa);
    const current = bot.getCurrentResistencia();
    if (current < cost) {
      bot.bot.log(`[SWEEP] Resistencia insuficiente: ${current}/${cost} necesaria`);
      return false;
    }

    const buf = Buffer.from(hex.replace(/\s/g, ''), 'hex');
    sendSweep(bot.bot, buf);
    const tipoStr = parsed.tipo === 1 ? 'x1' : 'x10';
    const etapaStr = parsed.etapa === 1 ? 'Normal' : parsed.etapa === 2 ? 'Elite' : 'Desafío';
    bot.bot.log(`[SWEEP] ${tipoStr} ${etapaStr} capítulo ${parsed.capitulo} — gastando ${cost} resistencia`);
    bot.consumeResistencia(cost);
    await new Promise(r => setTimeout(r, 2000));
    return true;
  }
}
