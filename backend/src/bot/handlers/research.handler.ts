import type { BotInstance } from '../core/bot-instance';

export function handleResearch(_bot: BotInstance, _body: Buffer): void {
  _bot.emit('researchUpdated');
}
