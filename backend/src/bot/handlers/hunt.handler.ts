import type { BotInstance } from '../core/bot-instance';

/**
 * Respuestas del servidor a la caza (2488 _MSG_REQUEST_SENDMONSTER).
 *
 *   2489 _MSG_RESP_SENDMONSTER   — 31B (`0008…`) = ataque aceptado, crea marcha
 *                                  1B `01` = rechazado: el bicho ya no existe
 *                                            (muerto por otro jugador)
 *                                  1B `08`/`05` = visto, sin marcha (transitorio)
 *   2490 _MSG_RESP_MONSTERRETURN — el monstruo/marcha vuelve
 *   2491 _MSG_RESP_MONSTERHOME   — visto con body=08
 *   2492 _MSG_RESP_MONSTER_INFO  — info/último golpe (timestamp + serial)
 */
function logHuntResp(bot: BotInstance, proto: number, body: Buffer): void {
  bot.bot.log(`[CAZA] ${proto} ← ${body.length}B ${body.toString('hex')}`);
  bot.emitHuntUpdate();
}

export function handle2489(bot: BotInstance, body: Buffer): void {
  logHuntResp(bot, 2489, body);
  if (body.length === 1 && body[0] === 0x01) bot.onHuntAttackRejected();
}

export function handle2490(bot: BotInstance, body: Buffer): void {
  logHuntResp(bot, 2490, body);
}

export function handle2491(bot: BotInstance, body: Buffer): void {
  logHuntResp(bot, 2491, body);
}

export function handle2492(bot: BotInstance, body: Buffer): void {
  logHuntResp(bot, 2492, body);
}
