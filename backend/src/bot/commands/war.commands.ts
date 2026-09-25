import { BotEngine } from '../engine/bot-engine';

export function selectAction11(bot: BotEngine): void {
  const payload = Buffer.alloc(6);
  payload.writeUInt32LE(11, 0);
  bot.sendCommandPacket(1144, payload, true);
}

export function selectWarIndex(bot: BotEngine, index: number): void {
  const payload = Buffer.alloc(6);
  payload.writeUInt32LE(index * 256, 0);
  bot.sendCommandPacket(2480, payload, true);
}

export function sendTroops(bot: BotEngine, rallyLeader: string, mask: number, quantities: number[]): void {
  const nameBytes = Buffer.from(rallyLeader, 'ascii');
  const namePadded = Buffer.alloc(13, 0x00);
  nameBytes.copy(namePadded, 0, 0, Math.min(nameBytes.length, 13));

  const troopTypes = [
    { bit: 0x1111, qty: quantities[0] },
    { bit: 0x2222, qty: quantities[1] },
    { bit: 0x4444, qty: quantities[2] },
  ];

  const parts: Buffer[] = [namePadded];
  parts.push(Buffer.alloc(4));
  parts[parts.length - 1].writeUInt32LE(mask, 0);

  for (const t of troopTypes) {
    if (mask & t.bit) {
      const buf = Buffer.alloc(4);
      buf.writeUInt32LE(t.qty, 0);
      parts.push(buf);
    }
  }

  parts.push(Buffer.from([0x00]));
  const payload = Buffer.concat(parts);
  bot.sendCommandPacket(2472, payload, true);
}

export function send2476(bot: BotEngine): void {
  bot.sendCommandPacket(2476, Buffer.alloc(0), true);
}
