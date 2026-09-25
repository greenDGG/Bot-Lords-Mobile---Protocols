import * as fs from 'fs';
import * as path from 'path';
import { detectMapHeaderSize, parseMapPacket } from '../src/bot/models/map.types';
import { getMapWindow, requestMapDataPackets, selectCells } from '../src/bot/commands/map.commands';

const logPath = process.argv[2] || path.join(__dirname, '..', '..', 'logs', '1921040762', '2026-09-25.log');
const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/);

function getBody(lineNo: number): Buffer {
  const line = lines[lineNo - 1] || '';
  const m = line.match(/body=([0-9a-f]+)/i);
  if (!m) throw new Error(`line ${lineNo}: sin body`);
  return Buffer.from(m[1], 'hex');
}

let failed = 0;
function check(label: string, cond: boolean, detail = '') {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
}

// --- 1) Respuesta 2220 con eco de 4 celdas (header 45) contiene el target ---
const p1 = getBody(6467);
check('packet1 header=45', detectMapHeaderSize(p1) === 45, `detect=${detectMapHeaderSize(p1)} len=${p1.length}`);
const r1 = parseMapPacket(p1)!;
check('packet1 39 tiles', r1.tiles.length === 39, `count=${r1.tiles.length}`);
const target = r1.tiles.find(t => t.name === 'I Love Ado');
check('packet1 target encontrado', !!target);
if (target) {
  check('target type=8', target.type === 8, `type=${target.type}`);
  check('target en (242,442)', target.x === 242 && target.y === 442, `(${target.x},${target.y})`);
  check('target guild=uFO', target.guild === 'uFO', `guild="${target.guild}"`);
}

// --- 2) Continuación con header 3 (sin eco de celdas) ---
const p2 = getBody(6469);
check('packet2 header=3', detectMapHeaderSize(p2) === 3, `detect=${detectMapHeaderSize(p2)} len=${p2.length}`);
const r2 = parseMapPacket(p2)!;
check('packet2 39 tiles', r2.tiles.length === 39, `count=${r2.tiles.length}`);

// --- 3) Paquete con tail parcial (sin división exacta) ---
const p3 = getBody(6471);
check('packet3 header=3 (fallback)', detectMapHeaderSize(p3) === 3, `detect=${detectMapHeaderSize(p3)} len=${p3.length}`);
const r3 = parseMapPacket(p3)!;
check('packet3 >= 4 tiles', r3.tiles.length >= 4, `count=${r3.tiles.length}`);
check('packet3 primer tile daikoku', r3.tiles[0]?.name.startsWith('daikok') === true, `first="${r3.tiles[0]?.name}"`);

// --- 4) Fórmula de grilla (X-8)/33, (Y-8)/16 ---
const g = getMapWindow(100, 100);
check('gridX (100-8)/33 = 2', g.gridX === 2 && g.gridY === 5, `grid=(${g.gridX},${g.gridY})`);
check('X=107 → gridX 3', getMapWindow(107, 100).gridX === 3);
check('X=200 → gridX 5', getMapWindow(200, 100).gridX === 5);
check('X=208 → gridX 6', getMapWindow(208, 100).gridX === 6);
check('Y=406 → gridY 24', getMapWindow(100, 406).gridY === 24);
check('Y=488 → gridY 30', getMapWindow(100, 488).gridY === 30);

// --- 5) Ventana 2201: 2×2 celdas (base, +1, +16, +17) ---
function win(x: number, y: number): string {
  return getMapWindow(x, y).cells.join(',');
}
const w = getMapWindow(242, 442);
check('ventana (242,442) 4 celdas', w.cells.length === 4, `cells=[${w.cells}]`);
check('ventana base=439', w.base === 439, `base=${w.base}`);
check('ventana = [439,440,455,456]', w.cells.join(',') === '439,440,455,456', `cells=[${w.cells}]`);
check('ventana contiene celda target 439', w.cells.includes(439));
check('(100,100) → 82,83,98,99', win(100, 100) === '82,83,98,99', win(100, 100));
check('(200,100) → 85,86,101,102', win(200, 100) === '85,86,101,102', win(200, 100));
check('(100,200) → 194,195,210,211', win(100, 200) === '194,195,210,211', win(100, 200));
check('(100,300) → 290,291,306,307', win(100, 300) === '290,291,306,307', win(100, 300));
check('(336,410) → 409,410,425,426', win(336, 410) === '409,410,425,426', win(336, 410));
check('(374,222) contiene 219', getMapWindow(374, 222).cells.includes(219), win(374, 222));
check('(370,228) contiene 235', getMapWindow(370, 228).cells.includes(235), win(370, 228));

// --- 6) Payload 2201: body fijo de 45 bytes, count ≤ 4 ---
const pkts = requestMapDataPackets(242, 442);
check('2201 en 1 llamada (4 celdas)', pkts.length === 1 && pkts[0]![0] === 4, `n=${pkts.length} counts=[${pkts.map(p => p[0])}]`);
check('payload fijo de 45 bytes', pkts.every(p => p.length === 45), `lens=[${pkts.map(p => p.length)}]`);
check('count ≤ 4 en todas las tandas', pkts.every(p => p[0]! >= 1 && p[0]! <= 4), `counts=[${pkts.map(p => p[0])}]`);
check('relleno en ceros tras las celdas', pkts.every(p => p.subarray(1 + p[0]! * 2).every(b => b === 0)));
const readCells: number[] = [];
for (const p of pkts) for (let i = 0; i < p[0]!; i++) readCells.push(p.readUInt16LE(1 + i * 2));
check('union de tandas = ventana', readCells.join(',') === w.cells.join(','), `cells=[${readCells}]`);
check('selectCells por defecto = ventana completa', selectCells(w.cells).join(',') === w.cells.join(','));
check('selectCells omite known', selectCells(w.cells, new Set([439, 440])).join(',') === '455,456');
check('selectCells sin quedarse vacío', selectCells(w.cells, new Set(w.cells)).length === 4);

// --- 7) Header sintético count=9 (5+9×10=95) sobre tiles reales ---
const cells9 = [422, 423, 424, 438, 439, 440, 454, 455, 456];
const tiles2 = p1.subarray(45, 45 + 51 * 2);
const synth = Buffer.alloc(95 + 51 * 2);
synth.writeUInt8(0x16, 0); // prefijo como el real (16 c0 49 …)
for (let i = 0; i < 9; i++) synth.writeUInt16LE(cells9[i]!, 3 + i * 10);
tiles2.copy(synth, 95);
check('header sintético 95 (count=9)', detectMapHeaderSize(synth) === 95, `detect=${detectMapHeaderSize(synth)} len=${synth.length}`);
const rSynth = parseMapPacket(synth)!;
check('header 95 → 2 tiles', rSynth.tiles.length === 2, `count=${rSynth.tiles.length}`);

process.exit(failed === 0 ? 0 : 1);
