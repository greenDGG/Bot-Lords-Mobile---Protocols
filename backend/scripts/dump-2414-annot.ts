/** Dump anotado byte a byte de las capturas de marchs.md (offsets exactos). */
import * as fs from 'fs';
import * as path from 'path';
import { decodeCoordBytes } from '../src/models/map-coords';

const md = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'teories', 'marchs.md'), 'utf-8');
const lines = md.split('\n');
const h = (n: number): string => lines[n - 1]!.split('//')[0]!.trim().toLowerCase().replace(/\s/g, '');
const c = (ns: number[]): string => ns.map(h).join('');

function nz(buf: Buffer, from = 0, to = buf.length): void {
  const parts: string[] = [];
  for (let i = from; i < to; i++) {
    if (buf[i] !== 0) parts.push(`@${i}=${buf[i]!.toString(16).padStart(2, '0')}`);
  }
  console.log('  nonZero:', parts.join(' ') || '(todos cero)');
}

function dumpEntry(tag: string, entry: Buffer): void {
  // entry = [index u8][149 body]
  const body = entry.subarray(1);
  const coord = body.subarray(75, 78);
  let name = '(sin nombre)';
  for (let i = 104; i <= 125; i++) {
    if (body[i]! >= 0x20 && body[i]! <= 0x7e) {
      let j = i;
      let s = '';
      while (j <= 125 && body[j]! >= 0x20 && body[j]! <= 0x7e) { s += String.fromCharCode(body[j]!); j++; }
      if (j <= 125 && body[j] === 0 && s.length >= 3) { name = `"${s}" (start=${i})`; break; }
    }
  }
  const ts = body.readBigUInt64LE(126);
  const dur = body.readUInt32LE(134);
  const dec = decodeCoordBytes([coord[0]!, coord[1]!, coord[2]!]);
  console.log(`${tag} idx=${entry[0]} state=0x${body[0]!.toString(16)} coord=${coord.toString('hex')} (${dec.x},${dec.y}) name=${name} ts=${ts} dur=${dur} @106..107=${body.subarray(106, 108).toString('hex')}`);
  console.log('  @1..74:', body.subarray(1, 75).toString('hex'));
  nz(body, 1, 75);
  nz(body, 78, 126);
  nz(body, 138, 149);
}

// cap1: 1 marcha (vuelo) — lineas 4..11
{
  const buf = Buffer.from('0601' + '01' + c([7, 8, 9, 10, 11]), 'hex');
  console.log(`== cap1 limit=${buf[0]} count=${buf[1]}`);
  dumpEntry(' entry0', buf.subarray(2, 2 + 150));
}

// cap2: 3 marchas (vuelo) — lineas 15..30
{
  const buf = Buffer.from(c([15, 16, 17, 19, 20, 21, 23, 24, 25, 26, 28, 29, 30]), 'hex');
  console.log(`== cap2 limit=${buf[0]} count=${buf[1]}`);
  for (let e = 0; e < 3; e++) dumpEntry(` entry${e}`, buf.subarray(2 + e * 150, 2 + (e + 1) * 150));
}

// cap3: cuerpo completo (3 marchas llegadas) — linea 35
{
  const buf = Buffer.from(h(35), 'hex');
  console.log(`== cap3 limit=${buf[0]} count=${buf[1]} bytes=${buf.length}`);
  for (let e = 0; e < 3; e++) dumpEntry(` entry${e}`, buf.subarray(2 + e * 150, 2 + (e + 1) * 150));
}
