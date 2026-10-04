import type { BotInstance } from '../core/bot-instance';
import type { BotAction } from './bot-action';
import { refineMana as sendRefineMana } from '../commands/sweep.commands';
import { trainTroops } from '../features/train-troops';
import { buildItemBytes } from '../features/bag-helper';
import { calcTimeSeconds, calcCost, branchName } from '../parsers/troops.parser';
import { calcSimpleDeficit, useItemsForResource } from './action-helpers';
import { getBarracksCapacity, getSubsidyPct, getTrainSpeedPct } from '../features/player-stats';

export class RefineManaAction implements BotAction {
  name = 'refineMana';
  async execute(bot: BotInstance): Promise<boolean> {
    const cfg = bot.config.refineMana;
    if (!cfg.enable) return false;

    if (bot.refineManaCount >= 5) {
      bot.bot.log(`[ACTION] Refine mana: máximo (${bot.refineManaCount}/5) alcanzado`);
      return false;
    }
    bot.bot.log(`[ACTION] Refinando mana (${bot.refineManaCount + 1}/5)...`);

    const cost = { wheat: 10000, wood: 10000, stone: 10000, ore: 10000, gold: 10000 };
    if (!bot.resTracker.hasEnough(cost.wheat, cost.wood, cost.stone, cost.ore, cost.gold)) {
      const deficit = calcSimpleDeficit(bot.resTracker, cost.wheat, cost.wood, cost.stone, cost.ore, cost.gold);
      if (!deficit) {
        bot.bot.log('[ACTION] Recursos insuficientes para refinar mana');
        return false;
      }
      const cover: [number, string][] = [
        [deficit.wheat, 'wheat'],
        [deficit.wood, 'wood'],
        [deficit.stone, 'stone'],
        [deficit.ore, 'mineral'],
        [deficit.gold, 'gold'],
      ];
      for (const [need, bagKey] of cover) {
        if (need <= 0) continue;
        const ok = await useItemsForResource(bot, bagKey, need);
        if (!ok) {
          bot.bot.log(`[ACTION] Sin items en bolsa para cubrir ${bagKey} (refine mana)`);
          return false;
        }
      }
    }
    if (!bot.resTracker.tryConsume(cost.wheat, cost.wood, cost.stone, cost.ore, cost.gold)) {
      bot.bot.log('[ACTION] Recursos insuficientes para refinar mana (final)');
      return false;
    }

    sendRefineMana(bot.bot);
    bot.refineManaCount += 1;
    await new Promise(r => setTimeout(r, 2000));
    return true;
  }
}

export class TrainAction implements BotAction {
  private trainEnd = 0;
  private trainType = 0;
  private trainTier = 0;
  name = 'train';
  async execute(bot: BotInstance): Promise<boolean> {
    const cfg = bot.config.train;
    if (!cfg.enable || !cfg.type || cfg.type.length < 2) return false;

    if (bot.troopTraining && bot.troopTraining.remainingSeconds > 5) {
      bot.bot.log(`[ACTION] Ya entrenando (2402) restan ${bot.troopTraining.remainingSeconds}s`);
      return false;
    }

    if (Date.now() < this.trainEnd) {
      const rem = ((this.trainEnd - Date.now()) / 1000).toFixed(0);
      bot.bot.log(`[ACTION] Ya entrenando ${branchName(this.trainType)} T${this.trainTier + 1}, restan ${rem}s`);
      return false;
    }

    const type = parseInt(cfg.type[0], 10);
    const tier = parseInt(cfg.type[1], 10);
    if (type < 0 || type > 3 || tier < 0 || tier > 3) return false;

    const stats = bot.playerStats;
    const capacity = getBarracksCapacity(stats);
    if (capacity <= 0) {
      bot.bot.log('[ACTION] Sin datos de capacidad de cuartel (playerStats), no se entrena');
      return false;
    }
    const speedPct = getTrainSpeedPct(stats);
    const subsidyPct = getSubsidyPct(stats, type, tier);
    const timePerUnit = calcTimeSeconds(tier, speedPct);

    // Máximo lote pagaderable con los recursos actuales (sin items).
    const av = bot.resTracker;
    const fit = (need: number, have: number) => (need > 0 ? Math.floor(Math.max(0, have) / need) : Number.MAX_SAFE_INTEGER);
    const unitCost = calcCost(type, tier, 1, subsidyPct);
    const maxAffordable = Math.min(
      fit(unitCost.wheat, av.wheat), fit(unitCost.wood, av.wood), fit(unitCost.stone, av.stone),
      fit(unitCost.ore, av.ore), fit(unitCost.gold, av.gold),
    );

    // Lote = capacidad del cuartel; si no entran recursos, se cubre el déficit
    // con items de bolsa y, si tampoco alcanzan, se reduce al máximo pagaderable.
    let count = capacity;
    let cost = calcCost(type, tier, count, subsidyPct);
    let itemBytes: Buffer | undefined;
    if (!bot.resTracker.tryConsume(cost.wheat, cost.wood, cost.stone, cost.ore, cost.gold)) {
      const deficit = calcSimpleDeficit(bot.resTracker, cost.wheat, cost.wood, cost.stone, cost.ore, cost.gold);
      if (!deficit) {
        bot.bot.log('[ACTION] Recursos insuficientes para entrenar');
        return false;
      }
      itemBytes = buildItemBytes(bot.inventory, deficit.wheat, deficit.wood, deficit.stone, deficit.ore, deficit.gold);
      if (itemBytes.length === 0) {
        count = Math.min(capacity, maxAffordable);
        if (count <= 0) {
          bot.bot.log('[ACTION] Recursos insuficientes para entrenar');
          return false;
        }
        cost = calcCost(type, tier, count, subsidyPct);
        itemBytes = undefined;
        if (!bot.resTracker.tryConsume(cost.wheat, cost.wood, cost.stone, cost.ore, cost.gold)) {
          bot.bot.log('[ACTION] Recursos insuficientes para entrenar');
          return false;
        }
        bot.bot.log(`[ACTION] Recursos justos: lote reducido a x${count} (capacidad ${capacity})`);
      } else {
        bot.bot.log(`[ACTION] Usando ${itemBytes.length / 4} items de bolsa para entrenar`);
      }
    }
    const totalSec = timePerUnit * count;
    this.trainType = type;
    this.trainTier = tier;
    this.trainEnd = Date.now() + totalSec * 1000;

    bot.bot.log(`[ACTION] Entrenando ${branchName(type)} T${tier + 1} x${count} (vel +${speedPct}%, subsidio ${subsidyPct}%, termina ${new Date(this.trainEnd).toLocaleTimeString()}, ${totalSec.toFixed(0)}s totales)`);
    trainTroops(bot.bot, type, tier, count, this.trainEnd, itemBytes);
    await new Promise(r => setTimeout(r, 2000));
    return true;
  }
}
