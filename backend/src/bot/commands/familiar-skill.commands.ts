import { BotEngine } from '../engine/bot-engine';
import { encodeCoord } from '../../models/map-coords';

/**
 * 8226 — usar una skill activa/soporte de un monstruito.
 *
 * Wire (docs/protocols/8226.md): `sendCommandPacket(proto, body, true)`
 * prepende el `u32 seq` y el body va cifrado en bloques de 8 como cualquier
 * otro comando; el server contesta con 8227 (`result 0` = usada, trae el
 * `availableAt` nuevo; `6` = rechazada).
 *
 * Body del cliente real (7 B):
 *   @0..2  3 B  coordenada del castillo que emite (encodeCoord, igual que
 *               tiles/hunt/supply/2488) — capturas: `2702d5` = (235,557),
 *               `370263` = (230,566), `ab03f1` = (355,943)
 *   @3..4  u16  petId (clave de PetTbl, LE)
 *   @5..6  u16  skillId (clave de PetSkill.txt, LE)
 *
 * Todo el armado del body vive acá (`buildUseFamiliarSkillBody`).
 */
export function buildUseFamiliarSkillBody(
  petId: number,
  skillId: number,
  castle: { x: number; y: number },
): Buffer {
  const coord = encodeCoord(castle.x, castle.y);
  const body = Buffer.alloc(7);
  body[0] = coord[0];
  body[1] = coord[1];
  body[2] = coord[2];
  body.writeUInt16LE(petId, 3);
  body.writeUInt16LE(skillId, 5);
  return body;
}

export function useFamiliarSkill(
  bot: BotEngine,
  petId: number,
  skillId: number,
  castle: { x: number; y: number },
): void {
  bot.sendCommandPacket(8226, buildUseFamiliarSkillBody(petId, skillId, castle), true);
}
