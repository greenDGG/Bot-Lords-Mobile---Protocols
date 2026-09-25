import type { BotInstance } from '../core/bot-instance';

export function handleDisconnect(bot: BotInstance, _body: Buffer): void {
  bot.resetTransientState();
  const delay = Math.max(bot.config.reconnectTime, 5) * 1000;
  bot.bot.log(`[!] Proto 1010: otro dispositivo conectado. Reconectando en ${delay / 1000}s...`);
  if (bot.reconnectTimer) clearTimeout(bot.reconnectTimer);
  bot.reconnectTimer = setTimeout(() => {
    bot.connecting = false;
    bot.connected = false;
    bot.connect();
  }, delay);
}
