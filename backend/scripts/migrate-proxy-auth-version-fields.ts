/**
 * Migración: renombra bytes de proxy auth a nombres de versión legibles
 * byte0C→versionMinor, byte0D→versionMajor, byte0E→versionPatchLow,
 * byte0F→versionPatchHigh, byte10→extra1, byte11→extra2
 * Uso: npx ts-node scripts/migrate-proxy-auth-version-fields.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { databaseService } from '../src/database/database.service';

const FIELD_MAP: Record<string, string> = {
  byte0C: 'versionMinor',
  byte0D: 'versionMajor',
  byte0E: 'versionPatchLow',
  byte0F: 'versionPatchHigh',
  byte10: 'extra1',
  byte11: 'extra2',
};

async function main() {
  await databaseService.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db!;
  const col = db.collection('proxyauths');

  const doc = await col.findOne({ key: 'proxyAuth' });
  if (!doc) {
    console.log('[MIGRATE] No hay documento proxyAuth, nada que migrar');
    await databaseService.disconnect();
    return;
  }

  const $rename: Record<string, string> = {};
  let hasOld = false;
  for (const [oldName, newName] of Object.entries(FIELD_MAP)) {
    if (oldName in doc) {
      $rename[oldName] = newName;
      hasOld = true;
    }
  }

  if (!hasOld) {
    console.log('[MIGRATE] Campos ya están con nombres nuevos, nada que migrar');
    await databaseService.disconnect();
    return;
  }

  await col.updateOne({ key: 'proxyAuth' }, { $rename });
  console.log('[MIGRATE] Campos renombrados:', Object.keys($rename).join(', '));

  const updated = await col.findOne({ key: 'proxyAuth' });
  console.log('[MIGRATE] Resultado:', {
    versionMajor: updated?.versionMajor,
    versionMinor: updated?.versionMinor,
    versionPatch: updated ? ((updated.versionPatchHigh as number) << 8 | (updated.versionPatchLow as number)) : '?',
  });

  await databaseService.disconnect();
}

main().catch((err) => {
  console.error('[MIGRATE] Error:', err);
  process.exit(1);
});
