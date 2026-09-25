/**
 * Script de migración: lee todas las carpetas access/{iggId}/
 * con sus token.json y config.json y las inserta en MongoDB.
 *
 * Uso: npm run migrate
 */
import * as fs from 'fs';
import * as path from 'path';
import mongoose from 'mongoose';
import * as dns from 'dns';

// Usar Google DNS para resolver SRV (Windows bloquea queries SRV)
dns.setServers(['8.8.8.8', '8.8.4.4']);

// ── Config ──
const ACCESS_DIR = path.resolve(__dirname, '../../access');
const MONGO_URI = process.env.MONGO_URI || '';

// ── Schemas (inline) ──

// Token
const TokenSchema = new mongoose.Schema({
  iggId: { type: Number, required: true, unique: true, index: true },
  proxy: { type: String, default: '' },
  accessToken: { type: String, default: '' },
  ssoToken: { type: String, default: '' },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });
const TokenModel = mongoose.model('Token', TokenSchema);

// Config
const ConfigSchema = new mongoose.Schema({
  iggId: { type: Number, required: true, unique: true, index: true },
  dailyResetTime: { type: String, default: '00:00' },
  limitTrain: { type: Number, default: 0 },
  reconnectTime: { type: Number, default: 30 },
  sendHelp: { type: Boolean, default: true },
  proxy: { type: String, default: '' },
  train: { type: mongoose.Schema.Types.Mixed, default: {} },
  shield: { type: mongoose.Schema.Types.Mixed, default: {} },
  giftDaily: { type: mongoose.Schema.Types.Mixed, default: {} },
  mysteryBox: { type: mongoose.Schema.Types.Mixed, default: {} },
  ship: { type: mongoose.Schema.Types.Mixed, default: {} },
  forgeGift: { type: mongoose.Schema.Types.Mixed, default: {} },
  chestVip: { type: mongoose.Schema.Types.Mixed, default: {} },
  artifactFair: { type: mongoose.Schema.Types.Mixed, default: {} },
  refineMana: { type: mongoose.Schema.Types.Mixed, default: {} },
  openGuildChest: { type: mongoose.Schema.Types.Mixed, default: {} },
  adminQuest: { type: mongoose.Schema.Types.Mixed, default: {} },
  guildQuest: { type: mongoose.Schema.Types.Mixed, default: {} },
  resourceLimit: { type: mongoose.Schema.Types.Mixed, default: {} },
  supply: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });
const ConfigModel = mongoose.model('Config', ConfigSchema);

// ── Normalize (copiado de config.service.ts) ──
function toCamelCase(key: string): string {
  if (!key) return key;
  return key.charAt(0).toLowerCase() + key.slice(1);
}

function normalizeKeys(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(normalizeKeys);
  if (typeof obj !== 'object') return obj;
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = toCamelCase(key);
    const normalized = normalizeKeys(value);
    if (result[camelKey] !== undefined && typeof result[camelKey] === 'object' && !Array.isArray(result[camelKey]) && typeof normalized === 'object' && !Array.isArray(normalized)) {
      result[camelKey] = { ...result[camelKey], ...normalized };
    } else {
      result[camelKey] = normalized;
    }
  }
  return result;
}

// ── Migration ──
async function migrate() {
  console.log('[Migrate] Conectando a MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('[Migrate] Conectado');

  if (!fs.existsSync(ACCESS_DIR)) {
    console.log('[Migrate] No existe access/, nada que migrar');
    await mongoose.disconnect();
    return;
  }

  const entries = fs.readdirSync(ACCESS_DIR, { withFileTypes: true });
  let tokens = 0;
  let configs = 0;
  let errors = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const iggId = parseInt(entry.name, 10);
    if (isNaN(iggId)) continue;

    // ── Token ──
    const tokenPath = path.join(ACCESS_DIR, entry.name, 'token.json');
    if (fs.existsSync(tokenPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
        const proxy = raw.proxy || raw.proxyAddress || '';
        const accessToken = raw.access_token || raw.data?.access_token || raw.accessKey || '';
        const ssoToken = raw.data?.sso_token?.token || '';

        await TokenModel.findOneAndUpdate(
          { iggId },
          { iggId, proxy, accessToken, ssoToken, raw },
          { upsert: true, returnDocument: 'after' }
        );
        console.log(`[Migrate] Token ${iggId}: OK`);
        tokens++;
      } catch (e) {
        console.error(`[Migrate] Token ${iggId}: error ->`, (e as Error).message);
        errors++;
      }
    }

    // ── Config ──
    const configPath = path.join(ACCESS_DIR, entry.name, 'config.json');
      if (fs.existsSync(configPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const normalized = normalizeKeys(raw);

        await ConfigModel.findOneAndUpdate(
          { iggId },
          {
            iggId,
            dailyResetTime: normalized.dailyResetTime || '00:00',
            limitTrain: normalized.limitTrain ?? 0,
            reconnectTime: normalized.reconnectTime ?? 30,
            sendHelp: normalized.sendHelp ?? true,
            proxy: normalized.proxy || '',
            train: normalized.train || {},
            shield: normalized.shield || {},
            giftDaily: normalized.giftDaily || {},
            mysteryBox: normalized.mysteryBox || {},
            ship: normalized.ship || {},
            forgeGift: normalized.forgeGift || {},
            chestVip: normalized.chestVip || {},
            artifactFair: normalized.artifactFair || {},
            refineMana: normalized.refineMana || {},
            openGuildChest: normalized.openGuildChest || {},
            adminQuest: normalized.adminQuest || {},
            guildQuest: normalized.guildQuest || {},
            resourceLimit: normalized.resourceLimit || {},
            supply: normalized.supply || {},
          },
          { upsert: true, returnDocument: 'after' }
        );
        console.log(`[Migrate] Config ${iggId}: OK`);
        configs++;
      } catch (e) {
        console.error(`[Migrate] Config ${iggId}: error ->`, (e as Error).message);
        errors++;
      }
    }
  }

  console.log(`\n[Migrate] Resumen:`);
  console.log(`  Tokens: ${tokens}`);
  console.log(`  Configs: ${configs}`);
  console.log(`  Errores: ${errors}`);

  await mongoose.disconnect();
  console.log('[Migrate] Desconectado');
}

migrate().catch(err => {
  console.error('[Migrate] Falló:', err);
  process.exit(1);
});
