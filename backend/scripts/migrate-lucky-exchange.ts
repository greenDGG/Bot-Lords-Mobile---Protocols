/**
 * Migración: lleva a la DB el estado de canje de la Carta de la Suerte de las
 * cuentas que ya lo tenían en `config.luckyCards.exchangedTs`.
 *
 * Ese campo SÓLO se escribía en `access/<iggId>/config.json`, que la carga
 * desde la DB (loadAccountFromDB) ni lee: esas cuentas podían volver a canjear
 * en el mismo evento. Desde el fix, el estado vive en la colección
 * `LuckyExchangeClaim` (una fila por cuenta y por evento) y se lee con cada 9861.
 *
 * Fuentes que revisa:
 *   1. `access/<iggId>/config.json` → luckyCards.exchangedTs
 *   2. Mongo `Config.luckyCards.exchangedTs` (por si la UI lo guardó)
 *
 * Clave de la fila: eventKey = `${exchangedTs}_${duration}` con
 * `duration` = duración del evento en segundos que trae el 9861
 * (172740 para el evento 2026-09-27/29; ver docs/protocols/9861.md).
 *
 * Uso: npx ts-node scripts/migrate-lucky-exchange.ts [--dry] [--duration 172740]
 *   --dry       → sólo informa qué escribiría
 *   --duration  → duración del evento en segundos (default 172740)
 */
import 'dotenv/config';
import { databaseService } from '../src/database/database.service';
import { configService } from '../src/config/config.service';

const DRY = process.argv.includes('--dry');
const durIdx = process.argv.indexOf('--duration');
const DURATION = durIdx >= 0 && process.argv[durIdx + 1] ? Number(process.argv[durIdx + 1]) : 172740;

interface Cand {
  iggId: number;
  exchangedTs: number;
  origen: string;
}

async function main(): Promise<void> {
  if (!Number.isFinite(DURATION) || DURATION <= 0) {
    console.error('[MIGRATE] --duration inválido');
    process.exit(1);
  }
  await databaseService.connect(process.env.MONGO_URI);

  const cands = new Map<string, Cand>();

  // 1) JSON de cada cuenta (la fuente original del campo)
  let escaneadas = 0;
  for (const acc of configService.listAccounts()) {
    if (!acc.token && !acc.config) continue;
    escaneadas++;
    const ts = Number(acc.config?.luckyCards?.exchangedTs ?? 0);
    if (ts > 0) cands.set(String(acc.iggId), { iggId: Number(acc.iggId), exchangedTs: ts, origen: 'config.json' });
  }

  // 2) Mongo (por si la UI guardó ese campo en la config)
  const enDb = await databaseService.ConfigModel.find({ 'luckyCards.exchangedTs': { $gt: 0 } }).lean();
  for (const doc of enDb as any[]) {
    const ts = Number(doc?.luckyCards?.exchangedTs ?? 0);
    const key = String(doc.iggId);
    if (ts > 0 && !cands.has(key)) {
      cands.set(key, { iggId: Number(doc.iggId), exchangedTs: ts, origen: 'Mongo Config' });
    }
  }

  console.log(
    `[MIGRATE] cuentas escaneadas=${escaneadas} · configs Mongo con exchangedTs>0=${enDb.length} · candidatas=${cands.size} · duration=${DURATION}`,
  );

  let escritas = 0;
  for (const c of cands.values()) {
    const eventKey = `${c.exchangedTs}_${DURATION}`;
    const payload = {
      iggId: c.iggId,
      eventKey,
      eventStartTs: c.exchangedTs,
      eventDuration: DURATION,
      eventEndTs: c.exchangedTs + DURATION,
      reclaimed: true,
      status: -3,
      value: 0,
      gemsTotal: 0,
      at: Math.floor(Date.now() / 1000),
    };
    console.log(
      `  ${DRY ? '(dry) ' : ''}iggId=${c.iggId} exchangedTs=${c.exchangedTs} (${c.origen}) → eventKey=${eventKey} fin=${new Date(payload.eventEndTs * 1000).toISOString()}`,
    );
    if (DRY) continue;
    await databaseService.LuckyExchangeClaimModel.updateOne(
      { iggId: c.iggId, eventKey },
      { $set: payload },
      { upsert: true },
    );
    escritas++;
  }

  const filas = await databaseService.LuckyExchangeClaimModel.countDocuments({});
  console.log(
    DRY
      ? `[MIGRATE] dry: ${cands.size} fila(s) se escribirían (quedan ${filas} en la DB)`
      : `[MIGRATE] OK: ${escritas} fila(s) escritas · total en la colección = ${filas}`,
  );

  await databaseService.disconnect();
}

main().catch((err) => {
  console.error('[MIGRATE] Error:', err);
  process.exit(1);
});
