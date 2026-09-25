/**
 * Migración: Agregar campo 'sweep' a documentos de config que no lo tengan.
 *
 * Uso:
 *   npx ts-node scripts/migrate-sweep.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as dns from 'dns';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

dns.setServers(['8.8.8.8', '8.8.4.4']);

import mongoose from 'mongoose';
import { ConfigModel } from '../src/database/schemas/account.schema';

const MONGO_URI = process.env.MONGO_URI || '';
const SWEEP_DEFAULT = { enable: false, payload: '0202010001' };

async function migrate() {
  if (!MONGO_URI) {
    console.error('Error: Define MONGO_URI en las variables de entorno');
    process.exit(1);
  }

  console.log('[MIGRATE] Conectando a MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('[MIGRATE] Conectado');

  const result = await ConfigModel.updateMany(
    { sweep: { $exists: false } },
    { $set: { sweep: SWEEP_DEFAULT } }
  );

  console.log(`[MIGRATE] ${result.modifiedCount} documentos actualizados con sweep default`);

  const total = await ConfigModel.countDocuments();
  const withSweep = await ConfigModel.countDocuments({ sweep: { $exists: true } });
  console.log(`[MIGRATE] Total: ${total} | Con sweep: ${withSweep}`);

  await mongoose.disconnect();
  console.log('[MIGRATE] Listo');
}

migrate().catch(err => {
  console.error('[MIGRATE] Error:', err);
  process.exit(1);
});
