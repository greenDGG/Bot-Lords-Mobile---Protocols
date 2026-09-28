import { BotEngine } from '../engine/bot-engine';
import { coordToBytes } from '../../models/map-coords';

/**
 * 2488 _MSG_REQUEST_SENDMONSTER — cazar un monstruo del mapa.
 *
 * Body: [coord 3 bytes][payload del nivel (hex, definido en config.hunt.levels)]
 * La coord se codifica igual que los tiles (encodeCoord), ej. 9c0085 = (394,152).
 */
export function huntMonster(bot: BotEngine, x: number, y: number, payloadHex: string): boolean {
  const clean = payloadHex.replace(/\s/g, '');
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) {
    bot.log(`[CAZA] Payload hex inválido: "${payloadHex}"`);
    return false;
  }
  const payload = Buffer.concat([coordToBytes(x, y), Buffer.from(clean, 'hex')]);
  bot.sendCommandPacket(2488, payload, true);
  bot.log(`[CAZA] 2488 → coord (${x},${y}) body=${payload.toString('hex')}`);
  return true;
}
