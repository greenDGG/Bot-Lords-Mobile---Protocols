/**
 * Prueba parseGuildInfo (proto 2802).
 * Uso: npx ts-node scripts/test-parse-2802.ts
 * Lee el body de Proto=2802 del log de 1311482687.
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseGuildInfo } from '../src/bot/models/guild.types';

const logPath = path.join(__dirname, '..', '..', 'logs', '1311482687', '2026-09-22.log');
const lines = fs.readFileSync(logPath, 'utf-8').split(/\r?\n/);

let bodyHex = '';
for (const line of lines) {
  if (line.includes('Proto=2802') && line.includes('body=')) {
    const idx = line.indexOf('body=');
    bodyHex = line.slice(idx + 5).trim();
    break;
  }
}
if (!bodyHex) {
  console.log('No se encontró body Proto=2802 en el log');
  process.exit(1);
}

const buf = Buffer.from(bodyHex.replace(/\s/g, ''), 'hex');
console.log(`body len=${buf.length}`);

const info = parseGuildInfo(buf);
console.log(`guildId          = ${info.guildId}`);
console.log(`unknownFlag      = 0x${info.unknownFlag.toString(16)}`);
console.log(`leaderName       = "${info.leaderName}"`);
console.log(`guildKills       = ${info.guildKills}`);
console.log(`unknown0         = ${info.unknown0}`);
console.log(`guildTag         = "${info.guildTag}"`);
console.log(`guildDisplayName = "${info.guildDisplayName}"`);
console.log(`guildTitle       = "${info.guildTitle.slice(0, 60)}"`);
console.log(`description len  = ${info.description.length}`);
console.log(`requirements len = ${info.requirements.length}`);

if (info.guildTag !== 'uFO') {
  console.error(`FAIL: expected guildTag "uFO", got "${info.guildTag}"`);
  process.exit(1);
}
if (info.guildDisplayName !== 'gorditos y bonitos') {
  console.error(`FAIL: expected guildDisplayName "gorditos y bonitos", got "${info.guildDisplayName}"`);
  process.exit(1);
}
if (info.leaderName !== 'PIKACHU XD') {
  console.error(`FAIL: expected leaderName "PIKACHU XD", got "${info.leaderName}"`);
  process.exit(1);
}
console.log('OK');
