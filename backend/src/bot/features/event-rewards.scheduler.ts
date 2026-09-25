import type { BotInstance } from '../core/bot-instance';
import { requestHellEvent, requestSolitaryEvent } from '../commands/event-rewards.commands';
import { databaseService } from '../../database/database.service';

const HOUR_MS = 3600000;
const THREE_HOURS_MS = 3 * HOUR_MS;
const CYCLE_OFFSET_MS = 5 * HOUR_MS;

function getUtcMs(): number {
  const now = new Date();
  return now.getTime() + now.getTimezoneOffset() * 60000;
}

function getHourTimestamp(): number {
  const utcMs = getUtcMs();
  const hourStart = new Date(utcMs);
  hourStart.setUTCMinutes(0, 0, 0);
  return Math.floor(hourStart.getTime() / 1000);
}

function hourToTimestamp(hoursAgo: number): number {
  const utcMs = getUtcMs();
  const ts = utcMs - hoursAgo * HOUR_MS;
  const hourStart = new Date(ts);
  hourStart.setUTCMinutes(0, 0, 0);
  return Math.floor(hourStart.getTime() / 1000);
}

function msUntilNextHell(): number {
  const utcMs = getUtcMs();
  const elapsed = utcMs % HOUR_MS;
  return elapsed === 0 ? 1000 : HOUR_MS - elapsed + 1000;
}

function msUntilNextSolitary(): number {
  const utcMs = getUtcMs();
  const adjusted = utcMs - CYCLE_OFFSET_MS;
  const elapsed = ((adjusted % THREE_HOURS_MS) + THREE_HOURS_MS) % THREE_HOURS_MS;
  return elapsed === 0 ? 1000 : THREE_HOURS_MS - elapsed + 1000;
}

function getMissedSolitarySlots(): number[] {
  const utcMs = getUtcMs();
  const currentHour = Math.floor(utcMs / HOUR_MS) % 24;
  const missed: number[] = [];

  for (let h = 1; h <= 6; h++) {
    const checkHour = (currentHour - h + 24) % 24;
    const cyclePos = ((checkHour - 5 + 24) % 24) % 3;
    if (cyclePos === 0) {
      missed.push(h);
    }
  }

  return missed;
}

async function hasDataForHour(eventType: number, hourTimestamp: number): Promise<boolean> {
  if (!databaseService.isConnected()) return false;
  try {
    const doc = await databaseService.EventRewardDataModel.findOne({ eventType, hourTimestamp }).lean();
    return doc !== null;
  } catch {
    return false;
  }
}

async function waitForBotReady(bot: BotInstance): Promise<void> {
  if (bot.bot.isOnline) return;
  return new Promise<void>(resolve => {
    bot.once('ready', () => resolve());
  });
}

export async function startEventRewardScheduler(bot: BotInstance): Promise<void> {
  bot.bot.log('[EVENT-REWARDS] Scheduler iniciado, verificando DB...');

  const hourTs = getHourTimestamp();
  const currentHour = Math.floor(getUtcMs() / HOUR_MS) % 24;
  bot.bot.log(`[EVENT-REWARDS] Hora actual UTC: ${currentHour}:00`);

  await waitForBotReady(bot);

  bot.bot.log('[EVENT-REWARDS] Enviando infierno actual...');
  requestHellEvent(bot.bot);
  await new Promise(r => setTimeout(r, 2000));

  const missedHours = getMissedSolitarySlots();
  for (const h of missedHours) {
    const ts = hourToTimestamp(h);
    const hasData = await hasDataForHour(1, ts);
    if (!hasData) {
      bot.bot.log(`[EVENT-REWARDS] Solitario perdido hace ${h}h (ts=${ts}), solicitando...`);
      requestSolitaryEvent(bot.bot);
      await new Promise(r => setTimeout(r, 2000));
    } else {
      bot.bot.log(`[EVENT-REWARDS] Solitario hace ${h}h ya en DB, omitiendo`);
    }
  }

  scheduleHell(bot);
  scheduleSolitary(bot);
}

function scheduleHell(bot: BotInstance): void {
  const delay = msUntilNextHell();
  const nextTime = new Date(Date.now() + delay);
  bot.bot.log(`[EVENT-REWARDS] Infierno programado en ${Math.round(delay / 60000)}min (${nextTime.toISOString().slice(11, 16)} UTC)`);

  setTimeout(() => {
    if (!bot.connected) { scheduleHell(bot); return; }
    bot.bot.log('[EVENT-REWARDS] Solicitando infierno (3609)...');
    requestHellEvent(bot.bot);
    scheduleHell(bot);
  }, delay);
}

function scheduleSolitary(bot: BotInstance): void {
  const delay = msUntilNextSolitary();
  const nextTime = new Date(Date.now() + delay);
  bot.bot.log(`[EVENT-REWARDS] Solitario programado en ${Math.round(delay / 60000)}min (${nextTime.toISOString().slice(11, 16)} UTC)`);

  setTimeout(() => {
    if (!bot.connected) { scheduleSolitary(bot); return; }
    bot.bot.log('[EVENT-REWARDS] Solicitando solitario (3609)...');
    requestSolitaryEvent(bot.bot);
    scheduleSolitary(bot);
  }, delay + 2000);
}
