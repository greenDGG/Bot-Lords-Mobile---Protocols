/**
 * Migración: agrega la sección de cartas a las configs existentes.
 *
 * luckyCards = { enable: true, intervalSec: 30, maxPerCycle: 3 }
 *
 * Mongo → ConfigModel (donde el bot lee la config con loadAccountFromDB y
 * donde guarda la UI con flattenConfig). Sin este paso, los docs viejos no
 * tienen la sección (aunque el código la rellena en memoria con defaults).
 *
 * Los access/<iggId>/config.json NO se migran: no se leen al arrancar
 * (startAll()/loadAccounts() no tienen llamadores).
 *
 * Uso: npx ts-node scripts/migrate-lucky-cards.ts [--dry]
 *   --dry → sólo informa qué cambiaría, no escribe
 */
import 'dotenv/config';
import { databaseService } from '../src/database/database.service';
import { defaultBotConfig } from '../src/models/bot-config';

const DRY = process.argv.includes('--dry');
const DEFAULTS = defaultBotConfig('').luckyCards;
const KEYS = ['enable', 'intervalSec', 'maxPerCycle'] as const;

async function main(): Promise<void> {
  await databaseService.connect(process.env.MONGO_URI);

  const total = await databaseService.ConfigModel.countDocuments({});
  const sinSeccion = await databaseService.ConfigModel.countDocuments({ luckyCards: { $exists: false } });
  console.log(`[MIGRATE] Mongo: ${total} configs · ${sinSeccion} sin luckyCards`);

  if (sinSeccion > 0) {
    if (DRY) {
      console.log(`[MIGRATE] Mongo (dry) OK: ${sinSeccion} configs recibirían ${JSON.stringify(DEFAULTS)}`);
    } else {
      const res = await databaseService.ConfigModel.updateMany(
        { luckyCards: { $exists: false } },
        { $set: { luckyCards: DEFAULTS } },
      );
      console.log(`[MIGRATE] Mongo luckyCards → match=${res.matchedCount}, modificadas=${res.modifiedCount}`);
    }
  }

  // Docs con la sección a medias (creados por una versión intermedia)
  for (const key of KEYS) {
    const query = { [`luckyCards.${key}`]: { $exists: false } };
    const pendientes = await databaseService.ConfigModel.countDocuments(query);
    if (pendientes === 0) continue;
    if (DRY) {
      console.log(`[MIGRATE] Mongo (dry): ${pendientes} sin luckyCards.${key} → ${JSON.stringify(DEFAULTS[key])}`);
      continue;
    }
    const res = await databaseService.ConfigModel.updateMany(query, {
      $set: { [`luckyCards.${key}`]: DEFAULTS[key] },
    });
    console.log(`[MIGRATE] Mongo luckyCards.${key} → match=${res.matchedCount}, modificadas=${res.modifiedCount}`);
  }

  const quedan = await databaseService.ConfigModel.countDocuments({
    'luckyCards.enable': { $exists: false },
  });
  console.log(quedan === 0
    ? `[MIGRATE] Mongo OK: todas las cuentas tienen luckyCards (${JSON.stringify(DEFAULTS)})`
    : `[MIGRATE] Mongo ATENCIÓN: quedaron ${quedan} sin luckyCards.enable`);

  await databaseService.disconnect();
}

main().catch((err) => {
  console.error('[MIGRATE] Error:', err);
  process.exit(1);
});
