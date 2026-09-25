import type { BotInstance } from '../core/bot-instance';
import type { BotAction } from './bot-action';

export class SupplyAction implements BotAction {
  name = 'supply';
  async execute(bot: BotInstance): Promise<boolean> {
    const cfg = bot.config.supply;
    if (!cfg.enable || !cfg.targetPlayer || !bot.resources) return false;
    if (bot.supplyBusy) return false;

    if (bot.supplyPending.length > 0) {
      bot.bot.log(`[SUPPLY] ${bot.supplyPending.length} recursos pendientes, en curso...`);
      return false;
    }

    const res = bot.resources;
    const entries: { name: string; amount: number }[] = [];
    let anyAbove = false;

    for (const r of [{ name: 'trigo', amount: res.wheat },
                     { name: 'piedra', amount: res.stone },
                     { name: 'madera', amount: res.wood },
                     { name: 'mineral', amount: res.mineral },
                     { name: 'oro', amount: res.gold }]) {
      if (r.amount <= cfg.threshold) continue;
      anyAbove = true;
      const totalCaravans = Math.ceil(r.amount / cfg.maxAmount);
      entries.push({ name: r.name, amount: totalCaravans * cfg.maxAmount });
    }

    if (!anyAbove) return false;

    const err = await bot.resolveTargetLocation(cfg.targetPlayer);
    if (err) {
      bot.bot.log(`[SUPPLY] ${err}`);
      return false;
    }

    bot.supplyPending = entries;
    bot.supplyCurrentTarget = cfg.targetPlayer;
    bot.bot.log(`[SUPPLY] Recursos pendientes: ${entries.map(e => `${e.name} ${(e.amount / 1e6).toFixed(1)}M`).join(', ')}`);

    void bot.sendCaravanBatch();
    return true;
  }
}
