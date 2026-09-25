import type { BotInstance } from '../core/bot-instance';
import type { BotAction } from './bot-action';
import { exchangeShipSlot } from '../commands/ship.commands';
import { BAG_RES_KEYS, getResourceAmount, useItemsForResource } from './action-helpers';

export class ShipAction implements BotAction {
  name = 'ship';
  async execute(bot: BotInstance): Promise<boolean> {
    if (!bot.config.ship.intercambio) return false;
    const now = Math.floor(Date.now() / 1000);

    if (bot.config.ship.next !== 0 && now >= bot.config.ship.next) {
      bot.config.ship.next = 0;
      bot.config.ship.reclaim = false;
      bot.bot.cargoShip = undefined;
      bot.saveConfig();
      bot.bot.log(`[ACTION] Barco expirado, solicitando nuevos datos...`);
      bot.bot.requestShipData();
      bot.bot.requestQuestData();
      return false;
    }

    if (bot.config.ship.reclaim) return false;

    const ship = bot.bot.cargoShip;
    if (!ship?.offers?.length) {
      if (bot.config.ship.lastExchangedTs === 0) {
        bot.bot.requestShipData();
        bot.bot.requestQuestData();
      }
      return false;
    }

    const shipTs = Math.floor(ship.timestamp.getTime() / 1000);
    if (shipTs === bot.config.ship.lastExchangedTs) {
      bot.bot.log(`[ACTION] Barco ya intercambiado anteriormente (ts=${shipTs}), saltando`);
      bot.bot.cargoShip = undefined;
      return false;
    }

    bot.bot.log(`[ACTION] Intercambiando barco (${ship.offers.length} ofertas)...`);

    const resNames = ['wheat', 'stone', 'wood', 'ore', 'gold'];
    const resLabel = ['trigo', 'piedra', 'madera', 'mineral', 'oro'];

    for (let i = 0; i < ship.offers.length; i++) {
      const offer = ship.offers[i];

      if (offer.price > 0 && bot.resTracker) {
        const cr = offer.costResource;
        const price = offer.price;
        const current = getResourceAmount(bot, cr);
        const bagKey = BAG_RES_KEYS[resNames[cr]];

        if (current < price) {
          const deficit = price - current;
          let need = deficit;
          if (cr === 0 && bot.resources && bot.resources.wheatProd < 0) {
            const buffer = Math.ceil(Math.abs(bot.resources.wheatProd) / 3600) + 100;
            need += buffer;
            bot.bot.log(`[BARCO] Trigo prod=${bot.resources.wheatProd}/h, buffer=${buffer}`);
          }
          const ok = await useItemsForResource(bot, bagKey, need);
          if (!ok) {
            bot.bot.log(`[BARCO] ${resLabel[cr]} insuficiente slot ${i} (faltan ${deficit})`);
            continue;
          }
          await new Promise(r => setTimeout(r, 1500));
        }

        bot.resTracker.deduct(
          cr === 0 ? price : 0,
          cr === 2 ? price : 0,
          cr === 1 ? price : 0,
          cr === 3 ? price : 0,
          cr === 4 ? price : 0,
        );
      }

      bot.bot.log(`[BARCO] Enviando intercambio slot=${i} cost=${resLabel[offer.costResource < 5 ? offer.costResource : 0]}(${offer.price}) cat=${offer.categoryId} obj=${offer.objectId} qty=${offer.quantity}`);
      exchangeShipSlot(bot.bot, i);
      await new Promise(r => setTimeout(r, 500));
    }

    bot.config.ship.reclaim = true;
    bot.config.ship.next = Math.floor(ship.timestamp.getTime() / 1000);
    bot.config.ship.lastExchangedTs = Math.floor(ship.timestamp.getTime() / 1000);
    bot.bot.cargoShip = undefined;
    bot.saveConfig();
    bot.bot.log(`[ACTION] Barco intercambiado, próximo hasta ${ship.timestamp.toLocaleString()}`);
    return true;
  }
}
