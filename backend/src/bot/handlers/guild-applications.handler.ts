import type { BotInstance } from '../core/bot-instance';
import type { GuildApplication, GuildApplicationsData } from '../models/guild-applications.types';

const ENTRY_SIZE = 43;
const HEADER_SIZE = 4;

function readUint8(buf: Buffer, offset: number): number {
  return buf[offset];
}

function readUint16LE(buf: Buffer, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8);
}

function readUint32LE(buf: Buffer, offset: number): number {
  return buf[offset] |
    (buf[offset + 1] << 8) |
    (buf[offset + 2] << 16) |
    (buf[offset + 3] << 24);
}

function bytesToHex(buf: Buffer, offset: number, size: number): string {
  let hex = '';
  for (let i = 0; i < size; i++) {
    hex += buf[offset + i].toString(16).padStart(2, '0');
  }
  return hex;
}

function readAscii(buf: Buffer, offset: number, size: number): string {
  let str = '';
  for (let i = 0; i < size; i++) {
    const ch = buf[offset + i];
    if (ch === 0) break;
    str += String.fromCharCode(ch);
  }
  return str;
}

function parseApplications(body: Buffer): GuildApplicationsData | null {
  if (body.length < 3) return null;

  const version = readUint16LE(body, 0);
  const count = readUint8(body, 2);

  const applications: GuildApplication[] = [];
  let offset = 3;

  for (let i = 0; i < count; i++) {
    if (offset + ENTRY_SIZE > body.length) break;

    applications.push({
      userId: readUint32LE(body, offset),
      userIdHex: bytesToHex(body, offset, 4),
      unknown1: readUint16LE(body, offset + 8),
      unknown1Hex: bytesToHex(body, offset + 8, 2),
      name: readAscii(body, offset + 10, 13),
      nameRaw: bytesToHex(body, offset + 10, 13),
      power: readUint32LE(body, offset + 24),
      powerHex: bytesToHex(body, offset + 24, 4),
      troopsKilled: readUint32LE(body, offset + 32),
      troopsKilledHex: bytesToHex(body, offset + 32, 4),
    });

    offset += ENTRY_SIZE;
  }

  return { version, applications, fetchedAt: Date.now() };
}

export function handleGuildApplications(bot: BotInstance, body: Buffer): void {
  try {
    const data = parseApplications(body);
    if (!data) {
      bot.bot.log('[GREMIO] 2826: body demasiado corto');
      return;
    }

    bot.guildApplications = data;
    bot.bot.log(`[GREMIO] 2826: ${data.applications.length} aplicación(es) de gremio`);

    for (const app of data.applications) {
      bot.bot.log(`  - ${app.name} (ID ${app.userId}, poder ${app.power}, tropas matadas ${app.troopsKilled})`);
    }

    bot.saveGuildApplications();
    bot.emit('guildApplicationsUpdated', data);
  } catch (e) {
    bot.bot.log(`[GREMIO] 2826: error al parsear: ${e}`);
  }
}
