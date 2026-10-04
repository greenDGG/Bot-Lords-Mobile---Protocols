import type { BotInstance } from '../core/bot-instance';
import type { BotAction } from './bot-action';
import { attackRival, claimColiseumGems } from '../commands/coliseum.commands';
import { sendSweep } from '../commands/sweep.commands';
import { getColiseumHeroes, parseSweepPayload } from '../../models/bot-config';
import {
  MAIN_PER_CHAPTER,
  STAGES_PER_CHAPTER,
  SWEEP_CHAPTERS as SWEEP_CHAPTER_LIST,
  chapterForSweepIdx,
  getEliteStage,
  stageForSweepIdx,
  sweepStaminaCost,
} from '../data/hero-stages-db';

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

export function sweepCandidates(etapa: number): number[] {
  const per = etapa === 1 ? STAGES_PER_CHAPTER : MAIN_PER_CHAPTER;
  const total = SWEEP_CHAPTER_LIST.length * per;
  const step = etapa === 1 ? 3 : 1;
  const out: number[] = [];
  for (let i = step; i <= total; i += step) out.push(i);
  return out.reverse();
}

export function pickAutoSweep(bot: BotInstance): { etapa: number; idx: number; tipo: number } | null {
  const sweep = bot.config.sweep;
  const etapa = sweep.autoEtapa === 2 || sweep.autoEtapa === 3 ? sweep.autoEtapa : 1;
  const tipo = sweep.autoTipo === 2 ? 2 : 1;
  let unknownIdx = 0;
  let okIdx = 0;
  for (const idx of sweepCandidates(etapa)) {
    const status = bot.sweepStageStatus(etapa, idx);
    if (!status && !unknownIdx) unknownIdx = idx;
    if (status === 'ok' && !okIdx) okIdx = idx;
  }
  const idx = unknownIdx > okIdx ? unknownIdx : okIdx || unknownIdx;
  return idx ? { etapa, idx, tipo } : null;
}

export class SweepAction implements BotAction {
  name = 'sweep';
  async execute(bot: BotInstance): Promise<boolean> {
    if (!bot.config.sweep.enable) return false;
    const sweep = bot.config.sweep;
    const target = sweep.auto
      ? pickAutoSweep(bot)
      : parseSweepPayload(sweep.payload || '');
    if (!target) {
      bot.bot.log('[SWEEP] Sin etapa válida ni aprendida — revisá Configuración → Barrido');
      return false;
    }
    const { tipo, etapa, idx } = target;
    if ((tipo !== 1 && tipo !== 2) || (etapa !== 1 && etapa !== 2 && etapa !== 3)) {
      bot.bot.log(`[SWEEP] Payload inválido: tipo=${tipo} etapa=${etapa} idx=${idx}`);
      return false;
    }
    if (chapterForSweepIdx(etapa, idx) === null) {
      bot.bot.log(`[SWEEP] idx ${idx} fuera de rango para etapa ${etapa}`);
      return false;
    }

    const cost = sweepStaminaCost(tipo, etapa, idx);
    const current = bot.getCurrentResistencia();
    if (current < cost) {
      bot.bot.log(`[SWEEP] Resistencia insuficiente: ${current}/${cost} necesaria`);
      return false;
    }

    const buf = Buffer.from([tipo, etapa, idx & 0xff, 0, 1]);
    const wait = bot.beginSweepRequest(etapa, idx, tipo);
    sendSweep(bot.bot, buf);
    const tipoStr = tipo === 1 ? 'x1' : 'x10';
    const etapaStr = etapa === 1 ? 'Normal' : etapa === 2 ? 'Elite' : 'Desafío';
    const chapterId = chapterForSweepIdx(etapa, idx);
    const stage = stageForSweepIdx(etapa, idx);
    const isNormal = etapa === 1;
    const position = !isNormal && stage ? stage : null;
    const elite = chapterId && position ? getEliteStage(chapterId, position) : undefined;
    const where = chapterId && stage
      ? `capítulo ${chapterId} etapa ${chapterId}-${isNormal ? stage : stage * 3}`
      : `idx ${idx} fuera de rango`;
    const medal = elite ? ` — ${elite.heroName} (medalla #${elite.medalItemId})` : '';
    bot.bot.log(`[SWEEP] ${tipoStr} ${etapaStr} ${where}${medal} — gastando ${cost} resistencia`);
    const res = await wait;
    if (!res) {
      bot.bot.log('[SWEEP] Sin respuesta 1806 — se asume el gasto de resistencia');
      bot.consumeResistencia(cost);
    }
    return true;
  }
}
