/**
 * Migración: elimina `supply.maxAmount` (config vieja).
 *
 * Ese valor era el intento de adivinar cuánto cabe en una caravana antes de
 * tener el stat "Capacidad de suministro +" (Puesto Comercial + "Bolsas más
 * grandes"); ahora la capacidad sale de ahí (`getSupplyCapacity()`), así que
 * el campo sobra.
 *
 * Toca los dos almacenes que usa el bot:
 *   1. Mongo  → ConfigModel
 *   2. JSON   → access/<iggId>/config.json
 *
 * Uso: npx ts-node scripts/migrate-supply-capacity.ts   (npm run migrate:supply)
 */
import 'dotenv/config';
import * as fs from 'fs';
import { databaseService } from '../src/database/database.service';
import { configService } from '../src/config/config.service';

async function migrateMongo(): Promise<void> {
  const conMax = await databaseService.ConfigModel.countDocuments({ 'supply.maxAmount': { $exists: true } });
  console.log(`[MIGRATE] Mongo: ${conMax} configs con supply.maxAmount`);

  if (conMax > 0) {
    const res = await databaseService.ConfigModel.updateMany(
      { 'supply.maxAmount': { $exists: true } },
      { $unset: { 'supply.maxAmount': '' } },
    );
    console.log(`[MIGRATE] Mongo: supply.maxAmount eliminado → match=${res.matchedCount}, modificadas=${res.modifiedCount}`);
  }

  const quedan = await databaseService.ConfigModel.countDocuments({ 'supply.maxAmount': { $exists: true } });
  console.log(quedan === 0
    ? '[MIGRATE] Mongo OK: ninguna config con supply.maxAmount'
    : `[MIGRATE] Mongo ATENCIÓN: quedan ${quedan} con supply.maxAmount`);
}

function migrateJsonFiles(): void {
  const dir = configService.accessDir;
  if (!fs.existsSync(dir)) {
    console.log(`[MIGRATE] JSON: no existe ${dir}`);
    return;
  }
  let escritos = 0;
  let sinConfig = 0;
  let ids = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const configPath = configService.getConfigPath(entry.name);
    let raw: any = null;
    try {
      raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      sinConfig++;
      continue;
    }
    ids++;
    if (raw?.supply && typeof raw.supply === 'object' && Object.prototype.hasOwnProperty.call(raw.supply, 'maxAmount')) {
      delete raw.supply.maxAmount;
      fs.writeFileSync(configPath, JSON.stringify(raw, null, 2), 'utf-8');
      escritos++;
    }
  }
  console.log(`[MIGRATE] JSON: ${ids} configs (${escritos} limpiadas, ${sinConfig} sin config.json) en ${dir}`);
}

async function main() {
  await databaseService.connect(process.env.MONGO_URI);
  await migrateMongo();
  await databaseService.disconnect();

  migrateJsonFiles();
  console.log('[MIGRATE] Listo — la capacidad por caravana sale del stat "Capacidad de suministro +"');
}

main().catch((err) => {
  console.error('[MIGRATE] Error:', err);
  process.exit(1);
});
