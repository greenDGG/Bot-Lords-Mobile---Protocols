import type { BotInstance } from '../core/bot-instance';
import { FamiliarsData } from '../models/familiars.types';
import { parse8210, parse8227, parse8230, parse8231, parse8232, parse8245 } from '../parsers/familiars.parser';
import { FAMILIAR_DEFS, SKILL_DEFS, STAGE_NAMES, familiarName } from '../data/familiars-db';
import { computePlayerStats } from '../features/player-stats';

function summarize(pets: FamiliarsData['pets']): string {
  const stages = [0, 0, 0];
  for (const p of pets) stages[p.stage] = (stages[p.stage] || 0) + 1;
  return `${pets.length} monstruitos (${stages
    .map((n, i) => (n ? `${n} ${STAGE_NAMES[i]}` : ''))
    .filter(Boolean)
    .join(', ')})`;
}

function skillLabel(skillId: number): string {
  return SKILL_DEFS[skillId]?.name ?? `skill ${skillId}`;
}

function utcClock(sec: number): string {
  return new Date(sec * 1000).toISOString().slice(11, 19);
}

/** 8210 — lista de monstruitos de la cuenta. */
export function handle8210(bot: BotInstance, body: Buffer): void {
  try {
    const pets = parse8210(body);
    if (!pets) {
      bot.bot.log(`[MONSTRUITOS] 8210 no parseado (len=${body.length}) head=${body.subarray(0, 8).toString('hex')}`);
      return;
    }
    const prev = bot.familiars;
    bot.familiars = { ...prev, pets, talents: prev?.talents ?? [] };
    if (!prev || prev.pets.length !== pets.length) {
      bot.bot.log(`[MONSTRUITOS] 8210: ${summarize(pets)}`);
    } else {
      // Una skill que cambió de nivel tiene un CD nuevo: invalidar su cooldown.
      const leveled = new Set<number>();
      for (const p of pets) {
        const q = prev.pets.find(x => x.petId === p.petId);
        if (!q) continue;
        if (q.level !== p.level) {
          bot.bot.log(`[MONSTRUITOS] ${familiarName(p.petId)}: nivel ${q.level} → ${p.level}`);
        }
        if (q.stage !== p.stage) {
          bot.bot.log(`[MONSTRUITOS] ${familiarName(p.petId)}: etapa ${q.stage} → ${p.stage} (${STAGE_NAMES[p.stage] || '?'})`);
        }
        p.skills.forEach((s, i) => {
          if (q.skills[i] && q.skills[i]!.level !== s.level) {
            const skillId = FAMILIAR_DEFS[p.petId]?.skills[i];
            if (skillId) {
              leveled.add(skillId);
              bot.bot.log(`[MONSTRUITOS] ${familiarName(p.petId)}: ${skillLabel(skillId)} nv${q.skills[i]!.level} → nv${s.level}`);
            }
          }
        });
      }
      if (leveled.size && bot.familiars.cooldowns) {
        bot.familiars.cooldowns = bot.familiars.cooldowns.filter(c => !leveled.has(c.skillId));
      }
    }
    bot.playerStats = computePlayerStats(bot);
    bot.emit('familiarsUpdated');
  } catch (e: any) {
    bot.bot.log(`[MONSTRUITOS] 8210 error parseando: ${e?.message}`);
  }
}

/** 8245 — talentos de ejército desbloqueados (petId → nivel 1..10). */
export function handle8245(bot: BotInstance, body: Buffer): void {
  try {
    const talents = parse8245(body);
    if (!talents) {
      bot.bot.log(`[MONSTRUITOS] 8245 no parseado (len=${body.length}) head=${body.subarray(0, 8).toString('hex')}`);
      return;
    }
    const prev = bot.familiars;
    bot.familiars = { ...prev, pets: prev?.pets ?? [], talents };
    if (!prev || prev.talents.length !== talents.length) {
      const fmt = talents.map(t => `${familiarName(t.petId)} nv${t.level}`).join(', ');
      bot.bot.log(`[MONSTRUITOS] 8245: ${talents.length} talentos${fmt ? ` - ${fmt}` : ''}`);
    }
    bot.playerStats = computePlayerStats(bot);
    bot.emit('familiarsUpdated');
  } catch (e: any) {
    bot.bot.log(`[MONSTRUITOS] 8245 error parseando: ${e?.message}`);
  }
}

/** 8231 — cooldown de skills activas (availableAt epoch; ver docs/protocols/8231.md). */
export function handle8231(bot: BotInstance, body: Buffer): void {
  try {
    const incoming = parse8231(body);
    if (!incoming) {
      bot.bot.log(`[MONSTRUITOS] 8231 no parseado (len=${body.length}) head=${body.subarray(0, 8).toString('hex')}`);
      return;
    }
    const prev = bot.familiars;
    const oldById = new Map((prev?.cooldowns ?? []).map(c => [c.skillId, c.availableAt]));
    // Merge monotónico: el servidor a veces sirve valores viejos (stale); un
    // uso legítimo siempre SUBE availableAt, así que el máx es seguro.
    const cooldowns = incoming.map(c => ({
      skillId: c.skillId,
      availableAt: Math.max(oldById.get(c.skillId) ?? 0, c.availableAt),
    }));
    for (const c of cooldowns) {
      const old = oldById.get(c.skillId);
      if (old !== undefined && old !== c.availableAt) {
        bot.bot.log(`[MONSTRUITOS] ${skillLabel(c.skillId)}: CD → lista a las ${utcClock(c.availableAt)}Z`);
      }
    }
    bot.familiars = { ...prev, pets: prev?.pets ?? [], talents: prev?.talents ?? [], cooldowns };
    bot.emit('familiarsUpdated');
  } catch (e: any) {
    bot.bot.log(`[MONSTRUITOS] 8231 error parseando: ${e?.message}`);
  }
}

/** 8230 — fatiga de skills ofensivas (u16 fatigue, u16 max, u32 epoch). */
export function handle8230(bot: BotInstance, body: Buffer): void {
  try {
    const fatigue = parse8230(body);
    if (!fatigue) {
      bot.bot.log(`[MONSTRUITOS] 8230 no parseado (len=${body.length}) head=${body.subarray(0, 8).toString('hex')}`);
      return;
    }
    const prev = bot.familiars;
    const old = prev?.fatigue;
    bot.familiars = { ...prev, pets: prev?.pets ?? [], talents: prev?.talents ?? [], fatigue };
    if (old && old.fatigue !== fatigue.fatigue) {
      bot.bot.log(`[MONSTRUITOS] fatiga: ${old.fatigue} → ${fatigue.fatigue}/${fatigue.max}`);
    }
    bot.emit('familiarsUpdated');
  } catch (e: any) {
    bot.bot.log(`[MONSTRUITOS] 8230 error parseando: ${e?.message}`);
  }
}

/** 8232 — buffs activos de skills (12B header + count + entries de 15B). */
export function handle8232(bot: BotInstance, body: Buffer): void {
  try {
    const buffs = parse8232(body);
    if (!buffs) {
      bot.bot.log(`[MONSTRUITOS] 8232 no parseado (len=${body.length}) head=${body.subarray(0, 8).toString('hex')}`);
      return;
    }
    const prev = bot.familiars;
    const oldCount = prev?.buffs?.length ?? -1;
    bot.familiars = { ...prev, pets: prev?.pets ?? [], talents: prev?.talents ?? [], buffs };
    if (oldCount !== buffs.length) {
      for (const b of buffs) {
        bot.bot.log(`[MONSTRUITOS] buff: ${skillLabel(b.skillId)} nv${b.level} ${b.durationSec}s (termina ${utcClock(b.startTs + b.durationSec)}Z)`);
      }
      if (!buffs.length && oldCount > 0) bot.bot.log(`[MONSTRUITOS] sin buffs activos`);
    }
    bot.emit('familiarsUpdated');
  } catch (e: any) {
    bot.bot.log(`[MONSTRUITOS] 8232 error parseando: ${e?.message}`);
  }
}

/**
 * 8227 — respuesta de un 8226 (uso de skill).
 *
 * `result = 0` trae el `availableAt` nuevo: se guarda directo (es la respuesta
 * a nuestro uso, no un push stale como el 8231). `result != 0` = rechazo.
 */
export function handle8227(bot: BotInstance, body: Buffer): void {
  try {
    const res = parse8227(body);
    if (!res) {
      bot.bot.log(`[MONSTRUITOS] 8227 no parseado (len=${body.length}) head=${body.subarray(0, 8).toString('hex')}`);
      return;
    }
    if (res.result !== 0) {
      bot.bot.log(`[MONSTRUITOS] uso de skill rechazado: result=${res.result} (pet ${res.petId}, skill ${res.skillId})`);
      return;
    }
    const prev = bot.familiars;
    if (prev) {
      const cooldowns = [...(prev.cooldowns ?? [])];
      const idx = cooldowns.findIndex(c => c.skillId === res.skillId);
      if (idx >= 0) cooldowns[idx] = { skillId: res.skillId, availableAt: res.availableAt };
      else cooldowns.push({ skillId: res.skillId, availableAt: res.availableAt });
      bot.familiars = { ...prev, cooldowns };
    }
    bot.bot.log(`[MONSTRUITOS] ${skillLabel(res.skillId)} (pet ${res.petId}) usada — CD hasta ${utcClock(res.availableAt)}Z`);
    bot.emit('familiarsUpdated');
  } catch (e: any) {
    bot.bot.log(`[MONSTRUITOS] 8227 error parseando: ${e?.message}`);
  }
}
