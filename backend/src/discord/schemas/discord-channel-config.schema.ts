import { Schema, Document, model } from 'mongoose';

export interface IDiscordChannelConfig extends Document {
  guildId: string;
  channelId: string;
  missionRoles: Record<string, string>;
  enabled: boolean;
}

const DiscordChannelConfigSchema = new Schema<IDiscordChannelConfig>({
  guildId: { type: String, required: true, index: true },
  channelId: { type: String, required: true, unique: true, index: true },
  missionRoles: { type: Schema.Types.Mixed, default: {} },
  enabled: { type: Boolean, default: true },
}, { timestamps: true });

export const DiscordChannelConfigModel = model<IDiscordChannelConfig>(
  'DiscordChannelConfig',
  DiscordChannelConfigSchema,
);
