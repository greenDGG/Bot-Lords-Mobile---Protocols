import { BotEngine } from '../engine/bot-engine';
import { coordToBytes } from '../../models/map-coords';
import { waitMapProtoCooldown } from './map.commands';

/**
 * Carta de la Suerte: comandos de busca de cartas en el mapa.
 *
 * 2202 coord → selecciona el tile y responde 2220 (60 B) con `NOT`/`YES`
 * (si ese cofre ya lo reclamó ESTA cuenta). Comparte el cooldown de 1 s del
 * 2201/2202/2452, así que se espera turno antes de cada envío.
 */
export async function queryTileInfo(bot: BotEngine, x: number, y: number): Promise<void> {
  await waitMapProtoCooldown(bot);
  bot.sendCommandPacket(2202, coordToBytes(x, y), true);
}

/**
 * 9866 `_MSG_REQUEST_LUCKYCARD_MARCHING` → manda la tropa a buscar la carta
 * al cofre. Body: seq + coord (igual que el 2202).
 * Sólo puede haber una búsqueda por cuenta hasta que la tropa vuelve.
 */
export async function startLuckyCardSearch(bot: BotEngine, x: number, y: number): Promise<void> {
  await waitMapProtoCooldown(bot);
  bot.sendCommandPacket(9866, coordToBytes(x, y), true);
}

/**
 * 9864 `_MSG_REQUEST_LUCKYCARD_EXCHANGE` → canjea los dígitos por las gems
 * mostradas (una sola vez por evento).
 *
 * Body confirmado con 3 capturas reales (plain, 8 B = seq + payload):
 *   18010000 4b030000 → seq 280, valor 843
 *   30000000 da030000 → seq  48, valor 986
 *   37000000 83020000 → seq  55, valor 643
 * Es decir: u32 LE = el número canjeado (los 3 dígitos más altos en orden
 * descendente; 999 cuando hay tres nueves). El seq lo agrega sendCommandPacket.
 */
export async function exchangeLuckyCards(bot: BotEngine, value: number): Promise<void> {
  const payload = Buffer.alloc(4);
  payload.writeUInt32LE(value >>> 0, 0);
  bot.sendCommandPacket(9864, payload, true);
}
