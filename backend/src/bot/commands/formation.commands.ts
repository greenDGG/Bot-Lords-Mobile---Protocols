import { BotEngine } from '../engine/bot-engine';

export const UI_SECTION_CHARACTER = 0x02;
export const UI_SECTION_FORMATION = 0x03;
export const UI_SECTION_WAR = 0x05;
export const UI_SECTION_ARMY_STATUS = 0x04;
export const UI_SECTION_SPEEDUP = 0x06;

export function openCharacterSection(bot: BotEngine): void {
  bot.sendCommandPacket(1144, Buffer.from([UI_SECTION_CHARACTER, 0x00, 0x00, 0x00, 0x00, 0x00]), true);
}

export function openFormationSection(bot: BotEngine): void {
  bot.sendCommandPacket(1144, Buffer.from([UI_SECTION_FORMATION, 0x00, 0x00, 0x00, 0x00, 0x00]), true);
}

export function setFormation(bot: BotEngine, formation: number): void {
  bot.sendCommandPacket(6801, Buffer.from([formation]), true);
}

export function setCostume(bot: BotEngine, costumeIndex: number): void {
  bot.sendCommandPacket(6102, Buffer.from([costumeIndex]), true);
}

export function isInCharacterSection(uiSection: number): boolean {
  return uiSection === UI_SECTION_CHARACTER;
}

export function isInWarSection(uiSection: number): boolean {
  return uiSection === UI_SECTION_WAR;
}
