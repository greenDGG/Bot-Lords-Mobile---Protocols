/**
 * Prueba buildScanWindows (escaneo del mapa para Caza, proto 2201).
 * Verifica que las ventanas 2×2 cubren (cx±radio, cy±radio) sin huecos,
 * que cada ventana cae en celdas válidas y que vienen ordenadas por cercanía.
 * Uso: npx ts-node scripts/test-map-scan.ts
 */
import { buildScanWindows, getMapWindow, worldToGrid } from '../src/bot/commands/map.commands';

const MAX_GX = 15;
const MAX_GY = 511;

/** Celdas que deben quedar cubiertas para taponar [from, to] en el eje dado. */
function neededRange(from: number, to: number, cell: number, maxG: number): number[] {
  const start = Math.max(0, from);
  const g0 = Math.max(0, Math.floor((start - 8) / cell));
  const g1 = Math.min(maxG, Math.max(g0, Math.floor((to - 8) / cell)));
  const out: number[] = [];
  for (let g = g0; g <= g1; g++) out.push(g);
  return out;
}

function coveredSet(windows: { x: number; y: number }[], axis: 'x' | 'y'): Set<number> {
  const set = new Set<number>();
  for (const w of windows) {
    const { gridX, gridY } = worldToGrid(w.x, w.y);
    const g = axis === 'x' ? gridX : gridY;
    set.add(g);
    set.add(g + 1);
  }
  return set;
}

let failed = false;
const cases: { cx: number; cy: number; r: number }[] = [
  { cx: 228, cy: 562, r: 50 },
  { cx: 228, cy: 562, r: 20 },
  { cx: 228, cy: 562, r: 100 },
  { cx: 406, cy: 140, r: 50 },
  { cx: 8, cy: 8, r: 50 },
  { cx: 500, cy: 3800, r: 50 },
  { cx: 30, cy: 30, r: 500 },
];

for (const c of cases) {
  const wins = buildScanWindows(c.cx, c.cy, c.r);
  const gxNeed = neededRange(c.cx - c.r, c.cx + c.r, 33, MAX_GX);
  const gyNeed = neededRange(c.cy - c.r, c.cy + c.r, 16, MAX_GY);
  const gxHave = coveredSet(wins, 'x');
  const gyHave = coveredSet(wins, 'y');
  const missingX = gxNeed.filter(g => !gxHave.has(g));
  const missingY = gyNeed.filter(g => !gyHave.has(g));

  const badCell = wins.find(w => {
    const cell = getMapWindow(w.x, w.y);
    if (cell.gridX !== worldToGrid(w.x, w.y).gridX || cell.gridY !== worldToGrid(w.x, w.y).gridY) return true;
    if (cell.gridX > MAX_GX || cell.gridY > MAX_GY) return true;
    const base = cell.gridY * 16 + cell.gridX;
    return cell.cells.join(',') !== [base, base + 1, base + 16, base + 17].join(',');
  });

  let sorted = true;
  const dist = (w: { x: number; y: number }) => (w.x - c.cx) ** 2 + (w.y - c.cy) ** 2;
  for (let i = 1; i < wins.length; i++) {
    if (dist(wins[i]) < dist(wins[i - 1]) - 1) sorted = false;
  }

  const ok = missingX.length === 0 && missingY.length === 0 && !badCell && sorted && wins.length > 0;
  if (!ok) failed = true;
  console.log(
    `(${c.cx},${c.cy}) r=${c.r}: ${wins.length} ventanas ` +
    `gx[${gxNeed[0]}..${gxNeed[gxNeed.length - 1]}] gy[${gyNeed[0]}..${gyNeed[gyNeed.length - 1]}] ` +
    `faltanX=[${missingX}] faltanY=[${missingY}] orden=${sorted} → ${ok ? 'OK' : 'FALLO'}`,
  );
}

if (failed) {
  console.log('FALLO');
  process.exit(1);
}
console.log('OK');
