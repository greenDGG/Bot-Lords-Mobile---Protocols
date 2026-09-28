import type { BotInstance } from '../core/bot-instance';
import { ReclaimDailyAction } from './daily.action';
import { MysteryBoxAction } from './daily.action';
import { ForgeGiftAction } from './daily.action';
import { AdminQuestAction } from './quest.action';
import { GuildQuestAction } from './quest.action';
import { ShipAction } from './ship.action';
import { ArtifactFairAction } from './chest.action';
import { ChestVipAction } from './chest.action';
import { OpenGuildChestAction } from './chest.action';
import { EternalTreasureAction } from './treasure.action';
import { TreasureChamberAction } from './treasure.action';
import { RefineManaAction } from './resource.action';
import { TrainAction } from './resource.action';
import { ShieldAction } from './combat.action';
import { ColiseumGemsAction } from './combat.action';
import { ColiseumAutoAttackAction } from './combat.action';
import { SweepAction } from './combat.action';
import { SupplyAction } from './supply.action';
import { AutoHelpAction } from './help.action';
import { EventsAction, Relocate } from './event.action';
import { MissionCheckAction } from './mission.action';
import { LuckyCardAction } from './lucky-card.action';
import { HuntAction } from './hunt.action';

export interface BotAction {
  name: string;
  execute(bot: BotInstance): Promise<boolean>;
}

const ACTION_INSTANCES: Record<string, BotAction> = {};
for (const a of createActions()) ACTION_INSTANCES[a.name] = a;

export function findActionByName(name: string): BotAction | null {
  return ACTION_INSTANCES[name] || null;
}

export function createActions(): BotAction[] {
  return [
    new SupplyAction(),
    new ReclaimDailyAction(),
    new EventsAction(),
    new AdminQuestAction(),
    new GuildQuestAction(),
    new MysteryBoxAction(),
    new ForgeGiftAction(),
    new ChestVipAction(),
    new ArtifactFairAction(),
    new OpenGuildChestAction(),
    new EternalTreasureAction(),
    new RefineManaAction(),
    new TreasureChamberAction(),
    new ShipAction(),
    new TrainAction(),
    new ShieldAction(),
    new AutoHelpAction(),
    new MissionCheckAction(),
    new ColiseumGemsAction(),
    new ColiseumAutoAttackAction(),
    new SweepAction(),
    new LuckyCardAction(),
    new HuntAction(),
  ];
}
