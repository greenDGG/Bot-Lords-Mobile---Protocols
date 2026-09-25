/**
 * Seed de eventos globales (backend/scripts/seed-events.ts)
 * Upsert: si el evento ya existe por eventId, se actualiza; si no, se crea.
 * Uso: npx ts-node scripts/seed-events.ts
 */
import { databaseService } from '../src/database/database.service';

const SEED_EVENTS = [
  { eventId: 'encargos-helados', name: 'Encargos helados', action: 'encargos-helados', claimProto: 11632, claimPayload: '0101', cooldownSeconds: 6 * 3600, startAt: 0, endAt: 0 },
  { eventId: 'linternas', name: 'Expedición encantada (linternas)', action: 'linternas', claimProto: 11157, claimPayload: '7000b609e5050f00000100', cooldownSeconds: 6 * 3600, startAt: 0, endAt: 0 },
  { eventId: 'monedas-castillo', name: 'Castillo emergente (monedas)', action: 'monedas-castillo', claimProto: 11157, claimPayload: '7500280a2f033200000100', cooldownSeconds: 6 * 3600, startAt: 0, endAt: 0 },
  { eventId: 'arena-caos', name: 'Arena del caos', action: 'arena-caos', claimProto: 11692, claimPayload: '0101', cooldownSeconds: 6 * 3600, startAt: 0, endAt: 0 },
  { eventId: 'evento-solitario', name: 'Evento solitario', action: 'evento-solitario', claimProto: 3609, claimPayload: '0006', cooldownSeconds: 6 * 3600, startAt: 0, endAt: 0 },
  { eventId: 'evento-infierno', name: 'Evento infierno', action: 'evento-infierno', claimProto: 3609, claimPayload: '0106', cooldownSeconds: 6 * 3600, startAt: 0, endAt: 0 },
  { eventId: 'desafio', name: 'Evento Desafío', action: 'desafio', claimProto: 3619, claimPayload: '040006', cooldownSeconds: 6 * 3600, startAt: 0, endAt: 0 },
  { eventId: 'magmante', name: 'Desafío Magmante', action: 'magmante', claimProto: 7030, claimPayload: '01', cooldownSeconds: 6 * 3600, startAt: 0, endAt: 0 },
  { eventId: 'laberinto', name: 'Laberinto 26', action: 'laberinto', claimProto: 7001, claimPayload: '', cooldownSeconds: 6 * 3600, startAt: 0, endAt: 0 },
  { eventId: 'estrellas-sagradas', name: 'Estrellas sagradas', action: 'estrellas-sagradas', claimProto: 7003, claimPayload: '01', cooldownSeconds: 6 * 3600, startAt: 0, endAt: 0 },
  { eventId: 'arena-dragon', name: 'Arena del dragón', action: 'arena-dragon', claimProto: 9308, claimPayload: '01', cooldownSeconds: 6 * 3600, startAt: 0, endAt: 0 },
  { eventId: 'caja-misteriosa', name: 'Caja misteriosa', action: 'caja-misteriosa', claimProto: 1117, claimPayload: '', cooldownSeconds: 6 * 3600, startAt: 0, endAt: 0 },
  { eventId: 'bono-acceso', name: 'Bono de acceso diario', action: 'bono-acceso', claimProto: 3655, claimPayload: '00', cooldownSeconds: 24 * 3600, startAt: 0, endAt: 0 },
];

async function main() {
  await databaseService.connect(process.env.MONGO_URI);
  for (const evt of SEED_EVENTS) {
    await databaseService.EventModel.updateOne(
      { eventId: evt.eventId },
      { $set: { ...evt, active: true } },
      { upsert: true }
    );
  }
  const total = await databaseService.EventModel.countDocuments({ active: true });
  console.log(`[SEED] ${SEED_EVENTS.length} eventos sembrados, ${total} activos en DB`);
  await databaseService.disconnect();
}

main().catch((err) => {
  console.error('[SEED] Error:', err);
  process.exit(1);
});
