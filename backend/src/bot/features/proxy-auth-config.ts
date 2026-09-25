import { databaseService } from '../../database/database.service';

export interface ProxyAuthBytes {
  versionMinor: number;
  versionMajor: number;
  versionPatchLow: number;
  versionPatchHigh: number;
  extra1: number;
  extra2: number;
}

/** Valores actuales hardcodeados (fallback si no hay DB o doc). */
export const DEFAULT_PROXY_AUTH_BYTES: ProxyAuthBytes = {
  versionMinor: 0xc8,
  versionMajor: 0x02,
  versionPatchLow: 0x37,
  versionPatchHigh: 0x01,
  extra1: 0x05,
  extra2: 0x01,
};

const BYTE_KEYS: (keyof ProxyAuthBytes)[] = ['versionMinor', 'versionMajor', 'versionPatchLow', 'versionPatchHigh', 'extra1', 'extra2'];

/** Lee la config global de proxy auth desde MongoDB (con defaults como fallback). */
export async function loadProxyAuthBytes(): Promise<ProxyAuthBytes> {
  if (!databaseService.isConnected()) return { ...DEFAULT_PROXY_AUTH_BYTES };
  try {
    const doc = await databaseService.ProxyAuthModel.findOne({ key: 'proxyAuth' }).lean();
    if (!doc) return { ...DEFAULT_PROXY_AUTH_BYTES };
    const out = { ...DEFAULT_PROXY_AUTH_BYTES };
    for (const k of BYTE_KEYS) {
      const v = (doc as any)[k];
      if (typeof v === 'number' && v >= 0 && v <= 255) out[k] = v;
    }
    return out;
  } catch {
    return { ...DEFAULT_PROXY_AUTH_BYTES };
  }
}

/** Guarda la config global en MongoDB y devuelve el documento resultante. */
export async function saveProxyAuthBytes(input: Partial<ProxyAuthBytes>): Promise<ProxyAuthBytes> {
  const $set: Record<string, number> = {};
  for (const k of BYTE_KEYS) {
    const v = Number((input as any)[k]);
    if (!Number.isFinite(v) || v < 0 || v > 255) {
      throw new Error(`Byte inválido: ${k} debe ser un número entre 0 y 255`);
    }
    $set[k] = Math.floor(v);
  }
  if (!databaseService.isConnected()) throw new Error('MongoDB no conectado');
  await databaseService.ProxyAuthModel.updateOne({ key: 'proxyAuth' }, { $set }, { upsert: true });
  return loadProxyAuthBytes();
}
