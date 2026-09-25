import type { BotInstance } from '../core/bot-instance';
import { parseCostumePacket } from '../parsers/costume.parser';
import type { CostumeItem } from '../parsers/costume.parser';

const SKIP_PREFIX = 0x02;

export function handleCostumes(bot: BotInstance, body: Buffer): void {
  if (!body || body.length === 0) return;

  const firstByte = body[0];

  let parseBody: Buffer;
  if (firstByte === SKIP_PREFIX) {
    parseBody = body.subarray(1);
  } else {
    parseBody = body;
  }

  const result = parseCostumePacket(parseBody);

  if (result.items.length === 0) {
    bot.bot.log(`[TRAJES] Paquete 1417 sin items (firstByte=0x${firstByte.toString(16).padStart(2, '0')})`);
    return;
  }

  const existingKeys = new Set(bot.costumes.map(c => `${c.id}:${c.index}`));
  let added = 0;

  for (const item of result.items) {
    const key = `${item.id}:${item.index}`;
    if (!existingKeys.has(key)) {
      bot.costumes.push(item);
      existingKeys.add(key);
      added++;
    }
  }

  const headerInfo = result.header
    ? `header(count=${result.header.count})`
    : 'items-only';

  bot.bot.log(
    `[TRAJES] 1417 ${headerInfo}: ${result.items.length} parseados, ${added} nuevos, ${bot.costumes.length} total`
  );

  if (added > 0) {
    bot.emit('costumesUpdated', bot.costumes);
  }
}
