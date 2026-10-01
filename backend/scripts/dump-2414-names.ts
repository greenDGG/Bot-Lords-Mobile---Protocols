/** Dump de la región @96..140 de una entry (para ver el nombre crudo). */
import * as fs from 'fs';
import * as path from 'path';

const md = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'teories', 'marchs.md'), 'utf-8');
const lines = md.split('\n');
const h = (n: number): string => lines[n - 1]!.split('//')[0]!.trim().toLowerCase();
const c = (ns: number[]): string => ns.map(h).join('');

const cap1 = Buffer.from('0601' + '01' + c([7, 8, 9, 10, 11]), 'hex');
const cap2 = Buffer.from(c([15, 16, 17, 19, 20, 21, 23, 24, 25, 26, 28, 29, 30]), 'hex');
const cap3 = Buffer.from(c([35]), 'hex');

const bodies: [string, Buffer][] = [
  ['cap1 idx1 (vuelo)', cap1.subarray(3, 152)],
  ['cap2 idx1 (vuelo, misma marcha)', cap2.subarray(2 + 150 + 1, 2 + 300)],
  ['cap3 idx1 (llegó)', cap3.subarray(2 + 150 + 1, 2 + 300)],
  ['cap2 idx0', cap2.subarray(2 + 1, 2 + 150)],
  ['cap2 idx2', cap2.subarray(2 + 300 + 1, 2 + 450)],
];

for (const [name, b] of bodies) {
  console.log(`== ${name} (${b.length} B)`);
  for (let i = 96; i < 140; i += 16) {
    const row = b.subarray(i, i + 16);
    const hex = Array.from(row).map(x => x.toString(16).padStart(2, '0')).join(' ');
    const asc = Array.from(row).map(x => (x >= 32 && x < 127 ? String.fromCharCode(x) : '.')).join('');
    console.log(`  ${String(i).padStart(3)}  ${hex.padEnd(47)}  ${asc}`);
  }
}
