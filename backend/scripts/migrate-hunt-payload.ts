/**
 * Migración: payloadHex de hunt.levels → payloadHexMagia + payloadHexFisico.
 *
 * El hex viejo se copia a los dos campos (es el mismo lineup hasta que se capture
 * uno distinto por tipo de ataque) y `payloadHex` se elimina.
 *
 * Toca sólo Mongo → ConfigModel (lectura con loadAccountFromDB + guardado desde
 * la UI). Los `access/<iggId>/config.json` NO se leen al arrancar: `startAll()`
 * no tiene llamadores, así que quedan fuera.
 *
 * Uso: npx ts-node scripts/migrate-hunt-payload.ts [--dry]
 *   --dry → sólo informa qué cambiaría, no escribe
 */
import 'dotenv/config';
import { databaseService } from '../src/database/database.service';

const DRY = process.argv.includes('--dry');

type Level = { level: number; energyCost: number; payloadHexMagia?: string; payloadHexFisico?: string; payloadHex?: string };

function splitLevels(levels: any): { levels: any; changed: boolean } {
  if (!Array.isArray(levels)) return { levels, changed: false };
  let changed = false;
  const next = levels.map((lv: Level) => {
    if (!lv || typeof lv !== 'object') return lv;
    const legacy = typeof lv.payloadHex === 'string' ? lv.payloadHex : '';
    const magia = typeof lv.payloadHexMagia === 'string' ? lv.payloadHexMagia : legacy;
    const fisico = typeof lv.payloadHexFisico === 'string' ? lv.payloadHexFisico : legacy;
    if (lv.payloadHexMagia === magia && lv.payloadHexFisico === fisico && !('payloadHex' in lv)) return lv;
    changed = true;
    const { payloadHex: _drop, ...resto } = lv as Level & { payloadHex?: string };
    return { ...resto, payloadHexMagia: magia, payloadHexFisico: fisico };
  });
  return { levels: next, changed };
}

async function migrateMongo(): Promise<void> {
  const total = await databaseService.ConfigModel.countDocuments({});
  const conLegacy = await databaseService.ConfigModel.countDocuments({ 'hunt.levels.payloadHex': { $exists: true } });
  const sinNuevos = await databaseService.ConfigModel.countDocuments({ 'hunt.levels.payloadHexMagia': { $exists: false } });
  console.log(`[MIGRATE] Mongo: ${total} configs · ${conLegacy} con payloadHex legacy · ${sinNuevos} sin payloadHexMagia`);

  if (conLegacy + sinNuevos === 0) {
    console.log('[MIGRATE] Mongo OK: nada que migrar');
    return;
  }
  const docs = await databaseService.ConfigModel.find({}).lean();
  let modificadas = 0;
  for (const doc of docs) {
    const hunt = (doc as any).hunt;
    if (!hunt || !Array.isArray(hunt.levels)) continue;
    const { levels, changed } = splitLevels(hunt.levels);
    if (!changed) continue;
    if (DRY) { modificadas++; continue; }
    await databaseService.ConfigModel.updateOne({ _id: doc._id }, { $set: { 'hunt.levels': levels } });
    modificadas++;
  }
  console.log(`[MIGRATE] Mongo ${DRY ? '(dry) ' : ''}OK: ${modificadas} configs ${DRY ? 'a actualizar' : 'actualizadas'}`);
}

async function main() {
  await databaseService.connect(process.env.MONGO_URI);
  await migrateMongo();
  await databaseService.disconnect();
}

main().catch((err) => {
  console.error('[MIGRATE] Error:', err);
  process.exit(1);
});
