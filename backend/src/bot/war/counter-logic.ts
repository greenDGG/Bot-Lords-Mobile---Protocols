import type { BotInstance } from '../core/bot-instance';
import { setFormation, setCostume, openCharacterSection, openFormationSection, UI_SECTION_CHARACTER, UI_SECTION_FORMATION } from '../commands/formation.commands';
import { serverNow } from '../../utils/clock-sync';

const COUNTER_FORMATION: Record<number, number> = {
  0: 5,
  1: 3,
  2: 4,
};

const COUNTER_LEAD_MS = 5000;
const COUNTER_REVERT_MS = 1200;

export function armCounter(bot: BotInstance, march: any): void {
  if (!bot.config.warMode) return;
  if (march.arrived || march.evaluated) return;
  if (!march.packet) return;

  const allTroops = [...(march.packet.troops || []), ...(march.packet.t5Troops || [])];
  const weightByTier: Record<number, number> = { 1: 0, 2: 0, 3: 0.3, 4: 1, 5: 1.5 };
  const weightedByType: Record<number, { weight: number; raw: number }> = {};
  let totalWeighted = 0;

  for (const t of allTroops) {
    if (t.count <= 0) continue;
    const w = t.count * (weightByTier[t.tier] || 0);
    if (w === 0) continue;
    if (!weightedByType[t.type]) weightedByType[t.type] = { weight: 0, raw: 0 };
    weightedByType[t.type].weight += w;
    weightedByType[t.type].raw += t.count;
    totalWeighted += w;
  }

  if (totalWeighted < 250000) {
    march.evaluated = true;
    bot.bot.log(`[CONTRA] Marcha ${march.marchId}: amenaza baja (${Math.round(totalWeighted).toLocaleString()} ponderado), ignorando`);
    bot.emit('marchesUpdated');
    return;
  }

  const dbg = Object.entries(weightedByType)
    .map(([type, data]) => `T${type}=${Math.round((data as any).weight).toLocaleString()}`)
    .join(' ');
  bot.bot.log(`[CONTRA] Marcha ${march.marchId}: desglose ${dbg}`);

  let bestType = -1;
  let bestWeight = 0;
  for (const [type, data] of Object.entries(weightedByType)) {
    if (data.weight > bestWeight) { bestWeight = data.weight; bestType = Number(type); }
  }

  let forceT3 = false;
  for (const t of allTroops) {
    if (t.count < 250000 || t.tier !== 3) continue;
    const needFormation = COUNTER_FORMATION[t.type];
    if (needFormation && needFormation !== bot.lastSentFormation) {
      bestType = t.type;
      forceT3 = true;
      bot.bot.log(`[CONTRA] Marcha ${march.marchId}: T3 ${t.type} x${t.count.toLocaleString()} — counterea con falange ${needFormation}`);
      break;
    }
  }

  if (bestType === 3) {
    bot.bot.log(`[CONTRA] Marcha ${march.marchId}: asedio ignorado`);
    march.evaluated = true;
    bot.emit('marchesUpdated');
    return;
  }

  const formation = bestType >= 0 ? COUNTER_FORMATION[bestType] : null;
  if (!formation) {
    march.evaluated = true;
    bot.emit('marchesUpdated');
    return;
  }

  if (formation === bot.lastSentFormation) {
    march.evaluated = true;
    bot.emit('marchesUpdated');
    return;
  }

  march.counterFormation = formation;
  march.evaluated = true;
  armCounterTimer(bot, march);
}

export function armCounterTimer(bot: BotInstance, march: any): void {
  if (march.timer) { clearTimeout(march.timer); march.timer = undefined; }

  const arrivalMs = march.arrivalTimestamp * 1000;

  if (march.countered) {
    const revertDelay = Math.max(0, arrivalMs + COUNTER_REVERT_MS - serverNow());
    march.timer = setTimeout(() => {
      march.timer = undefined;
      revertCounter(bot, march);
    }, revertDelay);
  } else if (march.counterFormation !== undefined && !march.arrived) {
    const swingDelay = Math.max(0, arrivalMs - COUNTER_LEAD_MS - serverNow());
    march.timer = setTimeout(() => {
      march.timer = undefined;
      fireCounterNow(bot, march);
    }, swingDelay);
  }
}

export function fireCounterNow(bot: BotInstance, march: any): void {
  const formation = march.counterFormation;
  if (formation === undefined || march.countered || march.arrived) return;

  const prepareUI = () => {
    // Solo enviar 1144 [02] si no estamos ya en la seccion de personaje
    if (bot.uiSection !== UI_SECTION_CHARACTER) {
      openCharacterSection(bot.bot);
      bot.uiSection = UI_SECTION_CHARACTER;
      bot.bot.log(`[CONTRA] Marcha ${march.marchId}: seccion personaje abierta`);
    }

    // Abrir seccion de falanges
    openFormationSection(bot.bot);
    bot.uiSection = UI_SECTION_FORMATION;
    bot.bot.log(`[CONTRA] Marcha ${march.marchId}: seccion falanges abierta`);
  };

  // Preparar UI (5s antes)
  prepareUI();

  // Cambiar falange (2s despues de preparar UI)
  setTimeout(() => {
    if (march.arrived) return;
    setFormation(bot.bot, formation);
    bot.lastSentFormation = formation;
    bot.uiSection = UI_SECTION_CHARACTER; // vuelve a 02 automaticamente
    bot.bot.log(`[CONTRA] Marcha ${march.marchId}: falange ${formation} aplicada`);

    // Cambiar traje (1s despues)
    setTimeout(() => {
      if (march.arrived) return;
      setCostume(bot.bot, bot.config.costumeWar);
      bot.lastSentCostume = bot.config.costumeWar;
      bot.bot.log(`[CONTRA] Marcha ${march.marchId}: traje → guerra (index ${bot.config.costumeWar})`);

      march.countered = true;
      march.evaluated = true;
      bot.emit('marchesUpdated');

      const revertDelay = Math.max(0, (march.arrivalTimestamp * 1000 + COUNTER_REVERT_MS) - serverNow());
      march.timer = setTimeout(() => {
        march.timer = undefined;
        revertCounter(bot, march);
      }, revertDelay);
    }, 1000);
  }, 2000);
}

export function revertCounter(bot: BotInstance, march: any): void {
  if (bot.lastSentFormation !== null) {
    setFormation(bot.bot, 3);
    bot.lastSentFormation = null;
    bot.bot.log(`[CONTRA] Marcha ${march.marchId}: revirtiendo falange a default (03)`);
  }
  if (bot.lastSentCostume !== null) {
    setCostume(bot.bot, bot.config.costumeNormal);
    bot.lastSentCostume = null;
    bot.bot.log(`[CONTRA] Marcha ${march.marchId}: revirtiendo traje a normal (index ${bot.config.costumeNormal})`);
  }
}
