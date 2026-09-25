import type { BotInstance } from '../core/bot-instance';
import type { BotAction } from './bot-action';
import type { QuestMemory } from '../models/quest.types';
import { completeQuest } from '../commands/quest.commands';

async function executeQuests(bot: BotInstance, mem: QuestMemory, typeByte: number): Promise<boolean> {
  const pending = mem.missions.filter(m => !m.completed);
  if (pending.length === 0) {
    bot.bot.log(`[QUESTS] ${mem.type === 'admin' ? 'Admin' : 'Guild'}: todas ya reclamadas`);
    return false;
  }
  bot.bot.log(`[QUESTS] Ejecutando ${pending.length}/${mem.count} misiones ${mem.type === 'admin' ? 'admin' : 'guild'}...`);
  for (const mission of pending) {
    completeQuest(bot.bot, typeByte, mission.index);
    await new Promise(r => setTimeout(r, 500));
  }
  bot.bot.log(`[QUESTS] ${mem.type === 'admin' ? 'Admin' : 'Guild'}: ${pending.length} misiones completadas`);
  return true;
}

export class AdminQuestAction implements BotAction {
  name = 'adminQuest';
  async execute(bot: BotInstance): Promise<boolean> {
    if (!bot.config.adminQuest.enable) return false;
    if (!bot.adminQuestMem) { return false; }
    if (bot.adminQuestMem.endTimestamp === bot.lastAdminQuestEndTs) return false;
    const ok = await executeQuests(bot, bot.adminQuestMem, 1);
    if (ok) bot.lastAdminQuestEndTs = bot.adminQuestMem.endTimestamp;
    return ok;
  }
}

export class GuildQuestAction implements BotAction {
  name = 'guildQuest';
  async execute(bot: BotInstance): Promise<boolean> {
    if (!bot.config.guildQuest.enable) return false;
    if (!bot.guildQuestMem) { return false; }
    if (bot.guildQuestMem.endTimestamp === bot.lastGuildQuestEndTs) return false;
    const ok = await executeQuests(bot, bot.guildQuestMem, 2);
    if (ok) bot.lastGuildQuestEndTs = bot.guildQuestMem.endTimestamp;
    return ok;
  }
}
