import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function toCamelCase(key: string): string {
  if (!key) return key;
  return key.charAt(0).toLowerCase() + key.slice(1);
}

export function normalizeKeys(obj: any): any {
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

export class ConfigService {
  readonly desKey: Buffer;
  readonly desKeyHex: string;
  readonly accessDir: string;
  readonly logDir: string;

  constructor() {
    this.desKeyHex = process.env.DES_KEY || '4C2A232940212638';
    this.desKey = Buffer.from(this.desKeyHex, 'hex');
    this.accessDir = process.env.ACCESS_DIR || path.resolve(__dirname, '../../../access');
    this.logDir = process.env.LOG_DIR || path.resolve(__dirname, '../../../logs');
  }

  getLogPath(iggId: number | string): string {
    return path.join(this.logDir, `${iggId}.log`);
  }

  getAccountDir(iggId: number | string): string {
    return path.join(this.accessDir, String(iggId));
  }

  getTokenPath(iggId: number | string): string {
    return path.join(this.getAccountDir(iggId), 'token.json');
  }

  getConfigPath(iggId: number | string): string {
    return path.join(this.getAccountDir(iggId), 'config.json');
  }

  listAccounts(): { iggId: string; token: any; config: any }[] {
    if (!fs.existsSync(this.accessDir)) return [];
    const accounts: { iggId: string; token: any; config: any }[] = [];
    for (const entry of fs.readdirSync(this.accessDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const iggId = entry.name;
      const tokenPath = this.getTokenPath(iggId);
      const configPath = this.getConfigPath(iggId);
      let token: any = null;
      let config: any = null;
      try { token = JSON.parse(fs.readFileSync(tokenPath, 'utf-8')); } catch {}
      try { config = normalizeKeys(JSON.parse(fs.readFileSync(configPath, 'utf-8'))); } catch {}
      accounts.push({ iggId, token, config });
    }
    return accounts;
  }
}

export const configService = new ConfigService();
