import { Schema, Document, model } from 'mongoose';

/** Configuración global del paquete de autenticación con proxy.
 *  Los bytes 0x0C-0x11 del auth packet son la versión del cliente:
 *    0x0C = MINOR, 0x0D = MAJOR, 0x0E-0x0F = PATCH (LE), 0x10-0x11 = extra.
 *  Se guardan en DB para no recompilar cada vez que IGG los actualiza. */
export interface IProxyAuth extends Document {
  key: string;
  versionMinor: number;
  versionMajor: number;
  versionPatchLow: number;
  versionPatchHigh: number;
  extra1: number;
  extra2: number;
}

const ProxyAuthSchema = new Schema<IProxyAuth>({
  key: { type: String, default: 'proxyAuth', unique: true },
  versionMinor: { type: Number, default: 0xc8 },
  versionMajor: { type: Number, default: 0x02 },
  versionPatchLow: { type: Number, default: 0x37 },
  versionPatchHigh: { type: Number, default: 0x01 },
  extra1: { type: Number, default: 0x05 },
  extra2: { type: Number, default: 0x01 },
}, { timestamps: true });

export const ProxyAuthModel = model<IProxyAuth>('ProxyAuth', ProxyAuthSchema);
