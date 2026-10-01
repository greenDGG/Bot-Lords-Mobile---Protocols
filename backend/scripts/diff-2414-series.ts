/** Time-series: bytes que cambian entre los 2414 repetidos de un log. */
import * as fs from 'fs';
import * as path from 'path';

const file = process.argv[2]!;
const lines = fs.readFileSync(file, 'utf-8').split('\n');
const bodies: Buffer[] = [];
for (const l of lines) {
  const m = l.match(/Proto=2414 Len=\d+ header=[0-9a-f]+ body=([0-9a-f]+)/);
  if (m && m[1]!.length >= 40) bodies.push(Buffer.from(m[1]!, 'hex'));
}
console.log(`paquetes=${bodies.length} bytes=${bodies[0]?.length}`);
if (bodies.length < 2) process.exit(0);

const first = bodies[0]!;
const last = bodies[bodies.length - 1]!;
const changing: number[] = [];
for (let i = 0; i < first.length; i++) {
  const vals = new Set(bodies.map(b => b[i]));
  if (vals.size > 1) changing.push(i);
}
console.log('offsets que cambian:', changing.join(','));
console.log('--- primer paquete (hex):'); console.log(first.toString('hex'));
console.log('--- ultimo paquete (hex):'); console.log(last.toString('hex'));

// por entry: mostrar evolucion de los bytes que cambian (primeras 8 muestras)
const nEntries = Math.floor((first.length - 2) / 150);
for (let e = 0; e < nEntries; e++) {
  const base = 2 + e * 150;
  const ch = changing.filter(o => o >= base && o < base + 150).map(o => o - base);
  console.log(`entry${e} offsets-relativos-cambiantes: ${ch.join(',')}`);
  for (let s = 0; s < Math.min(bodies.length, 12); s++) {
    const b = bodies[s]!.subarray(base, base + 150);
    const vals = ch.map(o => `@${o}=${b[o]!.toString(16).padStart(2, '0')}`).join(' ');
    console.log(`  m${s}: state=${b[0]} ${vals}`);
  }
  if (bodies.length > 12) {
    const b = last.subarray(base, base + 150);
    const vals = ch.map(o => `@${o}=${b[o]!.toString(16).padStart(2, '0')}`).join(' ');
    console.log(`  ultima: state=${b[0]} ${vals}`);
  }
}
