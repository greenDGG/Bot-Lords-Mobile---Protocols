/**
 * Migracion: agregar costumeWar y costumeNormal a configs existentes
 *
 * Uso: npx ts-node scripts/migrate-costumes.ts
 * Requiere MONGO_URI en env o .env
 */
import mongoose from 'mongoose';
import * as dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);

const MONGO_URI = process.env.MONGO_URI || '';

async function run() {
  if (!MONGO_URI) {
    console.error('Error: MONGO_URI no definido. Ejecuta con: MONGO_URI=... npx ts-node scripts/migrate-costumes.ts');
    process.exit(1);
  }

  console.log('Conectando a MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Conectado.');

  const db = mongoose.connection.db!;
  const collection = db.collection('configs');

  const total = await collection.countDocuments({});
  console.log(`Configs totales: ${total}`);

  // Agregar campos solo si no existen
  const result = await collection.updateMany(
    { costumeWar: { $exists: false } },
    { $set: { costumeWar: 1, costumeNormal: 0 } }
  );

  console.log(`Migrados: ${result.modifiedCount} configs (costumeWar=1, costumeNormal=0)`);

  const result2 = await collection.updateMany(
    { costumeNormal: { $exists: false } },
    { $set: { costumeNormal: 0 } }
  );

  if (result2.modifiedCount > 0) {
    console.log(`CostumeNormal adicional migrado: ${result2.modifiedCount}`);
  }

  // Verificar
  const withoutWar = await collection.countDocuments({ costumeWar: { $exists: false } });
  const withoutNormal = await collection.countDocuments({ costumeNormal: { $exists: false } });
  console.log(`Sin costumeWar: ${withoutWar}, sin costumeNormal: ${withoutNormal}`);

  if (withoutWar === 0 && withoutNormal === 0) {
    console.log('Migracion completada exitosamente.');
  } else {
    console.log('Advertencia: algunos documentos no se migraron.');
  }

  await mongoose.disconnect();
  console.log('Desconectado.');
}

run().catch(err => {
  console.error('Error durante migracion:', err);
  process.exit(1);
});
