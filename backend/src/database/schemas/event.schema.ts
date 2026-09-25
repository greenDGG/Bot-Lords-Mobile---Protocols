import { Schema, Document, model } from 'mongoose';

// ── Evento global (definición) ──
export interface IEventDef extends Document {
  eventId: string;
  name: string;
  /** Nombre de la acción registrada que el evento ejecuta (registro en event-actions.ts o BotAction por nombre) */
  action: string;
  /** Proto a enviar para abrir/reclamar el evento (fallback si action está vacío) */
  claimProto: number;
  /** Payload en hex (sin seq) para el claim */
  claimPayload: string;
  /** Cooldown en segundos entre ejecuciones de la acción */
  cooldownSeconds: number;
  /** Inicio de la ventana del evento (unix segundos). 0 = sin restricción */
  startAt: number;
  /** Fin de la ventana del evento (unix segundos). 0 = sin restricción */
  endAt: number;
  active: boolean;
}

const EventSchema = new Schema<IEventDef>({
  eventId: { type: String, required: true, unique: true, index: true },
  name: { type: String, default: '' },
  action: { type: String, default: '' },
  claimProto: { type: Number, default: 0 },
  claimPayload: { type: String, default: '00' },
  cooldownSeconds: { type: Number, default: 3600 },
  startAt: { type: Number, default: 0 },
  endAt: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
}, { timestamps: true });

export const EventModel = model<IEventDef>('Event', EventSchema);

// ── Estado de reclamo por cuenta ──
export interface IEventClaim extends Document {
  iggId: number;
  eventId: string;
  /** Unix segundos a partir del cual se puede reclamar de nuevo */
  nextClaimAt: number;
  /** true si el servidor avisó que el evento está disponible */
  available: boolean;
}

const EventClaimSchema = new Schema<IEventClaim>({
  iggId: { type: Number, required: true, index: true },
  eventId: { type: String, required: true },
  nextClaimAt: { type: Number, default: 0 },
  available: { type: Boolean, default: true },
}, { timestamps: true });

EventClaimSchema.index({ iggId: 1, eventId: 1 }, { unique: true });

export const EventClaimModel = model<IEventClaim>('EventClaim', EventClaimSchema);

// ── Event reward data (proto 3610) ──
export interface IEventRewardData extends Document {
  eventType: number;
  hourTimestamp: number;
  missionIds: number[];
  levels: { gemsEntrega: number; valorGemas: number; sinValorar: number }[];
  counts: number[];
  records: { itemId: number; amount: number }[];
  rawHex: string;
  receivedAt: Date;
}

const EventRewardDataSchema = new Schema<IEventRewardData>({
  eventType: { type: Number, required: true },
  hourTimestamp: { type: Number, required: true },
  missionIds: [{ type: Number }],
  levels: [{ gemsEntrega: Number, valorGemas: Number, sinValorar: Number }],
  counts: [Number],
  records: [{ itemId: Number, amount: Number }],
  rawHex: { type: String, required: true },
  receivedAt: { type: Date, default: Date.now },
}, { timestamps: false, expires: 604800 });

EventRewardDataSchema.index({ eventType: 1, hourTimestamp: 1 }, { unique: true });

export const EventRewardDataModel = model<IEventRewardData>('EventRewardData', EventRewardDataSchema);
