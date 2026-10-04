import type { BotInstance } from '../core/bot-instance';
import type { BotAction } from './bot-action';
import { getFamiliarSkillsConfig } from '../../models/bot-config';
import { useFamiliarSkill } from '../commands/familiar-skill.commands';
import { FAMILIAR_DEFS, SKILL_DEFS, familiarName } from '../data/familiars-db';
import { serverNowSec } from '../../utils/clock-sync';

/** Máximo de skills disparadas en una sola pasada del bucle. */
const MAX_PER_RUN = 5;
/** Espera entre envíos dentro de la misma pasada. */
const GAP_MS = 1200;
/**
 * Segundos mínimos entre intentos de la MISMA skill si el último envío no
 * cambió su cooldown (server rechazó con 8227 result!=0 o no contestó).
 * Evita martillar el 8226 cada ciclo si el server sigue rechazando.
 */
const RETRY_SEC = 600;

/**
 * Uso automático de skills activas de monstruitos (8226).
 *
 * Por cada pet configurado recorre sus skills `type=active` y dispara las que
 * están disponibles:
 *   - cooldown vencido (`8231`: availableAt <= now),
 *   - ofensivas (subject 2) sólo si el pool de fatiga (`8230`) alcanza para
 *     `PetSkill.Fatigue`,
 *   - sin un intento fallido reciente (RETRY_SEC).
 *
 * El `8227` de respuesta actualiza el cooldown en cuanto llega
 * (`handle8227`); si el server rechaza (`result != 0`) la acción sólo
 * registra el intento cada RETRY_SEC para no martillar el 8226.
 */
export class FamiliarSkillsAction implements BotAction {
  name = 'familiarSkills';

  /** skillId → epoch (s) del último envío. */
  private readonly lastSent = new Map<number, number>();

  async execute(bot: BotInstance): Promise<boolean> {
    const cfg = getFamiliarSkillsConfig(bot.config);
    if (!cfg.enable || cfg.pets.length === 0) return false;
    const fam = bot.familiars;
    const castle = bot.playerInfo;
    if (!fam || !castle || !bot.bot.isOnline) return false;

    const now = serverNowSec();
    const ready: { petId: number; skillId: number; label: string }[] = [];

    for (const petId of cfg.pets) {
      const pet = fam.pets.find(p => p.petId === petId);
      if (!pet) continue;
      const skillIds = FAMILIAR_DEFS[petId]?.skills ?? [];
      for (let i = 0; i < pet.skills.length && ready.length < MAX_PER_RUN; i++) {
        const state = pet.skills[i];
        const skillId = skillIds[i];
        if (!skillId || !state || state.level < 1) continue;
        const def = SKILL_DEFS[skillId];
        if (def?.type !== 'active') continue;

        const cd = fam.cooldowns?.find(c => c.skillId === skillId);
        if (cd && cd.availableAt > now) continue;

        const sent = this.lastSent.get(skillId);
        if (sent && now - sent < RETRY_SEC) continue;

        // Ofensivas (subject 2) gastan fatiga del pool del 8230.
        if ((def.subject ?? 1) === 2 && (def.fatigue ?? 0) > 0) {
          const pool = fam.fatigue;
          if (!pool || pool.max - pool.fatigue < (def.fatigue ?? 0)) continue;
        }

        ready.push({ petId, skillId, label: def.name || `skill ${skillId}` });
      }
    }

    if (ready.length === 0) return false;

    let sent = 0;
    for (const s of ready) {
      useFamiliarSkill(bot.bot, s.petId, s.skillId, { x: castle.castleX, y: castle.castleY });
      this.lastSent.set(s.skillId, serverNowSec());
      bot.bot.log(`[ACTION] Skills: ${s.label} de ${familiarName(s.petId)} (pet ${s.petId}) — 8226 enviado`);
      sent++;
      if (sent < ready.length) await new Promise(resolve => setTimeout(resolve, GAP_MS));
    }
    return sent > 0;
  }
}
