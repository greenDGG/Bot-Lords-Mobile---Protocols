import type { BotInstance } from '../core/bot-instance';
import { MessagePacket } from '../network/message-packet';
import { handlePlayerInfo, handleBuffs, handleGuildInfo } from './player.handler';
import { handleMysteryBox } from './mystery-box.handler';
import { handleResources, handleRefineMana } from './resources.handler';
import { handleTroopState, handleTroopTraining, handleHospital } from './troops.handler';
import { handleBuildingState, handleConstructions } from './buildings.handler';
import { handleMarchIncoming, handleMarchUpdate, handleMarchUpdate2442, handleBattleImminent, handleMarchDataResponse, handleMarchData } from './march.handler';
import { handleMarchUpdateSmall } from './march-update.handler';
import { handleCaravanComplete } from './supply.handler';
import { handleCaravanAck } from './supply-ack.handler';
import { handleMapData, handleWonderSwitch } from './map.handler';
import { handleColiseumState, handleColiseumRivals } from './coliseum.handler';
import { handleHeroList } from './hero.handler';
import { handleInventory } from './inventory.handler';
import { handleChatMessages } from './chat.handler';
import { handle3112 } from './quest.handler';
import { handleTreasureChamber, handleEternalTreasure } from './treasure.handler';
import { handleLeaderCaptured, handleLeaderFreed, handleLeaderExecuted } from './leader.handler';
import { handleEssenceTransmutation } from './essence.handler';
import { handleVipChest } from './vip-chest.handler';
import { handleDisconnect } from './disconnect.handler';
import { handleResearch } from './research.handler';
import { handle9652, handle9661, handle9663 } from './extravagant-missions.handler';
import { handleMissionRecords } from './mission-records.handler';
import { handle3638 } from './fdg-mission-extension.handler';
import { handleGuildNotification } from './guild-notification.handler';
import { handleGuildApplications } from './guild-applications.handler';
import { handleCostumes } from './costume.handler';
import { handleEquippedCostumes } from './equipped.handler';
import { handle3610 } from './event-rewards.handler';

type Handler = (bot: BotInstance, body: Buffer, mp: MessagePacket) => void;

const HANDLERS: Record<number, Handler> = {
  1008: handlePlayerInfo,
  1010: handleDisconnect,
  1111: handleBuffs,
  1118: handleMysteryBox,
  1201: handleHeroList,
  1401: handleInventory,
  1417: handleCostumes,
  3804: handleEquippedCostumes,
  2001: handleBuildingState,
  2002: handleConstructions,
  2014: handleResources,
  2037: handleRefineMana,
  2220: handleMapData,
  2228: handleWonderSwitch,
  2401: handleTroopState,
  2402: handleTroopTraining,
  2425: handleHospital,
  2441: handleBattleImminent,
  2442: handleMarchUpdate2442,
  2445: handleMarchDataResponse,
  2446: handleMarchData,
  2453: handleCaravanAck,
  2455: handleCaravanComplete,
  2802: handleGuildInfo,
  3003: handleChatMessages,
  3112: handle3112,
  3125: handleVipChest,
  3201: handleResearch,
  4044: handleEternalTreasure,
  4201: handleTreasureChamber,
  4401: handleLeaderCaptured,
  4407: handleLeaderFreed,
  4408: handleLeaderExecuted,
  5201: handleColiseumState,
  5205: handleColiseumRivals,
  7317: handleEssenceTransmutation,
  9652: handle9652,
  9661: handle9661,
  9663: handle9663,
  3633: handleMissionRecords,
  3638: handle3638,
  2859: handleGuildNotification,
  2826: handleGuildApplications,
  3610: handle3610,
};

export function dispatchPacket(bot: BotInstance, mp: MessagePacket): void {
  const body = mp.data.length > 4 ? mp.data.subarray(4) : mp.data;
  const proto = mp.protocolId;

  // Special case: proto 2440 has two possible handlers (march incoming vs march update small)
  if (proto === 2440) {
    if (body.length >= 18) {
      handleMarchIncoming(bot, body);
    }
    if (mp.data.length >= 20 && mp.data.readUInt16LE(2) === 2440) {
      if (mp.data.length === 20 && body.length >= 16) {
        handleMarchUpdateSmall(bot, body);
      }
    }
    return;
  }

  const handler = HANDLERS[proto];
  if (handler) handler(bot, body, mp);
}
