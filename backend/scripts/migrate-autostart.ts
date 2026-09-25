/**
 * Migración: pone autoStart = true en la config de todas las cuentas.
 * Uso: npx ts-node scripts/migrate-autostart.ts
 */
import 'dotenv/config';
import { databaseService } from '../src/database/database.service';

async function main() {
  await databaseService.connect(process.env.MONGO_URI);

  const total = await databaseService.ConfigModel.countDocuments({});
  const conFalse = await databaseService.ConfigModel.countDocuments({ autoStart: { $ne: true } });
  console.log(`[MIGRATE] ${total} configs encontradas, ${conFalse} sin autoStart=true`);

  const res = await databaseService.ConfigModel.updateMany(
    { autoStart: { $ne: true } },
    { $set: { autoStart: true } }
  );
  console.log(`[MIGRATE] match=${res.matchedCount}, modificadas=${res.modifiedCount}`);

  const pendientes = await databaseService.ConfigModel.countDocuments({ autoStart: { $ne: true } });
  console.log(pendientes === 0
    ? '[MIGRATE] OK: todas las cuentas tienen autoStart=true'
    : `[MIGRATE] ATENCIÓN: quedaron ${pendientes} sin actualizar`);

  await databaseService.disconnect();
}

main().catch((err) => {
  console.error('[MIGRATE] Error:', err);
  process.exit(1);
});
