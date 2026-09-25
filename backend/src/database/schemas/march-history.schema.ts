import { Schema, Document, model } from 'mongoose';

export interface IMarchHistory extends Document {
  iggId: number;
  marchId: number;
  marchType: number;
  arrivedAt: number;
  arrivalTimestamp: number;
  heroes: { heroId: number; rank: number; grade: number }[];
  troops: { type: number; tier: number; count: number }[];
  t5Troops: { type: number; tier: number; count: number }[];
  leaderFlag: number;
}

const MarchHeroEntrySchema = new Schema(
  { heroId: Number, rank: Number, grade: Number },
  { _id: false }
);

const MarchTroopEntrySchema = new Schema(
  { type: Number, tier: Number, count: Number },
  { _id: false }
);

const MarchHistorySchema = new Schema<IMarchHistory>({
  iggId: { type: Number, required: true, index: true },
  marchId: { type: Number, required: true },
  marchType: { type: Number, default: 0 },
  arrivedAt: { type: Number, required: true },
  arrivalTimestamp: { type: Number, default: 0 },
  heroes: { type: [MarchHeroEntrySchema], default: [] },
  troops: { type: [MarchTroopEntrySchema], default: [] },
  t5Troops: { type: [MarchTroopEntrySchema], default: [] },
  leaderFlag: { type: Number, default: 5 },
}, { timestamps: true });

export const MarchHistoryModel = model<IMarchHistory>('MarchHistory', MarchHistorySchema);
