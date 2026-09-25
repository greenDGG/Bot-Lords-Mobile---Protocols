/**
 * Prueba parse2220 con el body multi-tile del log Len=1996 (header 25).
 * Uso: npx ts-node scripts/test-parse-2220.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { parse2220, parseMapPacket, detectMapHeaderSize, MAP_TILE_SIZE } from '../src/bot/models/map.types';

const logPath = path.join(__dirname, '..', '..', 'logs', '1310541480', '2026-09-23.log');
const lines = fs.readFileSync(logPath, 'utf-8').split(/\r?\n/);

// Buscar la línea con Proto=2220 Len=1996
let bodyHex = '';
for (const line of lines) {
  if (line.includes('Proto=2220 Len=1996') && line.includes('body=')) {
    const idx = line.indexOf('body=');
    bodyHex = line.slice(idx + 5).trim();
    break;
  }
}
if (!bodyHex) {
  console.log('No se encontró body Len=1996 en el log');
  process.exit(1);
}

const buf = Buffer.from(bodyHex.replace(/\s/g, ''), 'hex');
console.log(`body len=${buf.length}  headerSize=${detectMapHeaderSize(buf)}  rem/51=${(buf.length - detectMapHeaderSize(buf)) / MAP_TILE_SIZE}`);

const tiles2220 = parse2220(buf);
console.log(`parse2220 → ${tiles2220.length} tiles`);

const parsed = parseMapPacket(buf);
if (parsed) {
  console.log(`parseMapPacket → ${parsed.tiles.length} tiles (header=${parsed.header.length})`);
  for (const t of parsed.tiles.slice(0, 5)) {
    console.log(`  - (${t.x},${t.y}) type=${t.type} ${t.empty ? 'ELIMINADO' : `name="${t.name}"`}`);
  }
  if (parsed.tiles.length > 5) console.log(`  ... +${parsed.tiles.length - 5} más`);
} else {
  console.log('parseMapPacket → null');
}
