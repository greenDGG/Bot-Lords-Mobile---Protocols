import { Schema, Document, model } from 'mongoose';

export interface IEventLog extends Document {
  eventKey: string;
  hex: string;
  timestamp: number;
  type: string;
  missionIds: string[];
  sentAt: Date;
  channelIds: string[];
}

const EventLogSchema = new Schema<IEventLog>({
  eventKey: { type: String, required: true, unique: true, index: true },
  hex: { type: String, default: '' },
  timestamp: { type: Number, required: true },
  type: { type: String, required: true },
  missionIds: [{ type: String }],
  sentAt: { type: Date, default: Date.now },
  channelIds: [{ type: String }],
}, { timestamps: false, expires: 604800 });

export const EventLogModel = model<IEventLog>('DiscordEventLog', EventLogSchema);
