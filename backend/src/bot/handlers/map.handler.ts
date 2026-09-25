import type { BotInstance } from '../core/bot-instance';
import { parse2220, parseMapPacket } from '../models/map.types';
import { parseMapMarch } from '../models/map-march.types';

export function handleMapData(bot: BotInstance, body: Buffer): void {
  if (body.length < 10) return;
  try {
    // Variante march de 2220 (no múltiplo de 62): línea origen→destino
    if (body.length % 62 !== 0) {
      const march = parseMapMarch(body);
      if (march) {
        const now = Math.floor(Date.now() / 1000);
        // Conservar hasta ida+vuelta (2×duration): supply libera slot por tiempo
        for (const [id, m] of bot.mapMarches) {
          if (now > m.startTime + m.duration * 2) bot.mapMarches.delete(id);
        }
        if (now <= march.startTime + march.duration * 2) {
          bot.mapMarches.set(march.id, march);
          bot.bot.log(`[MAPA] March ${march.name}${march.guild ? ` [${march.guild}]` : ''}: (${march.origin.x},${march.origin.y})→(${march.destination.x},${march.destination.y}) dur=${march.duration}s`);
          bot.emit('mapDataUpdated');
        }
        return;
      }
    }

    // Proto 2220: parser dedicado que divide en segmentos de 62 bytes (11 header + 51 tile)
    const tiles = parse2220(body);
    if (tiles.length > 0) {
      let added = 0;
      let updated = 0;
      let removed = 0;
      for (const tile of tiles) {
        if (tile.empty) {
          // Tile vacío → eliminar del mapa
          if (bot.mapTiles.delete(tile.id)) removed++;
        } else {
          // Tile con contenido → agregar/actualizar
          if (!bot.mapTiles.has(tile.id)) added++;
          else updated++;
          bot.mapTiles.set(tile.id, tile);
        }
      }
      bot.bot.log(`[MAPA] 2220: ${tiles.length} tiles (${added} nuevos, ${updated} actualizados, ${removed} eliminados, total=${bot.mapTiles.size})`);
      for (const t of tiles) {
        bot.bot.log(`  - (${t.x},${t.y}) type=${t.type} ${t.empty ? 'ELIMINADO' : `name="${t.name}"`}`);
      }
      bot.emit('mapDataUpdated');
      return;
    }

    // Fallback: paquete completo con header 25/3 (carga inicial del mapa)
    const parsed = parseMapPacket(body);
    if (parsed && parsed.tiles.length > 0) {
      let added = 0;
      for (const tile of parsed.tiles) {
        if (!bot.mapTiles.has(tile.id)) {
          added++;
        }
        bot.mapTiles.set(tile.id, tile);
      }
      bot.bot.log(`[MAPA] Recibidos ${parsed.tiles.length} tiles (${added} nuevos, total ${bot.mapTiles.size})`);
      bot.emit('mapDataUpdated');
    }
  } catch {}
}

export function handleWonderSwitch(bot: BotInstance, body: Buffer): void {
  bot.bot.log(`[MAPA] 2228 (wonder switch resp): ${body.length}B ${body.toString('hex')}`);
}