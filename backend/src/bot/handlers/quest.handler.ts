import type { BotInstance } from '../core/bot-instance';
import { parseCargoShip } from '../models/cargo-ship.types';
import { parse3112, QuestMemory } from '../models/quest.types';

const SHIP_MIN_SIZE = 54;

export function handle3112(bot: BotInstance, body: Buffer): void {
  if (body.length < 19) return;

  // 3112 puede ser barco O misiones. Solo parsear como barco si
  // pedimos datos con 3111 (shipDataRequested=true).
  if (bot.bot.shipDataRequested && body.length >= SHIP_MIN_SIZE) {
    try {
      const shipData = parseCargoShip(body);
      if (shipData && shipData.offers.length > 0) {
        const now = Date.now();
        const shipTime = shipData.timestamp.getTime();
        const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
        if (shipTime > now && shipTime < now + EIGHT_HOURS_MS) {
          bot.bot.shipDataRequested = false;
          bot.bot.cargoShip = shipData;
          bot.bot.emit('cargoShipUpdated');
          bot.bot.log(`[BARCO] 3112: ${shipData.offers.length} ofertas, expira ${shipData.timestamp.toLocaleString()}`);
          return;
        }
      }
    } catch {}
  }

  try {
    const mem = parse3112(body);
    if (mem) {
      if (mem.type === 'admin') {
        const oldCount = bot.adminQuestMem?.completedCount || 0;
        bot.adminQuestMem = mem;
        if (mem.completedCount > oldCount) {
          bot.bot.log(`[QUESTS] Admin: ${mem.completedCount}/${mem.count} completadas (${mem.completedCount - oldCount} nuevas)`);
        } else {
          bot.bot.log(`[QUESTS] Admin: ${mem.completedCount}/${mem.count} completadas`);
        }
      } else {
        const oldCount = bot.guildQuestMem?.completedCount || 0;
        bot.guildQuestMem = mem;
        if (mem.completedCount > oldCount) {
          bot.bot.log(`[QUESTS] Guild: ${mem.completedCount}/${mem.count} completadas (${mem.completedCount - oldCount} nuevas)`);
        } else {
          bot.bot.log(`[QUESTS] Guild: ${mem.completedCount}/${mem.count} completadas`);
        }
      }
      bot.emit('questsUpdated');
    }
  } catch {}
}
