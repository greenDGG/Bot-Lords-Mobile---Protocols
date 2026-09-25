import { databaseService } from '../src/database/database.service';
import { DiscordChannelConfigModel } from '../src/discord/schemas/discord-channel-config.schema';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function migrate() {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) {
    console.error('DISCORD_GUILD_ID no definido en .env');
    return;
  }

  await databaseService.connect(process.env.MONGO_URI);
  console.log('Conectado a MongoDB');

  const count = await DiscordChannelConfigModel.countDocuments();
  console.log(`Encontradas ${count} configuraciones`);

  if (count === 0) {
    console.log('No hay configuraciones para migrar');
    await databaseService.disconnect();
    return;
  }

  const configs = await DiscordChannelConfigModel.find({}).lean();
  console.log(`Migrando ${configs.length} configuraciones...`);

  await DiscordChannelConfigModel.deleteMany({});

  for (const old of configs as any) {
    const missionRoles: Record<string, string> = {};

    if (old.roleId) {
      missionRoles['*'] = old.roleId;
    } else if (old.missionRoles) {
      Object.assign(missionRoles, old.missionRoles);
    }

    await DiscordChannelConfigModel.create({
      guildId,
      channelId: old.channelId,
      missionRoles,
      enabled: old.enabled ?? true,
    });
    console.log(`Migrado canal ${old.channelId} → guild ${guildId}`);
  }

  console.log('Migración completada');
  await databaseService.disconnect();
}

migrate().catch(console.error);
