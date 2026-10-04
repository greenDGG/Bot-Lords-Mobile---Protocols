import type { BotInstance } from '../core/bot-instance';
import { chapterForSweepIdx, getEliteStage, stageForSweepIdx } from '../data/hero-stages-db';

export function handleQuickBattle(bot: BotInstance, body: Buffer): void {
  const status = body.length > 0 ? body[0] : 0xff;
  const pending = bot.takeSweepPending();
  const ok = status === 0;
  const etapa = pending?.etapa ?? (body.length > 22 ? body[22] : 0);
  const idx = pending?.idx ?? (body.length > 23 ? body[23] : 0);
  const stamina = ok && body.length >= 12 ? body.readUInt16LE(10) : 0;
  const stars = ok && body.length > 52 && pending?.tipo !== 2 ? body[52] : 0;

  const chapter = chapterForSweepIdx(etapa, idx);
  const stage = stageForSweepIdx(etapa, idx);
  const where = chapter && stage
    ? etapa === 1
      ? `capítulo ${chapter} etapa ${chapter}-${stage}`
      : `capítulo ${chapter} etapa ${chapter}-${stage * 3}`
    : `idx ${idx}`;

  bot.learnSweepStage(etapa, idx, ok);

  if (ok) {
    const diff = bot.getCurrentResistencia() - stamina;
    if (diff > 0) {
      bot.consumeResistencia(diff);
    } else if (diff < 0) {
      bot.lastRes = stamina;
      bot.emit('playerInfoUpdated');
    }
    const main = chapter && stage
      ? etapa === 1
        ? (stage % 3 === 0 ? getEliteStage(chapter, stage / 3) : undefined)
        : getEliteStage(chapter, stage)
      : undefined;
    const medal = main ? ` — ${main.heroName} (medalla #${main.medalItemId})` : '';
    const starsTxt = stars > 0 && stars <= 3 ? ` (${stars}★)` : '';
    bot.bot.log(
      `[SWEEP] ${where}${medal} completada${starsTxt} — resistencia ${bot.getCurrentResistencia()}/${bot.getResistenciaMax()}`
    );
  } else {
    bot.bot.log(`[SWEEP] ${where} rechazada por el servidor (estado ${status}) — no gastó resistencia`);
  }

  bot.settleSweep({ ok, status, stamina, stars, etapa, idx });
}
