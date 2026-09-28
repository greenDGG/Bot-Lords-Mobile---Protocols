import { Schema, Document, model } from 'mongoose';

// ── Carta de la Suerte: canje (9864/9865) por cuenta y por evento ──
/**
 * Un registro = una cuenta canjeando UN evento del "Carta de la Suerte".
 * El evento se identifica con `eventKey` = `${eventStartTs}_${eventDuration}`
 * (hash único de la fecha de inicio y la duración que trae el 9861).
 *
 * Sólo existe UN canje por evento, así que la fila se cierra en cuanto hay
 * cualquier respuesta del servidor (status 0 con gems, status ≠ 0, o falta de
 * respuesta tras los reintentos) y el bot no vuelve a canjear en ese evento.
 * Ver `docs/protocols/9865.md`.
 */
export interface ILuckyExchangeClaim extends Document {
  iggId: number;
  /** `${eventStartTs}_${eventDuration}` — clave única del evento */
  eventKey: string;
  /** u32 [0..3] del 9861: inicio del evento (unix s) */
  eventStartTs: number;
  /** u32 [8..11] del 9861: duración del evento en segundos (172740 ≈ 2 días) */
  eventDuration: number;
  /** eventStartTs + eventDuration: fin del evento (unix s) */
  eventEndTs: number;
  /** true = ya se canjeó este evento por esta cuenta: no volver a canjear */
  reclaimed: boolean;
  /** 0 = ok · >0 = status del 9865 · -1 = sin respuesta · -2 = 9865 sin parsear · -3 = migración desde config */
  status: number;
  /** número enviado en el 9864 (u32 LE) */
  value: number;
  /** saldo total de gems tras el 9865 (0 si no vino confirmación) */
  gemsTotal: number;
  /** unix s en que se cerró la fila */
  at: number;
}

const LuckyExchangeClaimSchema = new Schema<ILuckyExchangeClaim>({
  iggId: { type: Number, required: true, index: true },
  eventKey: { type: String, required: true },
  eventStartTs: { type: Number, default: 0 },
  eventDuration: { type: Number, default: 0 },
  eventEndTs: { type: Number, default: 0 },
  reclaimed: { type: Boolean, default: false },
  status: { type: Number, default: 0 },
  value: { type: Number, default: 0 },
  gemsTotal: { type: Number, default: 0 },
  at: { type: Number, default: 0 },
}, { timestamps: true });

LuckyExchangeClaimSchema.index({ iggId: 1, eventKey: 1 }, { unique: true });

export const LuckyExchangeClaimModel = model<ILuckyExchangeClaim>('LuckyExchangeClaim', LuckyExchangeClaimSchema);
