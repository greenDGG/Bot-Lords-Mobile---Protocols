/**
 * Migración: Discord notifications per-canal + dedup fix
 * - Limpia EventLog viejo (keys basadas en hex, ya no aplican)
 * - Elimina DiscordUser (reemplazado por DiscordChannelConfig)
 * Uso: npx ts-node scripts/migrate-discord-channels.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { databaseService } from '../src/database/database.service';

async function main() {
  await databaseService.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db!;

  console.log('[MIGRATE] === Discord: per-canal + dedup fix ===');

  const collections = await db.listCollections().toArray();
  const names = collections.map((c: any) => c.name);

  if (names.includes('DiscordEventLog')) {
    const count = await db.collection('DiscordEventLog').countDocuments();
    console.log(`[MIGRATE] EventLog: ${count} entradas viejas (keys con hex)`);
    await db.collection('DiscordEventLog').drop();
    console.log('[MIGRATE] EventLog dropeado — se recreará automáticamente');
  } else {
    console.log('[MIGRATE] EventLog: no existe, nada que limpiar');
  }

  if (names.includes('discordusers')) {
    const count = await db.collection('discordusers').countDocuments();
    console.log(`[MIGRATE] DiscordUser: ${count} entradas (ya no se usa)`);
    await db.collection('discordusers').drop();
    console.log('[MIGRATE] DiscordUser dropeado');
  } else {
    console.log('[MIGRATE] DiscordUser: no existe, nada que limpiar');
  }

  console.log('[MIGRATE] OK — Reinicia el bot y usa /config en Discord para configurar un canal');

  await databaseService.disconnect();
}

main().catch((err) => {
  console.error('[MIGRATE] Error:', err);
  process.exit(1);
});
