import type { BotInstance } from '../core/bot-instance';
import type { BotAction } from './bot-action';
import { nextByResetTime } from './action-helpers';
import { randomEmoji } from '../data/emojis-db';

/**
 * Misión diaria "enviar 1 emoticono" (3001 con tipo 0x6D): manda un
 * emoticono aleatorio **entre los que la cuenta tiene** (los 40 básicos o
 * los que desbloqueó con su item en el inventario) una vez por reset diario
 * de la cuenta y refresca la lista de misiones (3111 02) para que
 * quest.action reclame.
 */
export class SendEmojiAction implements BotAction {
  name = 'sendEmoji';

  async execute(bot: BotInstance): Promise<boolean> {
    const cfg = bot.config.sendEmoji;
    if (!cfg?.enable) return false;
    if (cfg.next !== 0 && cfg.next > Math.floor(Date.now() / 1000)) return false;
    const emoji = randomEmoji(bot.inventory);
    if (!emoji) return false;

    if (!bot.bot.sendEmoji(emoji.id)) return false;
    bot.bot.log(`[ACTION] Emoticono diario enviado: ${emoji.name ?? emoji.nameEn ?? `#${emoji.id}`}`);
    cfg.next = nextByResetTime(bot.getDailyResetSec());
    bot.saveConfig();
    bot.bot.requestQuestData();
    return true;
  }
}
