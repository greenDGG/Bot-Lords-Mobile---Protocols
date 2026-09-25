let offsetMs = 0;
let synced = false;

export function serverNow(): number {
  return Date.now() + offsetMs;
}

export function serverNowSec(): number {
  return Math.floor(serverNow() / 1000);
}

export function isSynced(): boolean {
  return synced;
}

export function getOffsetMs(): number {
  return offsetMs;
}

async function syncOnce(): Promise<void> {
  try {
    const t0 = Date.now();
    const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC', { signal: AbortSignal.timeout(5000) });
    const t1 = Date.now();
    const data = await res.json() as { unixtime: number };
    const cloudUtcMs = data.unixtime * 1000;
    const roundTrip = t1 - t0;
    const cloudAtT1 = cloudUtcMs + roundTrip / 2;
    offsetMs = Math.round(cloudAtT1 - t1);
    synced = true;
  } catch {
    synced = false;
  }
}

export function startClockSync(intervalMs = 300000): void {
  syncOnce();
  setInterval(syncOnce, intervalMs);
}
