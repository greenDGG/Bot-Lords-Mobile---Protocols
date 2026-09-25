import type { BotInstance } from '../core/bot-instance';
import { MarchInfo } from '../models/march.types';
import { parseMarch } from '../parsers/march.parser';
import { selectAction11, selectWarIndex } from '../commands/war.commands';
import { databaseService } from '../../database/database.service';
import { armCounter, armCounterTimer } from './counter-logic';
import { serverNowSec } from '../../utils/clock-sync';

export interface WarParticipant {
  name: string;
  index: number;
  mask: number;
  troops: { type: string; tier: number; count: number }[];
  raw: string;
}

const TROOP_TYPE_MAP: Record<number, { type: string; tier: number }> = {
  0x0001: { type: 'infantry', tier: 5 },
  0x0002: { type: 'artillery', tier: 5 },
  0x0004: { type: 'cavalry', tier: 5 },
  0x0010: { type: 'infantry', tier: 4 },
  0x0020: { type: 'artillery', tier: 4 },
  0x0040: { type: 'cavalry', tier: 4 },
  0x0080: { type: 'siege', tier: 4 },
  0x0100: { type: 'infantry', tier: 3 },
  0x0200: { type: 'artillery', tier: 3 },
  0x0400: { type: 'cavalry', tier: 3 },
  0x1000: { type: 'infantry', tier: 2 },
  0x2000: { type: 'artillery', tier: 2 },
  0x4000: { type: 'cavalry', tier: 2 },
  0x10000: { type: 'infantry', tier: 1 },
  0x20000: { type: 'artillery', tier: 1 },
  0x40000: { type: 'cavalry', tier: 1 },
};

export function parse2483(body: Buffer): WarParticipant[] {
  const participants: WarParticipant[] = [];
  let off = 0;

  while (off + 37 <= body.length) {
    const index = body.readUInt32LE(off); off += 4;
    const rawName = body.toString('ascii', off, off + 13);
    const name = rawName.replace(/\0+$/, '');
    off += 13;
    const status = body[off]; off += 1;
    const tier = body[off]; off += 1;
    const timestamp = body.readUInt32LE(off); off += 4;
    const unknownField = body.readUInt32LE(off); off += 4;
    off += 6;
    const mask = body.readUInt32LE(off); off += 4;

    const troops: { type: string; tier: number; count: number }[] = [];
    const bits = Object.keys(TROOP_TYPE_MAP).map(Number).sort((a, b) => a - b);
    for (const bit of bits) {
      if (mask & bit) {
        if (off + 4 > body.length) break;
        const count = body.readUInt32LE(off); off += 4;
        const info = TROOP_TYPE_MAP[bit];
        troops.push({ type: info.type, tier: info.tier, count });
      }
    }

    const rawHex = body.subarray(off - (4 + troops.length * 4), off).toString('hex');
    participants.push({ name, index, mask, troops, raw: rawHex });

    if (!name && mask === 0) break;
  }

  return participants;
}

export async function loadMarchHistory(bot: BotInstance): Promise<void> {
  try {
    const docs = await databaseService.MarchHistoryModel.find({ iggId: bot.iggId }).sort({ arrivedAt: -1 }).limit(50).lean();
    bot.marchHistory = docs.map((d: any) => ({
      ...d,
      _id: d._id.toString(),
    }));
    bot.bot.log(`[ATALAYA] Cargadas ${bot.marchHistory.length} marchas del historial`);
  } catch (err: any) {
    bot.bot.log(`[ATALAYA] Error cargando historial: ${err.message}`);
  }
}

export async function checkExpiredMarches(bot: BotInstance): Promise<void> {
  const now = serverNowSec();

  if (bot.config.warMode) {
    for (const march of bot.incomingMarches) {
      if (march.arrived || march.evaluated) continue;
      if (!march.packet) continue;
      armCounter(bot, march);
    }
  }

  for (const march of bot.incomingMarches) {
    if (march.arrived) continue;
    if (now < march.arrivalTimestamp) continue;

    march.arrived = true;
    bot.bot.log(`[ATALAYA] Marcha ${march.marchId} ha llegado`);

    if (march.countered && bot.config.warMode) {
      if (march.timer) { clearTimeout(march.timer); march.timer = undefined; }
      armCounterTimer(bot, march);
    } else if (march.timer) {
      clearTimeout(march.timer); march.timer = undefined;
    }

    try {
      const MarchHistory = databaseService.MarchHistoryModel;
      const exists = await MarchHistory.findOne({ iggId: bot.iggId, marchId: march.marchId });
      if (!exists) {
        const doc = await MarchHistory.create({
          iggId: bot.iggId,
          marchId: march.marchId,
          marchType: march.marchType || 0,
          arrivedAt: now,
          arrivalTimestamp: march.arrivalTimestamp,
          heroes: march.packet?.heroes || [],
          troops: (march.packet?.troops || []).filter(t => t.count > 0),
          t5Troops: (march.packet?.t5Troops || []).filter(t => t.count > 0),
          leaderFlag: march.packet?.leaderFlag ?? 5,
        });
        bot.marchHistory.unshift({
          _id: doc._id.toString(),
          iggId: bot.iggId,
          marchId: march.marchId,
          marchType: march.marchType || 0,
          arrivedAt: now,
          arrivalTimestamp: march.arrivalTimestamp,
          heroes: march.packet?.heroes || [],
          troops: (march.packet?.troops || []).filter(t => t.count > 0),
          t5Troops: (march.packet?.t5Troops || []).filter(t => t.count > 0),
          leaderFlag: march.packet?.leaderFlag ?? 5,
        });
        bot.bot.log(`[ATALAYA] Marcha ${march.marchId} archivada en DB`);
      }
    } catch (err: any) {
      bot.bot.log(`[ATALAYA] Error guardando marcha ${march.marchId} en DB: ${err.message}`);
    }

    bot.emit('marchesUpdated');
  }
}

export function serializableMarches(bot: BotInstance): MarchInfo[] {
  return (bot.incomingMarches || []).map((m) => ({ ...m, timer: undefined }));
}
