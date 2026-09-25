import type { BotInstance } from '../core/bot-instance';

export function handleMysteryBox(bot: BotInstance, body: Buffer): void {
  if (body.length < 6) return;
  const nextTs = body.readUInt32LE(2);
  bot.config.mysteryBox.next = nextTs;
  bot.saveConfig();
  bot.bot.log(`[MYSTERY] Próximo mystery box: ${new Date(nextTs * 1000).toLocaleTimeString()}`);
}
