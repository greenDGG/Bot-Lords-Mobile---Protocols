import { Schema, Document, model } from 'mongoose';

export interface IFCMToken extends Document {
  token: string;
  label: string;
  createdAt: Date;
}

const FCMTokenSchema = new Schema<IFCMToken>({
  token: { type: String, required: true, unique: true, index: true },
  label: { type: String, default: '' },
}, { timestamps: true });

export const FCMTokenModel = model<IFCMToken>('FCMToken', FCMTokenSchema);
