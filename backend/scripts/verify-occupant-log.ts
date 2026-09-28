/** TEMP: valida parseTileOccupants contra un log real completo. */
import * as fs from 'fs';
import { parseTileOccupants } from '../src/bot/models/map-occupant.types';
import { parseMonsterHit } from '../src/bot/models/monster-hit.types';
import { parseTileInfo } from '../src/bot/models/lucky-card.types';

const file = process.argv[2];
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

const byLen = new Map<number, { bodies: number; hits: number }>();
const hits: { line: number; len: number; name: string; x: number; y: number; time: number; u32: number; f32: number }[] = [];
let bodies = 0, collideHit = 0, collideTileInfo = 0, overGate = 0, bodiesWithHits = 0;

lines.forEach((ln, i) => {
  const m = /Proto=2220 Len=(\d+) .*?body=([0-9a-f]+)/.exec(ln);
  if (!m) return;
  bodies++;
  const body = Buffer.from(m[2]!, 'hex');
  if (body.length > 500) overGate++;
  const hs = parseTileOccupants(body);
  const e = byLen.get(body.length) || { bodies: 0, hits: 0 };
  e.bodies++; e.hits += hs.length;
  byLen.set(body.length, e);
  if (hs.length) {
    bodiesWithHits++;
    if (parseMonsterHit(body)) collideHit++;
    if (parseTileInfo(body)) collideTileInfo++;
    for (const h of hs) hits.push({ line: i + 1, len: body.length, name: h.occupant.name, x: h.occupant.x, y: h.occupant.y, time: h.occupant.time, u32: h.occupant.resourceAmount, f32: h.occupant.unknownF32 });
  }
});

console.log(`log=${file}`);
console.log(`bodies 2220=${bodies}  >500B (fuera del escáner)=${overGate}  cuerpos con occupants=${bodiesWithHits}  records=${hits.length}`);
console.log(`colisión con parseMonsterHit=${collideHit}  con parseTileInfo=${collideTileInfo}`);
console.log('--- cuerpos con hits (len → registros)');
[...byLen.entries()].filter(([, v]) => v.hits > 0).sort((a, b) => a[0] - b[0]).forEach(([len, v]) => console.log(`  len=${len} cuerpos=${v.bodies} records=${v.hits}`));
console.log('--- todos los records');
hits.forEach(h => console.log(`  L${h.line} len=${h.len} (${h.x},${h.y}) "${h.name}" u32=${h.u32} f32=${h.f32.toFixed(2)} t=${h.time}`));
