import type { BotInstance } from '../core/bot-instance';
import { CARD_TAIL, parseLuckyCardInfo, parseLuckyExchange, parseLuckySearchAck, parseLuckyCard9862, parseLuckyCard9868 } from '../models/lucky-card.types';

/** 9861: estado completo del evento (login + reset diario): cartas en mano. */
export function handle9861(bot: BotInstance, body: Buffer): void {
  const info = parseLuckyCardInfo(body);
  if (!info) {
    bot.bot.log(`[CARTA] 9861 sin parsear: ${body.toString('hex')}`);
    return;
  }
  bot.onLuckyCardInfo(info);
}

/** 9867: respuesta al 9866 — status 0 = aceptada, otro = rechazada (sin marcha). */
export function handle9867(bot: BotInstance, body: Buffer): void {
  bot.onLuckySearchAck(parseLuckySearchAck(body), body);
}

/** 9865: respuesta al 9864 (canje de dígitos por gems). */
export function handle9865(bot: BotInstance, body: Buffer): void {
  bot.onLuckyExchangeResponse(parseLuckyExchange(body), body);
}

/**
 * 9862: carta recibida; body 2 B = [dígito, flag]. Flag `01` = la carta entró
 * al top 10 de la mano; `00` = se reclamó el cofre pero la carta no entró (la
 * mano guarda sólo 10 cartas y exige un dígito estrictamente mayor que el
 * menor). El parser devuelve null con `00` y acá se loguea crudo, que es lo
 * correcto: esas cartas no sirven para el canje. Ver 9862.md.
 */
export function handle9862(bot: BotInstance, body: Buffer): void {
  bot.onLuckyCardEvent(parseLuckyCard9862(body), '9862', body);
}

/**
 * 9868: estado de la búsqueda (`01` = yendo, `02` = terminada), 15 B y **sin**
 * dígito: en 2286 logs ningún 9868 trae la cola `88 01 00 00 00 <dígito>`
 * (esa cola vive en el 3439, que no tiene handler). Sólo se emite algo si el
 * cuerpo trajera la cola, que no ocurre en la práctica.
 */
export function handle9868(bot: BotInstance, body: Buffer): void {
  const digit = parseLuckyCard9868(body);
  if (digit !== null) {
    bot.onLuckyCardEvent(digit, '9868', body);
    return;
  }
  if (body.includes(CARD_TAIL)) bot.onLuckyCardEvent(null, '9868', body);
}
