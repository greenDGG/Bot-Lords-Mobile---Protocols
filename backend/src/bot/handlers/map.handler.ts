import type { BotInstance } from '../core/bot-instance';
import { classifyMapBody, parse2220, parseMapPacket } from '../models/map.types';
import { parseMapMarches } from '../models/map-march.types';
import { parseMonsterHit } from '../models/monster-hit.types';
import { parseTileInfo } from '../models/lucky-card.types';
import { parseTileOccupants, occupantTailOffset } from '../models/map-occupant.types';

export function handleMapData(bot: BotInstance, body: Buffer): void {
  if (body.length < 10) return;
  try {
    // Consulta de tile (2202 → 2220 de 60 B): estado de reclamo de un cofre.
    // Va antes de todo: si no, classifyMapBody lo toma como 'march' y metería
    // un registro inventado en mapMarches.
    const tileInfo = parseTileInfo(body);
    if (tileInfo) {
      bot.onTileInfo(tileInfo);
      return;
    }

    // Ocupación de tile (record 0x03): quién está en la coordenada y cuánto
    // recurso le queda (nombre vacío = nadie visible). Sin esto, los cuerpos de
    // 63 B caían en 'delivery' y creaban un tile fantasma en (64,0). El resto
    // del body (marcha, otro record) se procesa en la recursión.
    const occupants = parseTileOccupants(body);
    if (occupants.length > 0) {
      for (const hit of occupants) bot.onTileOccupant(hit.occupant);
      const rest = body.subarray(occupantTailOffset(occupants));
      if (rest.length >= 10 && rest.length < body.length) handleMapData(bot, rest);
      return;
    }

    // Golpe de caza: HP nuevo del monstruo + ida/vuelta de la marcha
    const hit = parseMonsterHit(body);
    if (hit) {
      bot.onMonsterHit(hit);
      return;
    }

    const kind = classifyMapBody(body);

    // Marcha: línea origen→destino (un body puede traer varias apiladas)
    if (kind === 'march') {
      const marches = parseMapMarches(body);
      if (marches.length > 0) {
        const now = Math.floor(Date.now() / 1000);
        // Conservar hasta ida+vuelta (2×duration): supply libera slot por tiempo
        for (const [id, m] of bot.mapMarches) {
          if (now > m.startTime + m.duration * 2) bot.mapMarches.delete(id);
        }
        let added = false;
        for (const march of marches) {
          if (now > march.startTime + march.duration * 2) continue;
          bot.mapMarches.set(march.id, march);
          added = true;
          bot.bot.log(`[MAPA] March ${march.name}${march.guild ? ` [${march.guild}]` : ''}: (${march.origin.x},${march.origin.y})→(${march.destination.x},${march.destination.y}) dur=${march.duration}s`);
          bot.onHuntMarch(march);
          bot.onLuckyCardMarch(march);
        }
        if (added) bot.emit('mapDataUpdated');
        return;
      }
    }

    // Update: segmentos de 62 bytes (11 header + 51 tile)
    if (kind === 'update') {
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
            const occ = bot.mapOccupants.get(tile.id);
            if (occ) tile.occupiedBy = occ;
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
    }

    // Entrega: paquete grande con header 3 / 5+n×10 (carga inicial y continuaciones)
    const parsed = parseMapPacket(body);
    if (parsed && parsed.tiles.length > 0) {
      let added = 0;
      for (const tile of parsed.tiles) {
        if (!bot.mapTiles.has(tile.id)) {
          added++;
        }
        const occ = bot.mapOccupants.get(tile.id);
        if (occ) tile.occupiedBy = occ;
        bot.mapTiles.set(tile.id, tile);
      }
      bot.bot.log(`[MAPA] Recibidos ${parsed.tiles.length} tiles (${added} nuevos, total=${bot.mapTiles.size})`);
      bot.emit('mapDataUpdated');
    }
  } catch {}
}

export function handleWonderSwitch(bot: BotInstance, body: Buffer): void {
  bot.bot.log(`[MAPA] 2228 (wonder switch resp): ${body.length}B ${body.toString('hex')}`);
}
