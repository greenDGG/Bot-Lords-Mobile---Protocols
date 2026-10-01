/**
 * Escuadra recomendada en la caza (huntData.json → monsters-data.json).
 *
 * Regla: si el bot TIENE los héroes recomendados, ataca con esa escuadra;
 * si no, usa la debilidad del monstruo (payloadHexMagia / payloadHexFisico).
 *
 * El payload del 2488 (14 bytes) es:
 *   [01][5 × u16 LE heroId][trailer de 3 bytes]
 * buildHuntPayload sólo cambia los 5 heroIds del hex configurado y conserva
 * el prefijo y el trailer tal como los capturó el jugador.
 */
import { getMonsterSquad } from './monsters';

export type HuntSquadFuente = 'recomendado' | 'p2p';

export interface HuntSquad {
  heroIds: number[];
  fuente: HuntSquadFuente;
  /** nivel de huntData usado */
  nivel: number;
}

function tieneTodos(owned: Set<number>, heroIds: number[]): boolean {
  return heroIds.length === 5 && new Set(heroIds).size === 5 && heroIds.every((h) => owned.has(h));
}

/**
 * Escuadra a usar para (monstruo, nivel) según los héroes del bot.
 * null = sin escuadra recomendada propia → atacar por debilidad.
 */
export function pickHuntSquad(
  ownedHeroIds: number[],
  monsterId: number | string,
  level: number,
): HuntSquad | null {
  const squad = getMonsterSquad(monsterId, level);
  if (!squad) return null;
  const owned = new Set(ownedHeroIds);
  if (tieneTodos(owned, squad.heroes)) {
    return { heroIds: squad.heroes, fuente: 'recomendado', nivel: squad.nivel };
  }
  if (tieneTodos(owned, squad.p2p)) {
    return { heroIds: squad.p2p, fuente: 'p2p', nivel: squad.nivel };
  }
  return null;
}

/**
 * Payload 2488 con otra escuadra: conserva el primer byte y el trailer de la
 * config, sustituye los 5 heroIds. null si la base no tiene esa forma.
 */
export function buildHuntPayload(baseHex: string, heroIds: number[]): string | null {
  if (heroIds.length !== 5) return null;
  const clean = (baseHex || '').replace(/\s/g, '');
  if (clean.length < 28 || clean.length % 2 !== 0) return null;
  const buf = Buffer.from(clean, 'hex');
  if (buf.length < 14 || buf[0] !== 0x01) return null;
  heroIds.forEach((h, i) => buf.writeUInt16LE(h & 0xffff, 1 + i * 2));
  return buf.toString('hex');
}
