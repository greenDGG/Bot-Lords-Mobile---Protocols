import type { BotInstance } from '../core/bot-instance';
import type { BotAction } from './bot-action';

/**
 * Carta de la Suerte (cofres de especie 217 en el mapa).
 *
 * Un paso por ejecución: consulta hasta 3 cofres con 2202 (el más cercano
 * primero) y manda la tropa (9866) con el primero que responda `NOT`. Los que
 * contesten "reclamado" / "sin flag" se cachean y se saltan sin cortar el paso.
 * Mientras la tropa no vuelve (2×duración del ack 9867) el paso no hace nada,
 * así que sólo hay UNA búsqueda por cuenta. Todos los envíos salen de acá: del
 * bucle principal de ActionRunner.
 */
export class LuckyCardAction implements BotAction {
  name = 'luckyCard';

  async execute(bot: BotInstance): Promise<boolean> {
    return bot.runLuckyCardStep();
  }
}
