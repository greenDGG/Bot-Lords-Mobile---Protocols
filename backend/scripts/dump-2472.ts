/** Parsea todos los [CMD] proto=2472 de los logs: name + mask + cantidades. */
import * as fs from 'fs';
import * as path from 'path';

const dir = path.join(__dirname, '..', '..', 'logs');
const files = fs.readdirSync(dir).filter(f => f.startsWith('bot_') && f.endsWith('.log'));

for (const f of files) {
  const lines = fs.readFileSync(path.join(dir, f), 'utf-8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(/\[CMD\] proto=2472 seq=([0-9a-f]+)/);
    if (!m) continue;
    const all = Buffer.from(m[1]!, 'hex');
    const p = all.subarray(4); // sin seq
    const name = p.subarray(0, 13).toString('ascii').replace(/\0.*$/, '');
    const rest = p.subarray(13);
    const mask = rest.readUInt32LE(0);
    const qtys: number[] = [];
    for (let o = 4; o + 4 <= rest.length; o += 4) {
      const v = rest.readUInt32LE(o);
      if (v !== 0) qtys.push(v);
    }
    console.log(`${f} L${i + 1} name="${name}" mask=0x${mask.toString(16)} qtys=[${qtys.join(',')}] payload=${p.toString('hex')}`);
  }
}
