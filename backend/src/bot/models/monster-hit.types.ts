import { decodeCoordId } from '../../models/map-coords';

/**
 * Actualización de HP de un monstruo (proto 2220 variante "monster hit").
 * Llega tras cada golpe de la caza (2488) y trae además ida/vuelta de la marcha.
 */
export interface MonsterHitUpdate {
  /** Monstruo golpeado */
  monster: { x: number; y: number; id: number };
  /** HP nuevo del monstruo, en % (0 - 100) */
  hp: number;
  /** Atacante (castillo propio) */
  attacker: { x: number; y: number };
  name: string;
  guild: string;
  kingdom: number;
  /** Unix seconds del golpe */
  eventTime: number;
  /** Segundos de vuelta A (monstruo) → B (atacante) */
  returnSeconds: number;
}

/** Offset del bloque de marcha en esta variante (en la marcha simple es 17). */
const HIT_NAME_OFFSET = 48;
/** 48 + nombre 13 + guild 3 + reino 2 + coord 3 + coord 3 + time 4 + pad 4 + duración 4 */
const HIT_MIN_LENGTH = 93;
const HIT_MAX_LENGTH = 500;

/**
 * Parser de la variante "monster hit" de proto 2220.
 *
 * Layout (muestra confirmada, 104 bytes):
 *   [0..8]    prefijo 9B (SIN DESCIFRAR)
 *   [9..11]   coord del monstruo 3B
 *   [12..15]  HP nuevo float32 LE (0..100)
 *   [16..47]  prefijo 32B (SIN DESCIFRAR)
 *   [48..60]  nombre 13B null-terminated
 *   [61..63]  guild 3B
 *   [64..65]  reino u16 LE
 *   [66..68]  ubicación A = monstruo (iguales a 9..11)
 *   [69..71]  ubicación B = atacante
 *   [72..75]  eventTime u32 LE
 *   [76..79]  00000000 — convención de timestamps
 *   [80..83]  returnSeconds u32 LE (vuelta A→B)
 *   [84..87]  00000000
 *   [88..]    cola (SIN DESCIFRAR)
 *
 * Devuelve null si no encaja (para no pisar marchas ni entregas de tiles).
 */
export function parseMonsterHit(buf: Buffer): MonsterHitUpdate | null {
  if (buf.length < HIT_MIN_LENGTH || buf.length > HIT_MAX_LENGTH) return null;
  // Tiles/updates son múltiplos de 62; esta variante no
  if (buf.length % 62 === 0) return null;

  const monsterId = ((buf[9] ?? 0) << 16) | ((buf[10] ?? 0) << 8) | (buf[11] ?? 0);
  if (monsterId === 0) return null;
  const hp = buf.readFloatLE(12);
  if (!Number.isFinite(hp) || hp < 0 || hp > 100) return null;

  const nameEnd = buf.indexOf(0, HIT_NAME_OFFSET);
  const nameLimit = nameEnd >= 0 ? Math.min(nameEnd, HIT_NAME_OFFSET + 13) : HIT_NAME_OFFSET + 13;
  if (nameLimit <= HIT_NAME_OFFSET) return null;
  const name = buf.toString('utf8', HIT_NAME_OFFSET, nameLimit).trim();
  if (!name || !/^[\x20-\x7E]+$/.test(name)) return null;

  const guildOffset = HIT_NAME_OFFSET + 13;
  const guild = buf.toString('utf8', guildOffset, guildOffset + 3).replace(/\0/g, '').trim();

  const kingdomOffset = guildOffset + 3;
  const kingdom = buf.readUInt16LE(kingdomOffset);
  if (kingdom < 100) return null;

  const monsterCoordOffset = kingdomOffset + 2;
  const attackerCoordOffset = monsterCoordOffset + 3;
  const eventTimeOffset = attackerCoordOffset + 3;
  const returnOffset = eventTimeOffset + 4 + 4;
  if (returnOffset + 4 > buf.length) return null;

  // El monstruo aparece dos veces: prefijo (9-11) y bloque de marcha
  if (
    buf[9] !== buf[monsterCoordOffset] ||
    buf[10] !== buf[monsterCoordOffset + 1] ||
    buf[11] !== buf[monsterCoordOffset + 2]
  ) {
    return null;
  }

  const monster = decodeCoordId(monsterId);
  const attackerId =
    ((buf[attackerCoordOffset] ?? 0) << 16) | ((buf[attackerCoordOffset + 1] ?? 0) << 8) | (buf[attackerCoordOffset + 2] ?? 0);
  const attacker = decodeCoordId(attackerId);
  if (!isValidCoord(monster) || !isValidCoord(attacker)) return null;
  if (attacker.x === 0 && attacker.y === 0) return null;

  const eventTime = buf.readUInt32LE(eventTimeOffset);
  if (eventTime < 1_600_000_000 || eventTime > 2_000_000_000) return null;

  const returnSeconds = buf.readUInt32LE(returnOffset);
  if (returnSeconds > 3600) return null;

  return {
    monster: { x: monster.x, y: monster.y, id: monsterId },
    hp,
    attacker: { x: attacker.x, y: attacker.y },
    name,
    guild,
    kingdom,
    eventTime,
    returnSeconds,
  };
}

/**
 * Los tiles guardan el HP del monstruo en la escala observada en cada muestra
 * (0-100 o 0-1). Devuelve el valor nuevo (en %) reescalado a la misma escala
 * que ya tiene el tile, para no mezclar unidades.
 */
export function matchHpScale(tileHp: number, hpPercent: number): number {
  return tileHp > 1.5 ? hpPercent : hpPercent / 100;
}

/** HP de tile → % para mostrar/loguear. */
export function toHpPercent(tileHp: number): number {
  return tileHp > 1.5 ? tileHp : tileHp * 100;
}

function isValidCoord(c: { x: number; y: number }): boolean {
  return Number.isFinite(c.x) && Number.isFinite(c.y) && c.x >= 0 && c.y >= 0 && c.x <= 65534 && c.y <= 65534;
}
