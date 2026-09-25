import { Schema, Document, model } from 'mongoose';

export interface IDiscordUser extends Document {
  discordUserId: string;
  channels: string[];
  eventTypes: string[];
  dmEnabled: boolean;
  enabled: boolean;
}

const DiscordUserSchema = new Schema<IDiscordUser>({
  discordUserId: { type: String, required: true, unique: true, index: true },
  channels: [{ type: String }],
  eventTypes: [{ type: String }],
  dmEnabled: { type: Boolean, default: false },
  enabled: { type: Boolean, default: true },
}, { timestamps: true });

export const DiscordUserModel = model<IDiscordUser>('DiscordUser', DiscordUserSchema);
