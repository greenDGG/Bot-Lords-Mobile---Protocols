import { handleQuickBattle } from '../src/bot/handlers/sweep.handler';
import { pickAutoSweep, sweepCandidates } from '../src/bot/actions/combat.action';

let failed = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.log(`  FALLO: ${msg}`);
  }
}

interface Calls {
  learn: number[][];
  log: string[];
  consume: number[];
  settled: any;
  emits: string[];
}

function makeBot(pending: { etapa: number; idx: number; tipo: number } | null, res: number) {
  const calls: Calls = { learn: [], log: [], consume: [], settled: null, emits: [] };
  const bot: any = {
    sweepPending: pending,
    lastRes: res,
    takeSweepPending() {
      const p = this.sweepPending;
      this.sweepPending = null;
      return p;
    },
    learnSweepStage(etapa: number, idx: number, ok: boolean) {
      calls.learn.push([etapa, idx, ok ? 1 : 0]);
    },
    getCurrentResistencia() {
      return this.lastRes;
    },
    getResistenciaMax() {
      return 300;
    },
    consumeResistencia(n: number) {
      this.lastRes -= n;
      calls.consume.push(n);
      calls.emits.push('playerInfoUpdated');
    },
    emit(ev: string) {
      calls.emits.push(ev);
    },
    settleSweep(outcome: any) {
      calls.settled = outcome;
    },
    bot: { log: (m: string) => calls.log.push(m) },
  };
  return { bot, calls };
}

const OK_IDX3 =
  '003c77000000ba004400fe001509c06a0000000000000103000000010000000000000000000000000000000000000000000000000200000000000000000001007c0400000000';
const OK_IDX144 =
  '003c770000009c074400f6001509c06a00000000000001900000000100000000000000000000000000000000000000000000000003000000000000000000e00010027d040000';
const OK_ELITE1 =
  '003c77000000a20c4400ea001509c06a000000000000020100000001000000000000000000000000000000000000000000000000030000000000000000000200020078040000';
const OK_X10_IDX3 =
  '003cb2b4000066ba1a00a100e161be6a00000000000001030000000a000000000000000000000000000000000000000000000000010301030202020203037c04010002007c04';
const FAIL = '02' + '00'.repeat(69);

console.log('== handleQuickBattle (capturas reales 1806) ==');

{
  const { bot, calls } = makeBot({ etapa: 1, idx: 3, tipo: 1 }, 260);
  handleQuickBattle(bot, Buffer.from(OK_IDX3, 'hex'));
  check(calls.settled?.ok === true && calls.settled?.status === 0, 'idx3 → ok status 0');
  check(calls.settled?.stamina === 254, `stamina 254 (hay ${calls.settled?.stamina})`);
  check(calls.settled?.stars === 2, `stars 2 (hay ${calls.settled?.stars})`);
  check(
    calls.learn.length === 1 && calls.learn[0][0] === 1 && calls.learn[0][1] === 3 && calls.learn[0][2] === 1,
    `aprende 1:3 ok (hay ${JSON.stringify(calls.learn)})`
  );
  check(calls.consume.length === 1 && calls.consume[0] === 6, `gasta 6 (hay ${JSON.stringify(calls.consume)})`);
  check(bot.lastRes === 254, `lastRes 254 (hay ${bot.lastRes})`);
  check(calls.log.some(l => l.includes('completada')), 'loguea completada');
  check(calls.emits.includes('playerInfoUpdated'), 'emite playerInfoUpdated');
}

{
  const { bot, calls } = makeBot({ etapa: 1, idx: 1, tipo: 1 }, 260);
  handleQuickBattle(bot, Buffer.from(FAIL, 'hex'));
  check(calls.settled?.ok === false && calls.settled?.status === 2, `rechazo status 2 (hay ${calls.settled?.status})`);
  check(
    calls.learn.length === 1 && calls.learn[0][1] === 1 && calls.learn[0][2] === 0,
    `aprende 1:1 bloqueada (hay ${JSON.stringify(calls.learn)})`
  );
  check(calls.consume.length === 0, 'no consume resistencia en rechazo');
  check(bot.lastRes === 260, `resistencia intacta (hay ${bot.lastRes})`);
  check(calls.log.some(l => l.includes('rechazada')), 'loguea rechazada');
}

{
  const { bot, calls } = makeBot({ etapa: 1, idx: 3, tipo: 2 }, 221);
  handleQuickBattle(bot, Buffer.from(OK_X10_IDX3, 'hex'));
  check(calls.settled?.stamina === 161, `x10 stamina 161 (hay ${calls.settled?.stamina})`);
  check(calls.settled?.stars === 0, `x10 no lee stars (hay ${calls.settled?.stars})`);
  check(calls.consume.length === 1 && calls.consume[0] === 60, `x10 gasta 60 (hay ${JSON.stringify(calls.consume)})`);
}

{
  const { bot, calls } = makeBot(null, 246);
  handleQuickBattle(bot, Buffer.from(OK_ELITE1, 'hex'));
  check(
    calls.settled?.etapa === 2 && calls.settled?.idx === 1,
    `sin pending usa el eco 22/23 (hay ${calls.settled?.etapa}:${calls.settled?.idx})`
  );
  check(calls.settled?.stamina === 234, `elite stamina 234 (hay ${calls.settled?.stamina})`);
}

{
  const { bot, calls } = makeBot({ etapa: 1, idx: 144, tipo: 1 }, 100);
  handleQuickBattle(bot, Buffer.from(OK_IDX144, 'hex'));
  check(bot.lastRes === 246, `corrige res hacia arriba (hay ${bot.lastRes})`);
  check(calls.consume.length === 0, 'sin consume cuando el servidor da más');
}

console.log('== sweepCandidates ==');

{
  const norm = sweepCandidates(1);
  check(norm.length === 48, `normal: 48 candidatas (hay ${norm.length})`);
  check(norm.every(i => i % 3 === 0), 'normal: sólo múltiplos de 3');
  check(norm[0] === 144 && norm[norm.length - 1] === 3, `normal descendente 144..3 (hay ${norm[0]}..${norm[norm.length - 1]})`);
  const elite = sweepCandidates(2);
  check(elite.length === 48, `elite: 48 candidatas (hay ${elite.length})`);
  check(elite[0] === 48 && elite[elite.length - 1] === 1, `elite descendente 48..1 (hay ${elite[0]}..${elite[elite.length - 1]})`);
}

console.log('== pickAutoSweep ==');

function autoBot(state: Record<string, string>, cfg: Record<string, any> = {}) {
  return {
    config: { sweep: { auto: true, autoEtapa: 1, autoTipo: 1, ...cfg } },
    sweepStageStatus(etapa: number, idx: number) {
      return (state[`${etapa}:${idx}`] as any) ?? null;
    },
  } as any;
}

{
  const t = pickAutoSweep(autoBot({}));
  check(t?.etapa === 1 && t?.idx === 144 && t?.tipo === 1, `sin datos → sonda 144 (hay ${JSON.stringify(t)})`);
}
{
  const state: Record<string, string> = { '1:66': 'ok' };
  for (const i of sweepCandidates(1)) if (i > 66) state[`1:${i}`] = 'blocked';
  const t = pickAutoSweep(autoBot(state));
  check(t?.idx === 66, `tope aprendido 66 → barre 66 (hay ${t?.idx})`);
}
{
  const state: Record<string, string> = {};
  for (const i of sweepCandidates(1)) if (i > 63) state[`1:${i}`] = 'blocked';
  const t = pickAutoSweep(autoBot(state));
  check(t?.idx === 63, `bloqueadas las de arriba y sin éxito → sonda 63 (hay ${t?.idx})`);
}
{
  const state: Record<string, string> = { '1:144': 'blocked', '1:141': 'blocked', '1:66': 'ok' };
  const t = pickAutoSweep(autoBot(state));
  check(t?.idx === 138, `desconocidas por encima → sonda 138 (hay ${t?.idx})`);
}
{
  const state: Record<string, string> = {};
  for (const i of sweepCandidates(1)) state[`1:${i}`] = 'blocked';
  check(pickAutoSweep(autoBot(state)) === null, 'todo bloqueado → null');
}
{
  const state: Record<string, string> = { '2:48': 'blocked', '2:47': 'ok' };
  const t = pickAutoSweep(autoBot(state, { autoEtapa: 2, autoTipo: 2 }));
  check(t?.etapa === 2 && t?.idx === 47 && t?.tipo === 2, `elite auto (hay ${JSON.stringify(t)})`);
}
{
  const state: Record<string, string> = { '1:66': 'ok' };
  const t = pickAutoSweep(autoBot(state, { autoEtapa: 1, autoTipo: 2 }));
  check(t?.tipo === 2, `respeta autoTipo x10 (hay ${JSON.stringify(t)})`);
}

if (failed > 0) {
  console.log(`\n${failed} comprobaciones fallidas`);
  process.exit(1);
}
console.log('\nTodas las comprobaciones OK');
