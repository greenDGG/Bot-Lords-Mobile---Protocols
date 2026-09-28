/**
 * Prueba el HuntCoordinator: cuántos bots van al mismo bicho según el HP
 * restante y el daño medio observado en los 2220 de HP.
 * Uso: npx ts-node scripts/test-hunt-coordinator.ts
 */
import { huntCoordinator, SquadPolicy, HitGate } from '../src/bot/models/hunt-coordinator';

const ON: SquadPolicy = { enable: true, max: 5 };
const OFF: SquadPolicy = { enable: false, max: 5 };

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) {
    console.log(`  OK   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${extra !== undefined ? ` → ${JSON.stringify(extra)}` : ''}`);
  }
}

function gate(iggId: number, tileId: number, policy = ON): HitGate {
  return huntCoordinator.canHit(iggId, tileId, policy);
}

// ── 1. Sin datos de daño: manda 1 solo bot ─────────────────────────────────
console.log('\n1) Sin historial de daño');
huntCoordinator.reset();
huntCoordinator.claim(1, { id: 100, x: 10, y: 20, level: 2, hp: 100 }, ON);
let g = gate(1, 100);
check('needed=1 (no se arriesga a mandar 5 sin saber el daño)', g.ok && g.needed === 1, g);
check('sin ocupados → me toca golpear', g.ok, g);
const c2 = huntCoordinator.canClaim(2, 100, ON);
check('2do bot NO entra si needed=1', !c2.ok, c2);
check('hasRoom=false', huntCoordinator.hasRoom(100, ON) === false);

// ── 2. Con daño conocido, needed sigue al HP restante ──────────────────────
console.log('\n2) Daño medio 20% por golpe');
check('golpe 100→80 (daño 20)', (huntCoordinator.reportHit(1, 100, 100, 80), huntCoordinator.peek(100)!.hp === 80));
g = gate(1, 100);
check('HP 80 → needed=ceil(84/20)=5', g.needed === 5 && g.avgDamage === 20, g);
check('ahora hay lugar para otros bots', huntCoordinator.hasRoom(100, ON));
check('2do bot entra con HP alto', huntCoordinator.claim(2, { id: 100, x: 10, y: 20, level: 2, hp: 80 }, ON).ok);
huntCoordinator.markBusy(1, 100, Date.now() + 15_000);
g = gate(2, 100);
check('HP 80 → 1 ocupado < needed 5 → el 2do golpea', g.ok && g.active === 1, g);

// ── 3. El ejemplo del usuario: 5% de HP → va 1 solo ────────────────────────
console.log('\n3) Bicho casi muerto (HP 5%)');
huntCoordinator.updateHp(100, 5, '2201');
g = gate(2, 100);
check('HP 5% → needed=1', g.needed === 1, g);
check('bot1 ocupado cubre el needed → bot2 SOBRA', !g.ok && g.reason === 'surplus' && g.active === 1, g);
huntCoordinator.release(2);
check('bot2 liberado del squad', huntCoordinator.peek(100)!.members.size === 1);

// ── 4. HP = 0 → todos saben que murió ──────────────────────────────────────
console.log('\n4) Bicho muerto');
huntCoordinator.updateHp(100, 0, '2201');
g = gate(1, 100);
check("reason='dead'", !g.ok && g.reason === 'dead', g);
huntCoordinator.release(1);
check('squad vacío eliminado', huntCoordinator.peek(100) === null);

// ── 5. Squad apagado: estricto 1 por bicho ─────────────────────────────────
console.log('\n5) hunt.squad.enable=false');
huntCoordinator.reset();
huntCoordinator.claim(1, { id: 300, x: 1, y: 1, level: 2, hp: 100 }, OFF);
check('needed=1 aunque el HP esté lleno', gate(1, 300, OFF).needed === 1);
check('nadie más entra', !huntCoordinator.canClaim(2, 300, OFF).ok);

// ── 6. Tope de squad (max) ─────────────────────────────────────────────────
console.log('\n6) hunt.squad.max');
huntCoordinator.reset();
huntCoordinator.claim(1, { id: 400, x: 2, y: 2, level: 2, hp: 100 }, ON);
huntCoordinator.reportHit(1, 400, 100, 99); // daño 1% → needed enorme
g = gate(1, 400);
check('daño 1% → needed se corta en max=5', g.needed === 5, g);
g = gate(1, 400, { enable: true, max: 3 });
check('max=3 respeta la política del bot', g.needed === 3, g);

// ── 7. release + snapshot ──────────────────────────────────────────────────
console.log('\n7) release / snapshot');
huntCoordinator.release(1);
check('sin miembros → sin squad', huntCoordinator.peek(400) === null);
huntCoordinator.claim(1, { id: 500, x: 5, y: 6, level: 2, hp: 100 }, ON);
huntCoordinator.claim(2, { id: 501, x: 7, y: 8, level: 2, hp: 100 }, ON);
const snap = huntCoordinator.snapshot();
check('snapshot con 2 squads', snap.length === 2, snap);
check('snapshot con needed/active/members',
  snap.every(s => s.needed >= 1 && s.active === 0 && s.members.length === 1), snap);
huntCoordinator.release(1);
huntCoordinator.release(2);
check('todo liberado', huntCoordinator.snapshot().length === 0);

console.log(failures === 0 ? '\nTODO OK' : `\n${failures} FALLA(S)`);
if (failures > 0) process.exit(1);
