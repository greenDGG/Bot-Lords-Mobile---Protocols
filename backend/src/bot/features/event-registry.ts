import type { BotInstance } from '../core/bot-instance';
import { claimEvent } from '../commands/event.commands';

export type EventActionFn = (bot: BotInstance) => Promise<boolean>;

function packetAction(proto: number, payloadHex: string): EventActionFn {
  return async (bot) => {
    const payload = Buffer.from(payloadHex || '00', 'hex');
    claimEvent(bot.bot, proto, payload);
    bot.bot.log(`[EVENTOS] Acción enviada: proto ${proto} payload ${payloadHex || 'vacío'}`);
    await new Promise(r => setTimeout(r, 1500));
    return true;
  };
}

export const EVENT_ACTIONS: Record<string, EventActionFn> = {
  'encargos-helados': packetAction(11632, '0101'),
  'linternas': packetAction(11157, '7000b609e5050f00000100'),
  'monedas-castillo': packetAction(11157, '7500280a2f033200000100'),
  'arena-caos': packetAction(11692, '0101'),
  'evento-solitario': packetAction(3609, '0006'),
  'evento-infierno': packetAction(3609, '0106'),
  'desafio': packetAction(3619, '040006'),
  'magmante': packetAction(7030, '01'),
  'laberinto': packetAction(7001, ''),
  'estrellas-sagradas': packetAction(7003, '01'),
  'arena-dragon': packetAction(9308, '01'),
  'caja-misteriosa': packetAction(1117, ''),
  'bono-acceso': packetAction(3655, '00'),
};
