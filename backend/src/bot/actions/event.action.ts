import type { BotInstance } from '../core/bot-instance';
import type { BotAction } from './bot-action';

export class EventsAction implements BotAction {
  name = 'events';
  async execute(bot: BotInstance): Promise<boolean> {
    if (!bot.config.events.enable) return false;
    const due = bot.getAvailableEvents();
    if (due.length === 0) return false;
    const evt = due[0];
    bot.bot.log(`[EVENTOS] Ejecutando "${evt.name}" (acción: ${evt.action || `proto ${evt.claimProto}`})...`);
    await bot.runEvent(evt);
    await new Promise(r => setTimeout(r, 2000));
    return true;
  }
}

export class Relocate implements BotAction {
  name = "relocate";
  async execute(_bot: BotInstance): Promise<boolean> {
    return true;
  }
}
