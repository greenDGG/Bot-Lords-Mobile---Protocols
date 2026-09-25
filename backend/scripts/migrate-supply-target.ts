/**
 * Migración: Convertir supply.location → supply.targetPlayer.
 *
 * Si supply.location existe pero supply.targetPlayer no, se elimina location
 * y se deja targetPlayer vacío (el usuario debe configurarlo manualmente).
 *
 * Uso:
 *   npx ts-node scripts/migrate-supply-target.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as dns from 'dns';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

dns.setServers(['8.8.8.8', '8.8.4.4']);

import mongoose from 'mongoose';
import { ConfigModel } from '../src/database/schemas/account.schema';

async function migrate() {
  if (!process.env.MONGO_URI) {
    console.error('Error: Define MONGO_URI en las variables de entorno');
    process.exit(1);
  }

  console.log('[MIGRATE] Conectando a MongoDB...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('[MIGRATE] Conectado');

  // 1. Agregar targetPlayer donde no exista
  const addResult = await ConfigModel.updateMany(
    { 'supply.targetPlayer': { $exists: false } },
    { $set: { 'supply.targetPlayer': '' } }
  );
  console.log(`[MIGRATE] ${addResult.modifiedCount} docs: targetPlayer agregado`);

  // 2. Eliminar location de supply donde exista
  const removeResult = await ConfigModel.updateMany(
    { 'supply.location': { $exists: true } },
    { $unset: { 'supply.location': '' } }
  );
  console.log(`[MIGRATE] ${removeResult.modifiedCount} docs: location eliminado`);

  const total = await ConfigModel.countDocuments();
  console.log(`[MIGRATE] Total: ${total}`);

  await mongoose.disconnect();
  console.log('[MIGRATE] Listo — configure supply.targetPlayer manualmente en cada cuenta');
}

migrate().catch(err => {
  console.error('[MIGRATE] Error:', err);
  process.exit(1);
});
