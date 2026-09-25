import { loadProxyAuthBytes, saveProxyAuthBytes } from './proxy-auth-config';
import { databaseService } from '../../database/database.service';

interface ResolvedVersion {
  major: number;
  minor: number;
  patch: number;
  timestamp: number;
}

let cachedVersion: ResolvedVersion | null = null;
let fetchPromise: Promise<ResolvedVersion> | null = null;
let writePromise: Promise<void> | null = null;

const IGG_PLIST_URL = 'http://download-lo-snd.igg.com/win6/Update.plist';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_VERSION: ResolvedVersion = { major: 2, minor: 201, patch: 315, timestamp: 0 };

function log(msg: string): void {
  console.log(`[VERSION] ${msg}`);
}

export async function resolveVersion(): Promise<ResolvedVersion> {
  if (cachedVersion && Date.now() - cachedVersion.timestamp < CACHE_TTL_MS) {
    return cachedVersion;
  }

  if (fetchPromise) {
    return fetchPromise;
  }

  fetchPromise = doFetch();
  try {
    const result = await fetchPromise;
    cachedVersion = result;
    return result;
  } finally {
    fetchPromise = null;
  }
}

async function doFetch(): Promise<ResolvedVersion> {
  log('Obteniendo versión del juego...');

  let major = DEFAULT_VERSION.major;
  let minor = DEFAULT_VERSION.minor;
  let patch = DEFAULT_VERSION.patch;

  const [gpResult, patchResult] = await Promise.allSettled([
    fetchGooglePlayVersion(),
    fetchPatchVersion(),
  ]);

  if (gpResult.status === 'fulfilled' && gpResult.value) {
    major = gpResult.value.major;
    minor = gpResult.value.minor;
    log(`Google Play: v${major}.${minor}`);
  } else {
    log(`Google Play fallback: v${major}.${minor}`);
  }

  if (patchResult.status === 'fulfilled' && patchResult.value !== null) {
    patch = patchResult.value;
    log(`IGG Patch: ${patch}`);
  } else {
    log(`IGG Patch fallback: ${patch}`);
  }

  const version: ResolvedVersion = { major, minor, patch, timestamp: Date.now() };
  log(`Versión final: v${major}.${minor}.${patch}`);

  await persistVersion(version);

  return version;
}

async function persistVersion(version: ResolvedVersion): Promise<void> {
  if (writePromise) {
    return writePromise;
  }

  writePromise = doWrite(version);
  try {
    await writePromise;
  } finally {
    writePromise = null;
  }
}

async function doWrite(version: ResolvedVersion): Promise<void> {
  if (!databaseService.isConnected()) return;

  const current = await loadProxyAuthBytes();
  const patchLow = version.patch & 0xFF;
  const patchHigh = (version.patch >> 8) & 0xFF;

  if (current.versionMajor === version.major &&
      current.versionMinor === version.minor &&
      current.versionPatchLow === patchLow &&
      current.versionPatchHigh === patchHigh) {
    log('Version en DB ya actualizada, omitiendo write');
    return;
  }

  try {
    await saveProxyAuthBytes({
      versionMajor: version.major,
      versionMinor: version.minor,
      versionPatchLow: patchLow,
      versionPatchHigh: patchHigh,
      extra1: current.extra1,
      extra2: current.extra2,
    });
    log(`DB escrita: v${version.major}.${version.minor}.${version.patch}`);
  } catch (err) {
    log(`Error escritura DB: ${(err as Error).message}`);
  }
}

async function fetchGooglePlayVersion(): Promise<{ major: number; minor: number } | null> {
  try {
    const gp = require('google-play-scraper').default;
    const result = await gp.app({ appId: 'com.igg.android.lordsmobile' });
    const ver: string = result.version || '';
    const parts = ver.split('.');
    if (parts.length >= 2) {
      const major = parseInt(parts[0], 10);
      const minor = parseInt(parts[1], 10);
      if (!isNaN(major) && !isNaN(minor)) {
        return { major, minor };
      }
    }
    return null;
  } catch (err) {
    log(`Error Google Play: ${(err as Error).message}`);
    return null;
  }
}

async function fetchPatchVersion(): Promise<number | null> {
  try {
    const res = await fetch(IGG_PLIST_URL, {
      signal: AbortSignal.timeout(10000),
    });
    const text = await res.text();

    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length > 0) {
      const parts = lines[0].split('/');
      if (parts.length >= 3) {
        const patch = parseInt(parts[2], 10);
        if (!isNaN(patch)) return patch;
      }
    }

    return null;
  } catch (err) {
    log(`Error IGG Patch: ${(err as Error).message}`);
    return null;
  }
}

export function getCachedVersion(): ResolvedVersion | null {
  return cachedVersion;
}
