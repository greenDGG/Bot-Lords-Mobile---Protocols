import type { BotInstance } from '../core/bot-instance';
import { BuildingId } from '../models/buildings.types';
import { parse2001, parse2002 } from '../parsers/buildings.parser';
import { computePlayerStats } from '../features/player-stats';

export function handleBuildingState(bot: BotInstance, body: Buffer): void {
  if (body.length < 1) return;
  try {
    bot.buildingState = parse2001(body);
    bot.playerStats = computePlayerStats(bot);
    bot.bot.log(`[BUILDINGS] ${bot.buildingState.buildings.length} construcciones cargadas`);
    bot.emit('buildingStateUpdated');
  } catch {}
}

export function handleConstructions(bot: BotInstance, body: Buffer): void {
  if (body.length < 18) return;
  try {
    bot.bot.log(`[2002 RAW] ${body.toString('hex')}`);
    const cd = parse2002(body);
    if (cd) {
      bot.constructions = cd;
      for (const c of cd.constructions) {
        if (c.active) {
          const name = BuildingId[c.id] || `ID${c.id}`;
          bot.bot.log(`[CONSTRUYENDO] ${name} pos=0x${c.position.toString(16)} lvl=${c.level} — queda ${c.remainingSeconds}s`);
        }
      }
      bot.emit('constructionsUpdated');
    }
  } catch {}
}
