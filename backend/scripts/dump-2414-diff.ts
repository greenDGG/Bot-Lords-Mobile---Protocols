/** Compara bytes @0..112 de una misma marcha en vuelo vs llegada. */
import * as fs from 'fs';
import * as path from 'path';

const md = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'teories', 'marchs.md'), 'utf-8');
const lines = md.split('\n');
const h = (n: number): string => lines[n - 1]!.split('//')[0]!.trim().toLowerCase();
const c = (ns: number[]): string => ns.map(h).join('');

const cap2 = Buffer.from(c([15, 16, 17, 19, 20, 21, 23, 24, 25, 26, 28, 29, 30]), 'hex');
const cap3 = Buffer.from(c([35]), 'hex');

// bodies (sin el byte índice) de la marcha idx=1 en ambas capturas
const b2 = cap2.subarray(2 + 150 + 1, 2 + 300);
const b3 = cap3.subarray(2 + 150 + 1, 2 + 300);

for (let i = 0; i < 149; i += 16) {
  const r2 = b2.subarray(i, i + 16);
  const r3 = b3.subarray(i, i + 16);
  const hx = (r: Buffer) => Array.from(r).map(x => x.toString(16).padStart(2, '0')).join(' ');
  const same = r2.equals(r3);
  console.log(`${String(i).padStart(3)}  vuelo ${hx(r2)}  | ${same ? 'IGUAL' : 'llega ' + hx(r3)}`);
}
