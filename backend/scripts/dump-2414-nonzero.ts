/** Lista TODOS los bytes no nulos de cada entry 2414 (cuerpo de 149 B). */
import * as fs from 'fs';
import * as path from 'path';

const md = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'teories', 'marchs.md'), 'utf-8');
const lines = md.split('\n');
const h = (n: number): string => lines[n - 1]!.split('//')[0]!.trim().toLowerCase();
const c = (ns: number[]): string => ns.map(h).join('');

const caps: [string, Buffer][] = [
  ['cap1', Buffer.from('0601' + '01' + c([7, 8, 9, 10, 11]), 'hex')],
  ['cap2', Buffer.from(c([15, 16, 17, 19, 20, 21, 23, 24, 25, 26, 28, 29, 30]), 'hex')],
  ['cap3', Buffer.from(c([35]), 'hex')],
];

for (const [name, buf] of caps) {
  const count = buf[1]!;
  let off = 2;
  for (let i = 0; i < count; i++) {
    const index = buf[off]!;
    const corp = buf.subarray(off + 1, off + 150);
    const nz: string[] = [];
    let runStart = -1;
    for (let j = 0; j < corp.length; j++) {
      if (corp[j] !== 0) {
        if (runStart < 0) runStart = j;
      } else if (runStart >= 0) {
        nz.push(`@${runStart}..${j - 1}=${corp.subarray(runStart, j).toString('hex')}`);
        runStart = -1;
      }
    }
    if (runStart >= 0) nz.push(`@${runStart}..${corp.length - 1}=${corp.subarray(runStart).toString('hex')}`);
    console.log(`${name} idx=${index}: ${nz.join('  ')}`);
    off += 150;
  }
}
