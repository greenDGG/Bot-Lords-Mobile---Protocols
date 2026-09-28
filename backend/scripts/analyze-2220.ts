/**
 * Analiza todos los bodies de proto 2220 de un log y agrupa por longitud.
 * Uso: npx ts-node scripts/analyze-2220.ts [rutaLog]
 * Sin args toma el log más reciente de la carpeta de logs por cuenta.
 */
import * as fs from 'fs';
import * as path from 'path';
import { classifyMapBody, parseMapPacket } from '../src/bot/models/map.types';
import { parseMapMarch } from '../src/bot/models/map-march.types';
import { parseMonsterHit } from '../src/bot/models/monster-hit.types';

function findLatestLog(): string {
  const base = path.join(__dirname, '..', '..', 'logs');
  let best = '';
  let bestMtime = 0;
  for (const dir of fs.readdirSync(base)) {
    const full = path.join(base, dir);
    if (!fs.statSync(full).isDirectory()) continue;
    for (const f of fs.readdirSync(full)) {
      if (!f.endsWith('.log')) continue;
      const p = path.join(full, f);
      const m = fs.statSync(p).mtimeMs;
      if (m > bestMtime) {
        bestMtime = m;
        best = p;
      }
    }
  }
  return best;
}

const logPath = process.argv[2] || findLatestLog();
console.log(`log: ${logPath}`);

const lines = fs.readFileSync(logPath, 'utf-8').split(/\r?\n/);
const groups = new Map<number, { count: number; first: string; parsed: string[] }>();

for (const line of lines) {
  const idx = line.indexOf('Proto=2220');
  if (idx < 0) continue;
  const b = line.indexOf('body=', idx);
  if (b < 0) continue;
  const hex = line.slice(b + 5).trim().replace(/\s/g, '');
  if (!hex || hex.length % 2 !== 0) continue;
  const buf = Buffer.from(hex, 'hex');
  const g = groups.get(buf.length) ?? { count: 0, first: hex, parsed: [] };
  g.count++;
  if (g.parsed.length < 3) {
    const nameOff = buf.length - 56;
    let tag = 'sin-tail';
    if (nameOff >= 0) {
      const end = buf.indexOf(0, nameOff);
      const nm = buf.toString('utf8', nameOff, end >= 0 ? Math.min(end, nameOff + 13) : nameOff + 13);
      const march = parseMapMarch(buf);
      const hit = parseMonsterHit(buf);
      tag = `name@${nameOff}="${nm}" march=${march ? 'OK' : '-'} hit=${hit ? 'OK' : '-'} class=${classifyMapBody(buf)}`;
      if (!march && !hit) {
        const p = parseMapPacket(buf);
        tag += ` tiles=${p ? p.tiles.length : 0}`;
      }
    }
    g.parsed.push(tag);
  }
  groups.set(buf.length, g);
}

for (const [len, g] of [...groups.entries()].sort((a, b) => b[1].count - a[1].count)) {
  console.log(`\nlen=${len}  n=${g.count}  %62=${len % 62}  tailAnchor=${len - 56}`);
  for (const p of g.parsed) console.log(`   ${p}`);
  console.log(`   hex: ${g.first.slice(0, 160)}${g.first.length > 160 ? '…' : ''}`);
}
