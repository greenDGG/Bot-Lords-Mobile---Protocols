/**
 * Prueba distributeTotal (reparto del total entre cuentas, supply en batch).
 * Uso: npx ts-node scripts/test-supply-distribute.ts
 */
import { distributeTotal } from '../src/bot/features/supply-distribute';

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

type Caso = { desc: string; total: number; caps: number[]; esperado: number[] };
const CASES: Caso[] = [
  { desc: 'parte justa exacta', total: 600, caps: [200, 200, 200], esperado: [200, 200, 200] },
  { desc: 'sobra 2 y se reparte +1/+1', total: 500, caps: [200, 200, 200], esperado: [167, 167, 166] },
  { desc: 'una sin capacidad → se reasigna', total: 500, caps: [100, 400, 400], esperado: [100, 200, 200] },
  { desc: 'capacidad total insuficiente → todos sus caps', total: 500, caps: [100, 100, 100], esperado: [100, 100, 100] },
  { desc: 'una sola cuenta', total: 500, caps: [300], esperado: [300] },
  { desc: 'total menor que la parte justa', total: 10, caps: [100, 100, 100], esperado: [4, 3, 3] },
  { desc: 'capacidades 0 → nada', total: 100, caps: [0, 0], esperado: [0, 0] },
  { desc: 'total 0 → nada', total: 0, caps: [100, 100], esperado: [0, 0] },
  { desc: 'capacidades negativas se ignoran', total: 50, caps: [-5, 50], esperado: [0, 50] },
  { desc: '500m entre 7 (enteros, sin perder)', total: 500_000_000, caps: [100_000_000, 100_000_000, 100_000_000, 100_000_000, 100_000_000, 100_000_000, 100_000_000], esperado: [71_428_572, 71_428_572, 71_428_572, 71_428_571, 71_428_571, 71_428_571, 71_428_571] },
];

let failed = 0;
for (const c of CASES) {
  const got = distributeTotal(c.total, c.caps);
  const errs: string[] = [];
  if (got.length !== c.esperado.length || got.some((v, i) => v !== c.esperado[i])) {
    errs.push(`esperado [${c.esperado}] obtenido [${got}]`);
  }
  const maxTotal = Math.min(c.total, sum(c.caps.map(x => Math.max(0, x))));
  if (sum(got) !== maxTotal) errs.push(`Σ=${sum(got)} debería ser ${maxTotal}`);
  for (let i = 0; i < got.length; i++) {
    if (got[i] > Math.max(0, c.caps[i])) errs.push(`cuenta ${i} (${got[i]}) supera su capacidad ${c.caps[i]}`);
    if (!Number.isInteger(got[i])) errs.push(`cuenta ${i} no entera: ${got[i]}`);
  }
  if (errs.length) {
    console.log(`FALLO  ${c.desc}: ${errs.join(' | ')}`);
    failed++;
  } else {
    console.log(`ok     ${c.desc}: [${got}] Σ=${sum(got)}`);
  }
}

// propiedades aleatorias: nunca por encima de caps y Σ = min(total, Σcaps)
for (let t = 0; t < 200; t++) {
  const n = 1 + (t % 8);
  const caps = Array.from({ length: n }, () => Math.floor(Math.random() * 1_000_000));
  const total = Math.floor(Math.random() * 3_000_000);
  const got = distributeTotal(total, caps);
  const ok = sum(got) === Math.min(total, sum(caps)) && got.every((v, i) => v <= caps[i] && Number.isInteger(v));
  if (!ok) {
    console.log(`FALLO  random #${t}: total=${total} caps=[${caps}] → [${got}] Σ=${sum(got)}`);
    failed++;
    break;
  }
}
if (failed === 0) console.log('ok     200 casos aleatorios (Σ y topes)');

if (failed) {
  console.log(`\n${failed} fallo(s)`);
  process.exit(1);
}
console.log(`\nTodos los ${CASES.length} casos + aleatorios OK`);
