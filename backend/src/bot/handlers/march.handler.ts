import type { BotInstance } from '../core/bot-instance';
import { MarchInfo, OwnMarch } from '../models/march.types';
import { parseMarchIncoming, parseMarchUpdate, parseMarch, lineTypeLabel } from '../parsers/march.parser';
import { parse2414 } from '../parsers/marches.parser';
import { requestMarchData } from '../commands/march.commands';
import { serverNowSec } from '../../utils/clock-sync';

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function handleMarchIncoming(bot: BotInstance, body: Buffer): void {
  if (body.length < 18) return;
  try {
    const parsed = parseMarchIncoming(body);
    if (parsed) {
      const arrivalTimestamp = parsed.startTimestamp + parsed.seconds;
      const marchType = parsed.marchType === 0xff05 ? 'ataque' : parsed.marchType === 0xff08 ? 'exploración' : `tipo=${parsed.marchType.toString(16)}`;
      const idx = bot.incomingMarches.findIndex(m => m.marchId === parsed.marchId);
      const info: MarchInfo = { marchId: parsed.marchId, arrivalTimestamp, updated: false, arrived: false, countered: false, marchType: parsed.marchType };
      if (idx >= 0) {
        const prev = bot.incomingMarches[idx];
        if (prev.timer) { clearTimeout(prev.timer); }
        bot.incomingMarches[idx] = { ...info, packet: prev.packet, counterFormation: prev.counterFormation, countered: prev.countered, evaluated: prev.evaluated };
        if (bot.config.warMode) bot.armCounterTimer(bot.incomingMarches[idx]);
      }
      else bot.incomingMarches.push(info);
      const remain = Math.max(0, arrivalTimestamp - serverNowSec());
      bot.bot.log(`[ATALAYA] Marcha ${parsed.marchId} (${marchType}) — llega en ${formatDuration(remain)}`);

      if (!bot.incomingMarches[idx >= 0 ? idx : bot.incomingMarches.length - 1].packet && !bot.pendingMarchData.some(p => p.marchId === parsed.marchId)) {
        bot.pendingMarchData.push({ marchId: parsed.marchId, timestamp: Date.now() });
        bot.lastRequestedMarchId = parsed.marchId;
        requestMarchData(bot.bot, parsed.marchId);
      }

      bot.emit('marchesUpdated');
    }
  } catch {}
}

export function handleMarchUpdate(bot: BotInstance, body: Buffer): void {
  if (body.length < 16) return;
  try {
    const parsed = parseMarchUpdate(body);
    if (parsed) {
      const idx = bot.incomingMarches.findIndex(m => m.marchId === parsed.marchId);
      if (idx >= 0) {
        bot.incomingMarches[idx].arrivalTimestamp = parsed.arrivalTimestamp;
        bot.incomingMarches[idx].updated = true;
        if (bot.config.warMode) bot.armCounterTimer(bot.incomingMarches[idx]);
        const remain = Math.max(0, parsed.arrivalTimestamp - serverNowSec());
        bot.bot.log(`[ATALAYA] Marcha ${parsed.marchId} actualizada — llega en ${formatDuration(remain)}`);
      } else {
        bot.incomingMarches.push({ marchId: parsed.marchId, arrivalTimestamp: parsed.arrivalTimestamp, updated: true, arrived: false, countered: false });
        const remain = Math.max(0, parsed.arrivalTimestamp - serverNowSec());
        bot.bot.log(`[ATALAYA] Marcha ${parsed.marchId} (update sin incoming previo) — llega en ${formatDuration(remain)}`);
      }
      bot.emit('marchesUpdated');
    }
  } catch {}
}

export function handleMarchUpdate2442(bot: BotInstance, body: Buffer): void {
  if (body.length < 16) return;
  try {
    const marchId = body.readUInt32LE(0);
    const adjustedTimestamp = body.readUInt32LE(4);
    const remainingSec = body.readUInt32LE(12);
    const arrivalTimestamp = adjustedTimestamp + remainingSec;
    const now = serverNowSec();
    if (arrivalTimestamp > now - 3600 && arrivalTimestamp < now + 86400) {
      const idx = bot.incomingMarches.findIndex(m => m.marchId === marchId);
      if (idx >= 0) {
        bot.incomingMarches[idx].arrivalTimestamp = arrivalTimestamp;
        bot.incomingMarches[idx].updated = true;
        if (bot.config.warMode) bot.armCounterTimer(bot.incomingMarches[idx]);
        const remain = Math.max(0, arrivalTimestamp - now);
        bot.bot.log(`[ATALAYA] Marcha ${marchId} actualizada (2442) — llega en ${formatDuration(remain)}`);
        bot.emit('marchesUpdated');
      } else {
        bot.bot.log(`[ATALAYA] Marcha ${marchId} (2442 sin incoming previo)`);
      }
    }
  } catch {}
}

export function handleBattleImminent(bot: BotInstance, body: Buffer): void {
  if (body.length < 4) return;
  try {
    const marchId = body.readUInt32LE(0);
    const idx = bot.incomingMarches.findIndex(m => m.marchId === marchId);
    if (idx >= 0 && bot.config.warMode && !bot.incomingMarches[idx].countered && !bot.incomingMarches[idx].arrived) {
      if (bot.incomingMarches[idx].timer) { clearTimeout(bot.incomingMarches[idx].timer); bot.incomingMarches[idx].timer = undefined; }
      if (bot.incomingMarches[idx].counterFormation !== undefined) {
        bot.fireCounterNow(bot.incomingMarches[idx]);
        bot.bot.log(`[ATALAYA] Marcha ${marchId}: batalla inminente (2441) — contra forzada ahora`);
      } else {
        bot.bot.log(`[ATALAYA] Marcha ${marchId}: batalla inminente (2441) pero sin datos de contra aún`);
      }
    }
  } catch {}
}

export function handleMarchDataResponse(bot: BotInstance, body: Buffer): void {
  if (body.length < 4) return;
  try {
    const marchId = body.readUInt32LE(0);
    bot.bot.log(`[ATALAYA] 2445 marchId=${marchId}`);
  } catch {}
}

export function handleMarchData(bot: BotInstance, body: Buffer): void {
  if (body.length < 20) return;
  try {
    bot.bot.log(`[ATALAYA] 2446 body hex: ${body.subarray(0, Math.min(body.length, 200)).toString('hex')}`);
    const parsed = parseMarch(body, (msg) => bot.bot.log(msg));
    if (parsed) {
      let marchId = 0;

      const pendingWithoutPacket = bot.pendingMarchData.find(p => {
        const m = bot.incomingMarches.find(im => im.marchId === p.marchId);
        return m && !m.packet;
      });

      if (pendingWithoutPacket) {
        marchId = pendingWithoutPacket.marchId;
        bot.pendingMarchData = bot.pendingMarchData.filter(p => p.marchId !== marchId);
      } else {
        marchId = bot.lastRequestedMarchId;
      }

      if (marchId) {
        const idx = bot.incomingMarches.findIndex(m => m.marchId === marchId);
        if (idx >= 0) {
          bot.incomingMarches[idx].packet = parsed;
          const kind = lineTypeLabel(parsed.lineType) ?? `lineType=${parsed.lineType}`;
          bot.bot.log(`[ATALAYA] 2446 datos vinculados a marcha ${marchId} (${kind}): ${parsed.troops.length} tropas, ${parsed.heroes.length} héroes`);
          bot.armCounter(bot.incomingMarches[idx]);
        }
      }
      bot.lastRequestedMarchId = 0;
      bot.emit('marchesUpdated');
    } else {
      bot.bot.log(`[ATALAYA] 2446 no se pudo parsear (len=${body.length})`);
    }
  } catch (e: any) { bot.bot.log(`[ATALAYA] 2446 error parseando: ${e?.message}`); }
}

export function handle2414(bot: BotInstance, body: Buffer): void {
  try {
    const data = parse2414(body);
    if (!data) {
      bot.bot.log(`[MARCHAS] 2414 no parseado (len=${body.length}) head=${body.subarray(0, 8).toString('hex')}`);
      return;
    }
    const prev = bot.ownMarches;
    bot.ownMarches = data;
    if (!prev || prev.limit !== data.limit || prev.count !== data.count) {
      const fmt = (e: OwnMarch) => {
        const t = e.troops.map(x => `${x.count} T${x.tier}/t${x.type}`).join('+');
        const h = e.heroIds.length ? ` h=[${e.heroIds.join(',')}]` : '';
        return t ? `${t}${h}` : h || 'sin troops';
      };
      bot.bot.log(`[MARCHAS] 2414: ${data.count}/${data.limit} marchas — ${data.entries.map(e => `#${e.index} ${e.status} (${e.destX},${e.destY}) ${fmt(e)}`).join(', ')}`);
    } else {
      for (const e of data.entries) {
        const p = prev.entries.find(x => x.index === e.index);
        if (p && p.status !== e.status) {
          bot.bot.log(`[MARCHAS] marcha slot ${e.index}: ${p.status} → ${e.status}`);
        }
      }
    }
    bot.emit('ownMarchesUpdated');
  } catch (e: any) {
    bot.bot.log(`[MARCHAS] 2414 error parseando: ${e?.message}`);
  }
}
