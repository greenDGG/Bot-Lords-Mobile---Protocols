import { Injectable, OnModuleInit } from '@nestjs/common';
import { Events, Interaction, ChatInputCommandInteraction, AutocompleteInteraction, SlashCommandBuilder, REST, Routes, ChannelType, PermissionFlagsBits } from 'discord.js';
import { DiscordBotService } from './discord-bot.service';
import { DiscordChannelConfigModel } from './schemas/discord-channel-config.schema';
import { EventLogModel } from './schemas/event-log.schema';
import { MISSION_NAMES, getMissionName } from '../bot/data/mission-names';

@Injectable()
export class DiscordCommandsService implements OnModuleInit {
  constructor(private readonly bot: DiscordBotService) {}

  async onModuleInit(): Promise<void> {
    await this.waitForReady();
    this.registerCommands();
    this.listenInteractions();
  }

  private async waitForReady(): Promise<void> {
    for (let i = 0; i < 30; i++) {
      if (this.bot.isReady()) return;
      await new Promise(r => setTimeout(r, 1000));
    }
    console.warn('[Discord] Timeout esperando bot listo, comandos no registrados');
  }

  private getMissionChoices(): { name: string; value: string }[] {
    const choices = Object.entries(MISSION_NAMES).map(([id, name]) => ({
      name: `${name} (${id})`,
      value: id,
    }));
    choices.unshift({ name: 'Todas', value: '*' });
    return choices;
  }

  private async registerCommands(): Promise<void> {
    const client = this.bot.getClient();
    if (!client) return;

    const appId = process.env.DISCORD_APP_ID;
    const guildId = process.env.DISCORD_GUILD_ID;
    if (!appId || !guildId) {
      console.warn('[Discord] DISCORD_APP_ID o DISCORD_GUILD_ID no configurados');
      return;
    }

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      console.error(`[Discord] El bot NO está en el guild ${guildId}`);
      const guilds = await client.guilds.fetch();
      console.log(`[Discord] Guilds donde está el bot: ${guilds.map(g => `${g.name} (${g.id})`).join(', ')}`);
      return;
    }
    console.log(`[Discord] Guild encontrado: ${guild.name} (${guild.id})`);

    const commands = [
      new SlashCommandBuilder()
        .setName('config')
        .setDescription('Configurar notificaciones de eventos en un canal')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt =>
          opt.setName('canal')
            .setDescription('Canal a configurar')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addBooleanOption(opt =>
          opt.setName('activar')
            .setDescription('Activar o desactivar notificaciones en este canal')
            .setRequired(false),
        ),
      new SlashCommandBuilder()
        .setName('rol')
        .setDescription('Gestionar roles por misión')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
          sub.setName('agregar')
            .setDescription('Agregar un rol para una misión')
            .addRoleOption(opt =>
              opt.setName('rol')
                .setDescription('Rol a mencionar')
                .setRequired(true),
            )
            .addStringOption(opt =>
              opt.setName('mision')
                .setDescription('Misión (autocompleta)')
                .setRequired(true)
                .setAutocomplete(true),
            )
            .addChannelOption(opt =>
              opt.setName('canal')
                .setDescription('Canal (opcional si solo hay 1 configurado)')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false),
            ),
        )
        .addSubcommand(sub =>
          sub.setName('quitar')
            .setDescription('Quitar un rol de una misión')
            .addStringOption(opt =>
              opt.setName('mision')
                .setDescription('Misión (autocompleta)')
                .setRequired(true)
                .setAutocomplete(true),
            )
            .addChannelOption(opt =>
              opt.setName('canal')
                .setDescription('Canal (opcional si solo hay 1 configurado)')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false),
            ),
        )
        .addSubcommand(sub =>
          sub.setName('ver')
            .setDescription('Ver roles configurados en un canal')
            .addChannelOption(opt =>
              opt.setName('canal')
                .setDescription('Canal (opcional si solo hay 1 configurado)')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false),
            ),
        ),
      new SlashCommandBuilder()
        .setName('status')
        .setDescription('Ver estado del bot de notificaciones'),
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN || '');

    try {
      const body = commands.map(c => c.toJSON());
      console.log(`[Discord] Registrando ${body.length} comandos en guild ${guildId}...`);

      const result = await rest.put(
        Routes.applicationGuildCommands(appId, guildId),
        { body },
      );

      const registered = result as any[];
      console.log(`[Discord] ${registered.length} comandos registrados:`);
      for (const cmd of registered) {
        console.log(`  - /${cmd.name} (id: ${cmd.id})`);
      }
    } catch (err) {
      console.error('[Discord] Error registrando comandos:', (err as Error).message);
      console.error('[Discord] Stack:', (err as Error).stack);
    }
  }

  private listenInteractions(): void {
    const client = this.bot.getClient();
    if (!client) return;

    client.on(Events.InteractionCreate, async (interaction: Interaction) => {
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'config') {
          await this.handleConfig(interaction);
        } else if (interaction.commandName === 'rol') {
          await this.handleRol(interaction);
        } else if (interaction.commandName === 'status') {
          await this.handleStatus(interaction);
        }
      } else if (interaction.isAutocomplete()) {
        if (interaction.commandName === 'rol') {
          await this.handleAutocomplete(interaction);
        }
      }
    });
  }

  private async handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focused = interaction.options.getFocused();
    const choices = this.getMissionChoices();
    const filtered = choices.filter(c =>
      c.name.toLowerCase().includes(focused.toLowerCase())
    );
    await interaction.respond(filtered.slice(0, 25));
  }

  private async handleConfig(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: 'Solo administradores pueden usar este comando.', ephemeral: true });
      return;
    }

    const guildId = interaction.guildId!;
    const canal = interaction.options.getChannel('canal', true);
    const activar = interaction.options.getBoolean('activar');

    const channelId = canal.id;

    let config = await DiscordChannelConfigModel.findOne({ guildId, channelId });

    if (!config) {
      config = new DiscordChannelConfigModel({
        guildId,
        channelId,
        missionRoles: {},
        enabled: activar ?? true,
      });
    } else if (activar !== null) {
      config.enabled = activar;
    }

    await config.save();

    const nombreCanal = canal.name || channelId;

    const missionEntries = Object.entries(config.missionRoles || {});
    const missionList = missionEntries.length > 0
      ? missionEntries.map(([id, roleId]) => {
          const label = id === '*' ? 'Todas' : `${getMissionName(parseInt(id, 16))} (${id})`;
          return `${label} → <@&${roleId}>`;
        }).join('\n')
      : 'Ninguna';

    const embed = {
      title: 'Configuración actualizada',
      fields: [
        { name: 'Canal', value: `#${nombreCanal}`, inline: true },
        { name: 'Estado', value: config.enabled ? 'Activado' : 'Desactivado', inline: true },
        { name: 'Misiones configuradas', value: missionList, inline: false },
      ],
      color: 0x57F287,
    };

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  private async handleRol(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: 'Solo administradores pueden usar este comando.', ephemeral: true });
      return;
    }

    const guildId = interaction.guildId!;
    const sub = interaction.options.getSubcommand();
    const canalOption = interaction.options.getChannel('canal');

    let channelId: string;

    if (canalOption) {
      channelId = canalOption.id;
    } else {
      const configs = await DiscordChannelConfigModel.find({ guildId, enabled: true }).lean();
      if (configs.length === 0) {
        await interaction.reply({ content: 'No hay canales configurados. Usa `/config` primero.', ephemeral: true });
        return;
      }
      if (configs.length === 1) {
        channelId = configs[0].channelId;
      } else {
        const lista = configs.map(c => `<#${c.channelId}>`).join(', ');
        await interaction.reply({ content: `Hay ${configs.length} canales configurados: ${lista}\nEspecifica cuál con la opción \`canal\`.`, ephemeral: true });
        return;
      }
    }

    let config = await DiscordChannelConfigModel.findOne({ guildId, channelId });

    if (sub === 'agregar') {
      const rol = interaction.options.getRole('rol', true);
      const mision = interaction.options.getString('mision', true);

      if (!config) {
        config = new DiscordChannelConfigModel({
          guildId,
          channelId,
          missionRoles: {},
          enabled: true,
        });
      }

      if (!config.missionRoles) config.missionRoles = {};
      config.missionRoles[mision] = rol.id;
      await config.save();

      const label = mision === '*' ? 'Todas' : `${getMissionName(parseInt(mision, 16))} (${mision})`;
      await interaction.reply({
        content: `✅ ${label} → <@&${rol.id}> en <#${channelId}>`,
        ephemeral: true,
      });

    } else if (sub === 'quitar') {
      const mision = interaction.options.getString('mision', true);

      if (!config || !config.missionRoles?.[mision]) {
        await interaction.reply({ content: 'Esa misión no tiene rol configurado.', ephemeral: true });
        return;
      }

      delete config.missionRoles[mision];
      await config.save();

      const label = mision === '*' ? 'Todas' : `${getMissionName(parseInt(mision, 16))} (${mision})`;
      await interaction.reply({
        content: `🗑️ ${label} eliminada de <#${channelId}>`,
        ephemeral: true,
      });

    } else if (sub === 'ver') {
      if (!config) {
        await interaction.reply({ content: 'No hay configuración para este canal.', ephemeral: true });
        return;
      }

      const entries = Object.entries(config.missionRoles || {});
      const list = entries.length > 0
        ? entries.map(([id, roleId]) => {
            const label = id === '*' ? 'Todas' : `${getMissionName(parseInt(id, 16))} (${id})`;
            return `${label} → <@&${roleId}>`;
          }).join('\n')
        : 'Ninguna';

      const embed = {
        title: `Roles en <#${channelId}>`,
        description: list,
        color: 0x5865F2,
      };

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  private async handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId!;
    const botReady = this.bot.isReady();
    const eventCount = await EventLogModel.countDocuments();
    const channelCount = await DiscordChannelConfigModel.countDocuments({ guildId, enabled: true });

    const configs = await DiscordChannelConfigModel.find({ guildId, enabled: true }).lean();
    const canalList = configs.length > 0
      ? configs.map(c => {
          const missions = Object.entries(c.missionRoles || {})
            .map(([id, roleId]) => `${id === '*' ? 'Todas' : getMissionName(parseInt(id, 16))} → <@&${roleId}>`)
            .join(', ');
          return `<#${c.channelId}>: ${missions || 'sin misiones'}`;
        }).join('\n')
      : 'Ninguno';

    const embed = {
      title: 'Estado del Bot',
      fields: [
        { name: 'Bot', value: botReady ? 'Online' : 'Offline', inline: true },
        { name: 'Eventos enviados', value: eventCount.toString(), inline: true },
        { name: 'Canales activos', value: channelCount.toString(), inline: true },
        { name: 'Canales configurados', value: canalList, inline: false },
      ],
      color: botReady ? 0x57F287 : 0xED4245,
    };

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}
