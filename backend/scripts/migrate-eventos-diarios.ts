/**
 * Migración: las acciones del laberinto pasan de 6 h a 1 vez por día:
 *   - `laberinto` (7001, abrir) — cooldownSeconds 21600 → 86400
 *   - `estrellas-sagradas` (7003, golpe) — idem
 *
 * La tiro gratis de la bendición divina se otorga 1 vez por día, al reinicio
 * diario del servidor — no cada 6 horas (ver `docs/protocols/7004.md`
 * § Tiradas gratis). Con 6 h el bot pagaba 3 de cada 4 golpes con estrellas.
 *
 * Actualiza `cooldownSeconds` de esos eventos en la colección `Event` (el
 * seed de main.ts sólo corre con la colección vacía, así que la DB existente
 * queda con el valor viejo). Idempotente: sólo escribe si el valor no es 24 h.
 * Los claims por cuenta (EventClaimModel.nextClaimAt) no se tocan: el primer
 * golpe post-migración cae cuando expire el claim actual y de ahí en más
 * queda 1×/día, siempre con una tiro gratis pendiente del último reinicio.
 *
 * Uso: npx ts-node scripts/migrate-eventos-diarios.ts [--dry]
 */
import 'dotenv/config';
import { databaseService } from '../src/database/database.service';

const DAILY = 24 * 3600;
const EVENT_IDS = ['laberinto', 'estrellas-sagradas'];
const DRY = process.argv.includes('--dry');

async function main(): Promise<void> {
  await databaseService.connect(process.env.MONGO_URI);

  const docs = await databaseService.EventModel.find({ eventId: { $in: EVENT_IDS } }).lean();
  const porId = new Map(docs.map((d: any) => [d.eventId, d]));

  let cambios = 0;
  for (const eventId of EVENT_IDS) {
    const doc = porId.get(eventId) as any;
    if (!doc) {
      console.log(`[MIGRATE] evento "${eventId}" no existe — se sembrará en el próximo arranque con 24h`);
      continue;
    }
    if (doc.cooldownSeconds === DAILY) {
      console.log(`[MIGRATE] ${eventId}: ya está en 24h — nada que hacer`);
      continue;
    }
    console.log(`[MIGRATE] ${eventId}: cooldownSeconds ${doc.cooldownSeconds} → ${DAILY}`);
    cambios++;
    if (DRY) continue;
    const res = await databaseService.EventModel.updateOne({ eventId }, { $set: { cooldownSeconds: DAILY } });
    console.log(`[MIGRATE] ${eventId}: modified=${res.modifiedCount}`);
  }

  if (cambios === 0) console.log('[MIGRATE] nada por hacer');
  else if (DRY) console.log(`[MIGRATE] dry: ${cambios} evento(s) se actualizarían a 24h`);
  else console.log(`[MIGRATE] OK: ${cambios} evento(s) actualizado(s) a 24h`);
  await databaseService.disconnect();
}

main().catch((err) => {
  console.error('[MIGRATE] Error:', err);
  process.exit(1);
});
