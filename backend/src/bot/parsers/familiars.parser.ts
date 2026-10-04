import { FamiliarBuffState, FamiliarCooldownState, FamiliarFatigueState, FamiliarSkillState, FamiliarState, FamiliarTalentState, FamiliarUseResponse } from '../models/familiars.types';

/** 8210: 1B tag + 2B count + count × 28B. */
const ENTRY_SIZE = 28;
const HEADER_SIZE = 3;

/** 8245: 2B count + count × 3B (u16 petId + u8 nivel). */
const TALENT_ENTRY_SIZE = 3;

/** 8231: 1B count + count × 10B (u16 skillId + u32 availableAt + u32 0). */
const COOLDOWN_ENTRY_SIZE = 10;

/** 8232: 12B cabecera + 1B count + count × 15B. */
const BUFF_HEADER_SIZE = 12;
const BUFF_ENTRY_SIZE = 15;

/**
 * 8210 — lista de monstruitos de la cuenta (PetList). Llega S→C en cada login.
 *
 * Body:
 *   @0        u8   tag (siempre 01)
 *   @1..2     u16  count
 *   Luego count × registro de 28B:
 *     @0  u16   petId (clave de PetTbl)
 *     @2  u8    nivel (1..60)
 *     @3  u24   exp hacia el siguiente nivel (LE; 0 al nv60)
 *     @6  u8    flags (siempre 0 en las capturas; sin uso conocido)
 *     @7  u8    etapa (0 = Crías, 1 = Adulto, 2 = Anciano)
 *     @8  4×u8  nivel de cada habilidad (PetTbl.PetSkill[4], 1..10)
 *     @12 4×u32 exp de cada habilidad (LE; 0 si nv1 o nv máx)
 *
 * Ancla de la composición: 3 + count*28 == body.length en todas las
 * capturas (24 cuentas distintas), y @2/@7 caen en rangos plausibles
 * (nivel 1..60, etapa 0..2) con exp 0 justo en nivel 60.
 */
export function parse8210(body: Buffer): FamiliarState[] | null {
  if (body.length < HEADER_SIZE) return null;
  if (body[0] !== 1) return null;
  const count = body.readUInt16LE(1);
  if (count > 200) return null;
  if (body.length !== HEADER_SIZE + count * ENTRY_SIZE) return null;

  const pets: FamiliarState[] = [];
  let off = HEADER_SIZE;
  for (let i = 0; i < count; i++) {
    const skills: FamiliarSkillState[] = [];
    for (let s = 0; s < 4; s++) {
      skills.push({ level: body[off + 8 + s]!, exp: body.readUInt32LE(off + 12 + s * 4) });
    }
    pets.push({
      petId: body.readUInt16LE(off),
      level: body[off + 2]!,
      exp: body.readUIntLE(off + 3, 3),
      flags: body[off + 6]!,
      stage: body[off + 7]!,
      skills,
    });
    off += ENTRY_SIZE;
  }
  return pets;
}

/**
 * 8245 — talentos de ejército desbloqueados (PetListEx). Llega S→C en cada login.
 *
 * Body:
 *   @0  u16  count
 *   Luego count × { u16 petId, u8 nivel } (nivel 1..10, 10 = máx)
 *
 * Ancla: 2 + count*3 == body.length en todas las capturas; los niveles
 * observados van 1..10 y las claves son petIds de PetTbl.
 */
export function parse8245(body: Buffer): FamiliarTalentState[] | null {
  if (body.length < 2) return null;
  const count = body.readUInt16LE(0);
  if (count > 200) return null;
  if (body.length !== 2 + count * TALENT_ENTRY_SIZE) return null;

  const talents: FamiliarTalentState[] = [];
  let off = 2;
  for (let i = 0; i < count; i++) {
    talents.push({ petId: body.readUInt16LE(off), level: body[off + 2]! });
    off += TALENT_ENTRY_SIZE;
  }
  return talents;
}

/**
 * 8231 — cooldown de habilidades activas (PetSkillCooldown).
 *
 * Body:
 *   @0  u8  count
 *   Luego count × { u16 skillId, u32 availableAt, u32 0 }
 *
 * `availableAt` = último uso + CD[nivel] (epoch Unix s; CD en PetSkillCD.txt,
 * FILA PetSkill.CoolDown, en MINUTOS → ×60). Disponible ⟺ availableAt <= now.
 * Ancla: 1 + count*10 == body.length en las 11705 capturas de logs/.
 */
export function parse8231(body: Buffer): FamiliarCooldownState[] | null {
  if (body.length < 1) return null;
  const count = body[0]!;
  if (count > 128) return null;
  if (body.length !== 1 + count * COOLDOWN_ENTRY_SIZE) return null;

  const cooldowns: FamiliarCooldownState[] = [];
  let off = 1;
  for (let i = 0; i < count; i++) {
    cooldowns.push({ skillId: body.readUInt16LE(off), availableAt: body.readUInt32LE(off + 2) });
    off += COOLDOWN_ENTRY_SIZE;
  }
  return cooldowns;
}

/**
 * 8230 — fatiga de skills ofensivas (PetSkillFatigue).
 *
 * Body (12 B): { u16 fatigue, u16 max, u32 resetAt, u32 0 }
 *
 * max = 45 en todas las capturas; fatigue 0 salvo usos de skills subj=2
 * (PetSkill.Fatigue 1..6). Solo relevante para esas 10 skills ofensivas.
 */
export function parse8230(body: Buffer): FamiliarFatigueState | null {
  if (body.length !== 12) return null;
  return {
    fatigue: body.readUInt16LE(0),
    max: body.readUInt16LE(2),
    resetAt: body.readUInt32LE(4),
  };
}

/**
 * 8232 — buffs activos de monstruitos (PetSkillBuffInfo).
 *
 * Body:
 *   @0..11  12B cabecera (ceros en las capturas)
 *   @12     u8  count
 *   Luego count × { u16 skillId, u8 nivel, u32 startTs, u32 0, u32 durationSec }
 *
 * Ancla: 13 + count*15 == body.length (3576 cuerpos count=0, 5 con 1 buff).
 */
export function parse8232(body: Buffer): FamiliarBuffState[] | null {
  if (body.length < 13) return null;
  const count = body[12]!;
  if (count > 64) return null;
  if (body.length !== 13 + count * BUFF_ENTRY_SIZE) return null;

  const buffs: FamiliarBuffState[] = [];
  let off = 13;
  for (let i = 0; i < count; i++) {
    buffs.push({
      skillId: body.readUInt16LE(off),
      level: body[off + 2]!,
      startTs: body.readUInt32LE(off + 3),
      durationSec: body.readUInt32LE(off + 11),
    });
    off += BUFF_ENTRY_SIZE;
  }
  return buffs;
}

/**
 * 8227 — respuesta del uso de skill (PetSkillUse).
 *
 * Body (17 B en todas las capturas observadas, éxito y rechazo):
 *   @0     u8   result  (0 = usada, 6 = rechazada)
 *   @1..2  u16  petId   (ecoa el request; 0 en los rechazos)
 *   @3..4  u16  skillId (ecoa el request; 0 en los rechazos)
 *   @5..8  u32  availableAt (nuevo CD; sólo en éxito)
 *   @9..16 8B   ceros
 *
 * Ejemplo de éxito (cliente real, pet 29 skill 71):
 *   001d004700423ac26a0000000000000000
 * Ejemplo de rechazo (bot): 0600000000000000000000000000000000
 */
export function parse8227(body: Buffer): FamiliarUseResponse | null {
  if (body.length < 5) return null;
  return {
    result: body[0]!,
    petId: body.readUInt16LE(1),
    skillId: body.readUInt16LE(3),
    availableAt: body.length >= 9 ? body.readUInt32LE(5) : 0,
  };
}
