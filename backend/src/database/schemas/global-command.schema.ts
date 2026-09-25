import { Schema, Document, model } from 'mongoose';

// ── Comando global predefinido ──
// kind 'packet'  → envía proto+hex crudo a todas las cuentas online.
// kind 'chests'  → abre todas las cajas de guerra (item 3073) en todas las cuentas online.
export interface IGlobalCommand extends Document {
  name: string;
  proto: number;
  /** Body en hex sin espacios (ej: '030100fb03'). Vacío en kind 'chests'. */
  hex: string;
  kind: string;
}

const GlobalCommandSchema = new Schema<IGlobalCommand>({
  name: { type: String, required: true, unique: true, index: true },
  proto: { type: Number, required: true },
  hex: { type: String, default: '00' },
  kind: { type: String, default: 'packet' },
}, { timestamps: true });

export const GlobalCommandModel = model<IGlobalCommand>('GlobalCommand', GlobalCommandSchema);
