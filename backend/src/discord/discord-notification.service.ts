import { Injectable } from '@nestjs/common';
import { EmbedBuilder, TextChannel } from 'discord.js';
import { createHash } from 'crypto';
import { DiscordBotService } from './discord-bot.service';
import { EventLogModel } from './schemas/event-log.schema';
import { DiscordChannelConfigModel } from './schemas/discord-channel-config.schema';
import { DiscordNotificationEvent } from './types';

const claimed = new Set<string>();

@Injectable()
export class DiscordNotificationService {
  constructor(private readonly bot: DiscordBotService) {}

  generateEventKey(type: string, timestamp: number): string {
    const raw = `${type}:${timestamp}`;
    return createHash('sha256').update(raw).digest('hex');
  }

  async processEvent(event: DiscordNotificationEvent): Promise<boolean> {
    const eventKey = this.generateEventKey(event.type, event.timestamp);

    if (claimed.has(eventKey)) return false;
    claimed.add(eventKey);

    try {
      await EventLogModel.create({
        eventKey,
        hex: '',
        timestamp: event.timestamp,
        type: event.type,
        missionIds: event.missionIds,
        sentAt: new Date(),
        channelIds: [],
      });
    } catch {
      claimed.delete(eventKey);
      return false;
    }

    const configs = await DiscordChannelConfigModel.find({ enabled: true }).lean();
    if (configs.length === 0) return false;

    const sentChannels: string[] = [];

    for (const config of configs) {
      const missionRoles = config.missionRoles || {};
      const roleId = event.missionIds
        .map(id => missionRoles[id])
        .find(id => id) || missionRoles['*'];
      if (!roleId) continue;

      try {
        const sent = await this.sendToChannel(config.channelId, roleId, event);
        if (sent) sentChannels.push(config.channelId);
      } catch (err) {
        console.error(`[Discord] Error enviando a canal ${config.channelId}:`, (err as Error).message);
      }
    }

    if (sentChannels.length > 0) {
      await EventLogModel.updateOne(
        { eventKey },
        { $set: { channelIds: sentChannels } }
      ).catch(() => {});
    }

    return sentChannels.length > 0;
  }

  private async sendToChannel(
    channelId: string,
    roleId: string,
    event: DiscordNotificationEvent,
  ): Promise<boolean> {
    if (!this.bot.isReady()) return false;

    const client = this.bot.getClient();
    if (!client) return false;

    const channel = await client.channels.fetch(channelId);
    if (!channel || !('send' in channel)) return false;

    const embed = new EmbedBuilder()
      .setTitle(event.title)
      .setDescription(event.description)
      .setColor(event.color || 0x5865F2)
      .setTimestamp(new Date(event.timestamp * 1000))
      .setFooter({ text: `Evento global • ${event.type}` });

    if (event.fields && event.fields.length > 0) {
      embed.addFields(event.fields);
    }

    await (channel as TextChannel).send({
      content: `<@&${roleId}>`,
      embeds: [embed],
    });

    return true;
  }
}
