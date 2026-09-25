import type { BotInstance } from '../core/bot-instance';

/**
 * Handler del proto 2455: el servidor confirma que la caravana llegó a destino.
 * El bucle sendCaravanBatch gestiona los slots con el freeAt del 2453 (startTime + 2x duracion); aqui solo se limpia estado residual si no hay un lote en curso y no quedan pendientes.
 */
export function handleCaravanComplete(bot: BotInstance, _body: Buffer): void {
  bot.bot.log(`[CARAVANA] Recibida 2455, lote completado`);
  bot.supplyBatchSent = false;
  if (!bot.supplyBusy) {
    bot.activeCaravans = 0;
    if (bot.supplyPending.length === 0) {
      bot.supplyManualActive = false;
      bot.supplyCurrentTarget = null;
      bot.actions.resume();
    }
  }
}
