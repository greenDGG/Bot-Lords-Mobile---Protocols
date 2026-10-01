/** Registra cambios de count y de estados entre 2414 consecutivos. */
import * as fs from 'fs';
import * as path from 'path';

const dir = path.join(__dirname, '..', '..', 'logs');
const files = fs.readdirSync(dir).filter(f => f.startsWith('bot_') && f.endsWith('.log'));

for (const f of files) {
  const lines = fs.readFileSync(path.join(dir, f), 'utf-8').split('\n');
  let prev: { count: number; states: number[]; coords: string[] } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(/Proto=2414 Len=\d+ header=[0-9a-f]+ body=([0-9a-f]+)/);
    if (!m) continue;
    const b = Buffer.from(m[1]!, 'hex');
    if (b.length < 2) continue;
    const count = b[1]!;
    const states: number[] = [];
    const coords: string[] = [];
    for (let k = 0; k < count && 2 + k * 150 + 149 < b.length; k++) {
      const off = 2 + k * 150;
      states.push(b[off]!);
      coords.push(
        `${b[off + 75]},${b[off + 76]},${b[off + 77]}`
      );
    }
    const cur = { count, states, coords };
    if (prev && JSON.stringify(prev) !== JSON.stringify(cur)) {
      console.log(`\n### ${f} L${i + 1} count ${prev.count} -> ${count}`);
      console.log(`   states [${prev.states}] -> [${states}]`);
      console.log(`   coords  [${prev.coords}] -> [${coords}]`);
      for (let j = Math.max(0, i - 12); j <= Math.min(lines.length - 1, i + 1); j++) {
        const mark = j === i ? '>>>' : '   ';
        console.log(`${mark} ${lines[j]!.substring(0, 165)}`);
      }
    }
    prev = cur;
  }
}
