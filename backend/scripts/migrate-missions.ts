/**
 * Agregar missions config a cuentas que no lo tengan.
 *
 * Uso:
 *   npx ts-node scripts/migrate-missions.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as dns from 'dns';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

dns.setServers(['8.8.8.8', '8.8.4.4']);

import mongoose from 'mongoose';
import { ConfigModel } from '../src/database/schemas/account.schema';

const MONGO_URI = process.env.MONGO_URI || '';
const MISSIONS_DEFAULT = { autoEliminate: false, wantedMissionIds: [] };

async function migrate() {
  if (!MONGO_URI) {
    console.error('Error: Define MONGO_URI en .env');
    process.exit(1);
  }

  console.log('[MIGRATE] Conectando a MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('[MIGRATE] Conectado');

  const result = await ConfigModel.updateMany(
    { missions: { $exists: false } },
    { $set: { missions: MISSIONS_DEFAULT } }
  );

  console.log(`[MIGRATE] ${result.modifiedCount} documentos actualizados con missions default`);

  const total = await ConfigModel.countDocuments();
  const withMissions = await ConfigModel.countDocuments({ missions: { $exists: true } });
  console.log(`[MIGRATE] Total: ${total} | Con missions: ${withMissions}`);

  // Mostrar estado de cada cuenta
  const docs = await ConfigModel.find({}, { iggId: 1, missions: 1 }).lean();
  for (const d of docs) {
    const m = (d as any).missions;
    console.log(`  IGG ${(d as any).iggId}: autoEliminate=${m?.autoEliminate} wanted=${JSON.stringify(m?.wantedMissionIds || [])}`);
  }

  await mongoose.disconnect();
  console.log('[MIGRATE] Listo');
}

migrate().catch(err => {
  console.error('[MIGRATE] Error:', err);
  process.exit(1);
});
