import mongoose from 'mongoose';
import { TokenModel, ConfigModel } from './schemas/account.schema';
import { MarchHistoryModel } from './schemas/march-history.schema';
import { EventModel, EventClaimModel, EventRewardDataModel } from './schemas/event.schema';
import { LuckyExchangeClaimModel } from './schemas/lucky-exchange.schema';
import { GlobalCommandModel } from './schemas/global-command.schema';
import { PlanSequenceModel } from './schemas/plan-sequence.schema';
import { ProxyAuthModel } from './schemas/proxy-auth.schema';
import { FCMTokenModel } from './schemas/fcm-token.schema';
import * as dns from 'dns';

// Usar Google DNS para resolver SRV (Windows bloquea queries SRV)
dns.setServers(['8.8.8.8', '8.8.4.4']);

const MONGO_URI = process.env.MONGO_URI || '';
const MAX_RETRIES = 20;
const INITIAL_BACKOFF_MS = 5000;
const BACKOFF_FACTOR = 1.5;
const MAX_BACKOFF_MS = 30000;

export class DatabaseService {
  private connected = false;

  async connect(uri?: string): Promise<void> {
    if (this.connected) return;

    const mongoUri = uri || MONGO_URI;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await mongoose.connect(mongoUri, {
          serverSelectionTimeoutMS: 10000,
          family: 4,
          tlsAllowInvalidCertificates: true,
        } as any);
        this.connected = true;
        console.log(`[DB] Conectado a MongoDB (intento ${attempt}/${MAX_RETRIES})`);
        return;
      } catch (err) {
        lastError = err as Error;
        const backoff = Math.min(INITIAL_BACKOFF_MS * Math.pow(BACKOFF_FACTOR, attempt - 1), MAX_BACKOFF_MS);
        console.error(`[DB] Error de conexión (intento ${attempt}/${MAX_RETRIES}):`, lastError.message);

        if (attempt < MAX_RETRIES) {
          console.log(`[DB] Reintentando en ${Math.round(backoff / 1000)}s...`);
          await new Promise(resolve => setTimeout(resolve, backoff));
        }
      }
    }

    console.error(`[DB] FATAL: No se pudo conectar a MongoDB después de ${MAX_RETRIES} intentos`);
    console.error('[DB] Último error:', lastError?.message);
    process.exit(1);
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await mongoose.disconnect();
    this.connected = false;
    console.log('[DB] Desconectado');
  }

  isConnected(): boolean {
    return this.connected;
  }

  get TokenModel() { return TokenModel; }
  get ConfigModel() { return ConfigModel; }
  get MarchHistoryModel() { return MarchHistoryModel; }
  get EventModel() { return EventModel; }
  get EventClaimModel() { return EventClaimModel; }
  get EventRewardDataModel() { return EventRewardDataModel; }
  get LuckyExchangeClaimModel() { return LuckyExchangeClaimModel; }
  get GlobalCommandModel() { return GlobalCommandModel; }
  get PlanSequenceModel() { return PlanSequenceModel; }
  get ProxyAuthModel() { return ProxyAuthModel; }
  get FCMTokenModel() { return FCMTokenModel; }
}

export const databaseService = new DatabaseService();
