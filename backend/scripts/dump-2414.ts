/** Dump de las capturas 2414 parseadas (para documentar offsets). */
import * as fs from 'fs';
import * as path from 'path';
import { parse2414 } from '../src/bot/parsers/marches.parser';

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
  const d = parse2414(buf);
  if (!d) { console.log(name, 'NO PARSEA'); continue; }
  console.log(`== ${name} limit=${d.limit} count=${d.count}`);
  for (const e of d.entries) {
    const coord = e.destCoordBytes.map(x => x.toString(16).padStart(2, '0')).join(' ');
    const troops = e.troops.map(t => `${t.count} T${t.tier}/t${t.type}`).join('+') || '-';
    const heroes = e.heroIds.length ? ` h=[${e.heroIds.join(',')}]` : '';
    console.log(`  idx=${e.index} ${e.status} (${e.destX},${e.destY}) "${e.name}" ts=${e.startAt} dur=${e.durationSec} troops=${troops}${heroes} u106=${e.unknown106} coord=${coord} llega=${e.startAt ? new Date((e.startAt + e.durationSec) * 1000).toISOString() : '-'}`);
  }
}
