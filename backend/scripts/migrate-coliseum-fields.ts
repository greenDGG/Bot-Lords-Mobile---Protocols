/**
 * Migración: agrega el campo coliseum con defaults a configs que no lo tienen.
 * Uso: npx ts-node scripts/migrate-coliseum-fields.ts
 */
import 'dotenv/config';
import { databaseService } from '../src/database/database.service';

const DEFAULT_COLISEUM = { reclaimGems: false, autoAttack: false, hero0: 1, hero1: 3, hero2: 6, hero3: 5, hero4: 23 };

async function main() {
  await databaseService.connect(process.env.MONGO_URI);

  const total = await databaseService.ConfigModel.countDocuments({});
  const sinColiseum = await databaseService.ConfigModel.countDocuments({ coliseum: { $exists: false } });
  console.log(`[MIGRATE] ${total} configs encontradas, ${sinColiseum} sin campo coliseum`);

  const res = await databaseService.ConfigModel.updateMany(
    { coliseum: { $exists: false } },
    { $set: { coliseum: DEFAULT_COLISEUM } }
  );
  console.log(`[MIGRATE] match=${res.matchedCount}, modificadas=${res.modifiedCount}`);

  const pendientes = await databaseService.ConfigModel.countDocuments({ coliseum: { $exists: false } });
  console.log(pendientes === 0
    ? '[MIGRATE] OK: todas las cuentas tienen coliseum'
    : `[MIGRATE] ATENCIÓN: quedaron ${pendientes} sin actualizar`);

  await databaseService.disconnect();
}

main().catch((err) => {
  console.error('[MIGRATE] Error:', err);
  process.exit(1);
});
