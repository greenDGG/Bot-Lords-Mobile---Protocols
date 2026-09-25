import type { BotEngine } from '../engine/bot-engine';
import { buyShield24h as buyShield24hCmd, activateShield as activateShieldCmd } from '../commands/shield.commands';

export function buyShield24h(bot: BotEngine): void {
  buyShield24hCmd(bot);
}

export function activateShield(bot: BotEngine): void {
  activateShieldCmd(bot);
}
