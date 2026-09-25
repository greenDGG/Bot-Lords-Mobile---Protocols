import type { BotInstance } from '../core/bot-instance';

/**
 * Handler del proto 2453 (_MSG_RESP_SEND_RESHELP).
 *
 * Largo (body >= 17B): la caravana SÍ salió — trae los datos del viaje:
 *   [2..4]   coordenada destino (3B)
 *   [5..8]   startTime u32 LE (inicio de la ida)
 *   [9..12]  separador
 *   [13..16] duración de ida u32 LE (segundos)
 * → slot ocupado hasta startTime + 2×duración (ida+vuelta).
 *
 * Corto (body < 17B): el servidor rechazó el 2452 y NO salió ninguna caravana.
 * El byte es un código de error/fallo (p. ej. `0e`). El slot se libera al
 * instante, se devuelve la caravana a la cola y, tras 3 fallos seguidos, se
 * aborta el lote.
 */
export function handleCaravanAck(bot: BotInstance, body: Buffer): void {
  if (body.length >= 17) {
    let ok = false;
    try {
      const startTime = body.readUInt32LE(5);
      const duration = body.readUInt32LE(13);
      if (duration > 0 && duration < 30 * 24 * 3600 && startTime > 1_600_000_000) {
        const freeAt = startTime + duration * 2;
        bot.bot.log(`[SUPPLY] 2453 datos: ida ${duration}s, vuelta total ${duration * 2}s, slot libre t=${freeAt}`);
        bot.onCaravanDeparted(freeAt);
        ok = true;
      }
    } catch {}
    if (!ok) {
      bot.bot.log(`[SUPPLY] 2453 largo sin datos válidos (${body.length}B) → fallo de envío`);
      bot.onCaravanSendFailed(body.length > 0 ? body[0]! : -1);
    }
  } else {
    bot.onCaravanSendFailed(body.length > 0 ? body[0]! : -1);
  }
  if (bot.supplyCaravanAckResolve) {
    const resolve = bot.supplyCaravanAckResolve;
    bot.supplyCaravanAckResolve = null;
    resolve();
  }
}
