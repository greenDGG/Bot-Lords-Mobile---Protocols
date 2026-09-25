import type { BotInstance } from '../core/bot-instance';
import { parseVipChest } from '../models/vip-chest.types';

export function handleVipChest(bot: BotInstance, body: Buffer): void {
  if (body.length < 6) return;
  try {
    const mem = parseVipChest(body);
    if (mem) {
      bot.vipChestMem = mem;
      bot.bot.log(`[VIP CHEST] Máscara: 0x${mem.mask.toString(16)}, próximo índice: ${mem.nextIndex === -1 ? 'ninguno' : mem.nextIndex}, disponible desde: ${new Date(mem.nextClaim * 1000).toLocaleTimeString()}`);
      bot.emit('vipChestUpdated');
    }
  } catch {}
}
