import { databaseService } from '../src/database/database.service';
import { DiscordChannelConfigModel } from '../src/discord/schemas/discord-channel-config.schema';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function fix() {
  await databaseService.connect(process.env.MONGO_URI);

  const r = await DiscordChannelConfigModel.updateOne(
    { channelId: '909948184632131686' },
    { $set: { guildId: '869247713248706690' } }
  );
  console.log(`Corregido: ${r.modifiedCount} documento actualizado`);

  const doc = await DiscordChannelConfigModel.findOne({ channelId: '909948184632131686' }).lean();
  console.log('Verificación:', JSON.stringify(doc, null, 2));

  await databaseService.disconnect();
}

fix().catch(console.error);
