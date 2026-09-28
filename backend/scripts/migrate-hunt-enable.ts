/**
 * Migración: activa hunt.enable en TODAS las cuentas.
 *
 * Toca los dos almacenes que usa el bot:
 *   1. Mongo  → ConfigModel (lectura con loadAccountFromDB + guardado desde la UI)
 *   2. JSON   → access/<iggId>/config.json (lectura al arrancar con startAll())
 *
 * También completa hunt con los defaults (cooldown/scanRadius/squad/levels) en las
 * cuentas que no lo tienen todavía.
 *
 * Uso: npx ts-node scripts/migrate-hunt-enable.ts   (npm run migrate:hunt)
 */
import 'dotenv/config';
import * as fs from 'fs';
import { databaseService } from '../src/database/database.service';
import { defaultBotConfig } from '../src/models/bot-config';
import { configService } from '../src/config/config.service';

const HUNT_DEFAULTS = defaultBotConfig('').hunt;

function withHuntDefaults(hunt: any): any {
  // defaults primero: rellena lo que falte sin pisar lo ya configurado
  return { ...HUNT_DEFAULTS, ...(hunt || {}), enable: true };
}

async function migrateMongo(): Promise<void> {
  const total = await databaseService.ConfigModel.countDocuments({});
  const sinHunt = await databaseService.ConfigModel.countDocuments({ hunt: { $exists: false } });
  console.log(`[MIGRATE] Mongo: ${total} configs · ${sinHunt} sin campo hunt`);

  if (sinHunt > 0) {
    const res = await databaseService.ConfigModel.updateMany(
      { hunt: { $exists: false } },
      { $set: { hunt: withHuntDefaults(null) } },
    );
    console.log(`[MIGRATE] Mongo: hunt default → match=${res.matchedCount}, modificadas=${res.modifiedCount}`);
  }

  const faltantes = await databaseService.ConfigModel.countDocuments({ 'hunt.enable': { $ne: true } });
  const res = await databaseService.ConfigModel.updateMany(
    { 'hunt.enable': { $ne: true } },
    { $set: { 'hunt.enable': true } },
  );
  console.log(`[MIGRATE] Mongo: hunt.enable=true → ${faltantes} sin activar, match=${res.matchedCount}, modificadas=${res.modifiedCount}`);

  const sinLevels = await databaseService.ConfigModel.countDocuments({ 'hunt.levels': { $exists: false } });
  if (sinLevels > 0) {
    const r2 = await databaseService.ConfigModel.updateMany(
      { 'hunt.levels': { $exists: false } },
      { $set: { 'hunt.levels': HUNT_DEFAULTS.levels } },
    );
    console.log(`[MIGRATE] Mongo: hunt.levels default → match=${r2.matchedCount}, modificadas=${r2.modifiedCount}`);
  }

  const sinRadio = await databaseService.ConfigModel.countDocuments({ 'hunt.scanRadius': { $exists: false } });
  if (sinRadio > 0) {
    const r3 = await databaseService.ConfigModel.updateMany(
      { 'hunt.scanRadius': { $exists: false } },
      { $set: { 'hunt.scanRadius': HUNT_DEFAULTS.scanRadius } },
    );
    console.log(`[MIGRATE] Mongo: hunt.scanRadius default → match=${r3.matchedCount}, modificadas=${r3.modifiedCount}`);
  }

  const sinSquad = await databaseService.ConfigModel.countDocuments({ 'hunt.squad': { $exists: false } });
  if (sinSquad > 0) {
    const r4 = await databaseService.ConfigModel.updateMany(
      { 'hunt.squad': { $exists: false } },
      { $set: { 'hunt.squad': HUNT_DEFAULTS.squad } },
    );
    console.log(`[MIGRATE] Mongo: hunt.squad default → match=${r4.matchedCount}, modificadas=${r4.modifiedCount}`);
  }

  const pendientes = await databaseService.ConfigModel.countDocuments({ 'hunt.enable': { $ne: true } });
  console.log(pendientes === 0
    ? '[MIGRATE] Mongo OK: todas las cuentas tienen hunt.enable=true'
    : `[MIGRATE] Mongo ATENCIÓN: quedaron ${pendientes} sin actualizar`);
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
    const antes = JSON.stringify(raw.hunt ?? null);
    raw.hunt = withHuntDefaults(raw.hunt);
    if (JSON.stringify(raw.hunt) !== antes) {
      fs.writeFileSync(configPath, JSON.stringify(raw, null, 2), 'utf-8');
      escritos++;
    }
  }
  console.log(`[MIGRATE] JSON: ${ids} configs (${escritos} actualizadas, ${sinConfig} sin config.json) en ${dir}`);
}

async function main() {
  await databaseService.connect(process.env.MONGO_URI);
  await migrateMongo();
  await databaseService.disconnect();

  migrateJsonFiles();
}

main().catch((err) => {
  console.error('[MIGRATE] Error:', err);
  process.exit(1);
});
