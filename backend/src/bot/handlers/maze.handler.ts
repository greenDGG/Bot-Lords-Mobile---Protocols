import type { BotInstance } from '../core/bot-instance';
import { parseMaze7004 } from '../models/maze.types';

/**
 * Laberinto (7004): parsea cada respuesta de golpe y loguea en humano.
 * Layout y semántica: `docs/protocols/7004.md`.
 *
 * Estado por cuenta (WeakMap): las estrellas y los tiros gratis del paquete
 * anterior, para clasificar el golpe como gratis/pago por Δ y para marcar
 * contradicciones (pago con tiros gratis pendientes — no observadas).
 */
interface MazeTrack {
  stars: number | null;
  free: number | null;
}
const track = new WeakMap<BotInstance, MazeTrack>();

export function handle7004(bot: BotInstance, body: Buffer): void {
  const p = parseMaze7004(body);
  if (!p) {
    bot.bot.log(`[LABERINTO] 7004 sin parsear (${body.length}B): ${body.toString('hex')}`);
    return;
  }

  if (!p.isHit) {
    if (p.kindName === 'sin-estrellas') bot.bot.log('[LABERINTO] rechazo: estrellas insuficientes (<100) [65]');
    else if (p.kindName === 'duplicado') bot.bot.log('[LABERINTO] rechazo: golpe duplicado [67]');
    else bot.bot.log(`[LABERINTO] kind=0x${p.kind.toString(16)} sin decodificar (${p.raw})`);
    return;
  }

  const prev = track.get(bot);
  const gratis = p.freeShots ?? 0;
  const stars = p.stars ?? 0;
  const elite = p.hitType === 0 ? 'élite' : 'normal';
  const gremblin = (p.gol ?? 0) > 10 ? ' [gremblin]' : '';

  if (p.kindName === 'golpe') {
    let diff = '';
    if (prev?.stars != null) {
      const spent = prev.stars - stars;
      const prevFree = prev.free ?? 0;
      if (prevFree > 0) diff = spent === 0 ? ' gratis' : ` ¡PAGÓ con ${prevFree} gratis!`;
      else if (spent > 0) diff = ` pago -${spent}`;
      else if (spent === 0) diff = ' gratis (sin tiro previo)';
      else diff = ` estrellas +${-spent}`;
      if (gratis > prevFree) diff += ` +${gratis - prevFree} tiras gratis`;
    }
    bot.bot.log(
      `[LABERINTO] golpe gol=${p.gol}${gremblin} ${elite} estrellas=${stars}${diff}` +
        ` item=${p.itemId}x${p.qty}${p.item4x ? ' (4xxx)' : ''} gratis=${gratis} gems=${p.gems} modo=${p.mode} unk1=${p.unk1}`,
    );
  } else if (p.kindName === 'ronda') {
    bot.bot.log(`[LABERINTO] ronda terminada (gol=10) — nueva ronda, estrellas=${stars} gratis=${gratis}`);
  } else if (p.kindName === 'gremblin') {
    bot.bot.log(`[LABERINTO] ¡GREMBLIN aparece! (gol=${p.gol}) gems=${p.gems} item=${p.itemId}x${p.qty}`);
  } else {
    bot.bot.log(`[LABERINTO] gremblin se retira — gems=${p.gems} item=${p.itemId}x${p.qty}`);
  }

  track.set(bot, { stars, free: gratis });
}
