import { Schema, Document, model } from 'mongoose';

export interface IPlanSequenceCommand {
  proto: number;
  hex: string;
  label?: string;
}

export interface IPlanSequence extends Document {
  name: string;
  commands: IPlanSequenceCommand[];
  delayMs: number;
}

const PlanSequenceCommandSchema = new Schema<IPlanSequenceCommand>({
  proto: { type: Number, required: true },
  hex: { type: String, default: '' },
  label: { type: String, default: '' },
}, { _id: false });

const PlanSequenceSchema = new Schema<IPlanSequence>({
  name: { type: String, required: true, unique: true, index: true },
  commands: { type: [PlanSequenceCommandSchema], default: [] },
  delayMs: { type: Number, default: 500 },
}, { timestamps: true });

export const PlanSequenceModel = model<IPlanSequence>('PlanSequence', PlanSequenceSchema);
