import type { BotInstance } from '../core/bot-instance';
import { parseVipChest, isVipChestRejected, VIP_CHEST_COOLDOWN } from '../models/vip-chest.types';

function formatClaimTime(epoch: number): string {
  if (epoch <= 0) return 'ya';
  const d = new Date(epoch * 1000);
  const now = new Date();
  if (epoch * 1000 <= now.getTime()) return `ya (${d.toLocaleString()})`;
  return d.toLocaleString();
}

export function handleVipChest(bot: BotInstance, body: Buffer): void {
  if (body.length < 6) return;
  try {
    if (isVipChestRejected(body)) {
      bot.bot.log(`[VIP CHEST] Reclamo rechazado (ranura ya reclamada); se conserva el último estado válido.`);
      return;
    }
    const mem = parseVipChest(body);
    if (mem) {
      bot.vipChestMem = mem;
      bot.bot.log(`[VIP CHEST] Máscara: 0x${mem.mask.toString(16).padStart(4, '0')}, próximo índice: ${mem.nextIndex === -1 ? 'ninguno' : mem.nextIndex}, disponible desde: ${formatClaimTime(mem.nextClaim)} (cooldown ${VIP_CHEST_COOLDOWN}s)`);
      bot.emit('vipChestUpdated');
    }
  } catch {}
}
