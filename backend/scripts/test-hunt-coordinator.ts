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

// ── 8. Cupo extra (el "sexto") cuando a los miembros les falta energía ─────
console.log('\n8) Cupo extra con energía baja');
huntCoordinator.reset();
const probe = (golpes: number, activo = true) => ({ canHunt: () => activo, hitCapacity: () => golpes });
huntCoordinator.claim(1, { id: 600, x: 3, y: 3, level: 2, hp: 100 }, ON);
huntCoordinator.reportHit(1, 600, 100, 85); // daño 15% → ceil(89.25/15) = 6 golpes
huntCoordinator.registerBot(1, probe(1));
g = gate(1, 600);
check('daño 15% → needed se corta en max=5', g.needed === 5, g);
for (let id = 2; id <= 5; id++) {
  huntCoordinator.registerBot(id, probe(1));
  check(`bot ${id} entra mientras haya lugar`, huntCoordinator.claim(id, { id: 600, x: 3, y: 3, level: 2, hp: 85 }, ON).ok);
}
g = gate(1, 600);
check('5 miembros con energía para 1 golpe < 6 golpes → needed=6', g.needed === 6, g);
check('entra el sexto', huntCoordinator.canClaim(6, 600, ON).ok);
for (let id = 1; id <= 5; id++) huntCoordinator.registerBot(id, probe(10));
g = gate(1, 600);
check('con energía suficiente vuelve a needed=5', g.needed === 5, g);
check('el séptimo ya no entra', !huntCoordinator.canClaim(7, 600, ON).ok);

// ── 9. Aviso al gremio: ¿puede otro bot rematarlo? ─────────────────────────
console.log('\n9) someoneElseCanKill');
huntCoordinator.reset();
huntCoordinator.claim(1, { id: 700, x: 4, y: 4, level: 2, hp: 100 }, ON);
huntCoordinator.reportHit(1, 700, 100, 80); // daño 20% → ceil(84/20) = 5 golpes
const hp700 = { level: 2, hp: 80 };
check('nadie registrado → hay que avisar', !huntCoordinator.someoneElseCanKill(700, 1, hp700).ok);
huntCoordinator.registerBot(2, probe(9, false));
check('caza apagada no cuenta', !huntCoordinator.someoneElseCanKill(700, 1, hp700).ok);
huntCoordinator.registerBot(2, probe(4));
check('4 < 5 golpes → no puede rematarlo', !huntCoordinator.someoneElseCanKill(700, 1, hp700).ok);
huntCoordinator.registerBot(2, probe(5));
const rem = huntCoordinator.someoneElseCanKill(700, 1, hp700);
check('energía para los 5 golpes → no se avisa', rem.ok && rem.iggId === 2 && rem.hits === 5, rem);
check('a mí mismo no me cuento', !huntCoordinator.someoneElseCanKill(700, 2, hp700).ok);

// ── 10. Aviso al gremio: 1 solo mensaje por bicho ──────────────────────────
console.log('\n10) claimAnnounce (cooldown compartido por tile)');
huntCoordinator.reset();
check('primer aviso permitido', huntCoordinator.claimAnnounce(900, 300_000, 1000));
check('otro bot no repite el mismo bicho', !huntCoordinator.claimAnnounce(900, 300_000, 1500));
check('otro bicho sí se puede avisar', huntCoordinator.claimAnnounce(901, 300_000, 1500));
check('pasado el cooldown vuelve', huntCoordinator.claimAnnounce(900, 300_000, 1000 + 300_001));

// ── 11. El ejemplo del usuario: HP 5%, A hace 6% y B 4% ─────────────────────
// Regla: manda el que MATA (6% >= 5%); el de 4% se va a otro bicho.
console.log('\n11) "Si queda poca vida, va 1 solo — el que lo mata"');

// a) B (4%) reclamó primero → el de 6% DEBE poder sumarse (él tiene historial)
huntCoordinator.reset();
huntCoordinator.claim(1, { id: 810, x: 9, y: 9, level: 4, hp: 11 }, ON);
huntCoordinator.reportHit(1, 810, 11, 5); // historial de A: daño 6%
huntCoordinator.release(1);
huntCoordinator.claim(2, { id: 800, x: 1, y: 1, level: 4, hp: 5 }, ON); // B (sin datos)
const cKiller = huntCoordinator.canClaim(1, 800, ON);
check('a1) el de 6% se une al squad del de 4%', cKiller.ok, cKiller);
check('a2) y se suma también por hasRoom', huntCoordinator.hasRoom(800, ON, 1));

// b) A (6%) en vuelo → el de 4% SOBRA (nadie más hace falta)
huntCoordinator.reset();
huntCoordinator.claim(1, { id: 800, x: 1, y: 1, level: 4, hp: 5 }, ON);
huntCoordinator.reportHit(1, 800, 11, 5); // A hace 6%
huntCoordinator.markBusy(1, 800, Date.now() + 60_000);
g = gate(2, 800);
check('b1) needed=1 con el MEJOR daño (no el promedio)', g.needed === 1, g);
check('b2) el de 4% sobra → va a otro bicho', !g.ok && g.reason === 'surplus', g);
check('b3) el gate expone mi daño y si mato', g.myDamage === 0 && g.canKill === false, g);

// c) B (débil, en vuelo) en un squad → el de 6% NO sobra y sí puede entrar
huntCoordinator.reset();
huntCoordinator.claim(1, { id: 811, x: 9, y: 9, level: 4, hp: 11 }, ON);
huntCoordinator.reportHit(1, 811, 11, 5); // historial de A: 6%
huntCoordinator.release(1);
huntCoordinator.claim(2, { id: 804, x: 4, y: 4, level: 4, hp: 5 }, ON);
huntCoordinator.reportHit(2, 804, 7, 5); // B (débil) hace 2%
huntCoordinator.markBusy(2, 804, Date.now() + 60_000);
check('c1) el de 6% puede unirse al squad del débil', huntCoordinator.canClaim(1, 804, ON).ok);
g = gate(1, 804);
check('c2) y NO sobra: el activo sólo hace 2% y yo mato',
  g.ok && g.canKill && g.activeDamage === 2, g);

// d) HP 4% y tres bots: sólo entra el que lo mata
huntCoordinator.reset();
huntCoordinator.claim(1, { id: 801, x: 2, y: 2, level: 4, hp: 4 }, ON);
huntCoordinator.reportHit(1, 801, 10, 4); // A hace 6%
check('d1) "van 3 por el mismo" → needed=1', huntCoordinator.canHit(1, 801, ON).needed === 1);
check('d2) el de 4% no entra', !huntCoordinator.canClaim(2, 801, ON).ok);
check('d3) el tercero tampoco', !huntCoordinator.canClaim(3, 801, ON).ok);

// e) promedio vs mejor: A(6%) y B(4%) en el squad con HP 5% → 1 golpe basta
huntCoordinator.reset();
huntCoordinator.claim(1, { id: 802, x: 3, y: 3, level: 4, hp: 100 }, ON);
huntCoordinator.reportHit(1, 802, 100, 94); // 6%
huntCoordinator.claim(2, { id: 802, x: 3, y: 3, level: 4, hp: 94 }, ON);
huntCoordinator.reportHit(2, 802, 94, 90); // 4%
huntCoordinator.updateHp(802, 5, '2201');
g = gate(1, 802);
check('e1) HP 5% con dos bots → needed=1 (antes era 2 por el promedio)', g.needed === 1, g);
huntCoordinator.markBusy(1, 802, Date.now() + 60_000);
g = gate(2, 802);
check('e2) el de 4% se libera cuando el de 6% está en vuelo', !g.ok && g.reason === 'surplus', g);

// f) los débiles no rematan: el de 6% sigue pudiendo entrar y golpear
huntCoordinator.reset();
huntCoordinator.claim(1, { id: 812, x: 8, y: 8, level: 4, hp: 11 }, ON);
huntCoordinator.reportHit(1, 812, 11, 5); // historial de A: 6%
huntCoordinator.release(1);
huntCoordinator.claim(2, { id: 803, x: 4, y: 4, level: 4, hp: 5 }, ON);
huntCoordinator.reportHit(2, 803, 7, 5); // B (débil) hace 2%
huntCoordinator.markBusy(2, 803, Date.now() + 60_000);
g = gate(1, 803);
check('f1) mejor daño del squad=2% → needed=ceil(5.25/2)=3', g.needed === 3, g);
check('f2) el de 6% sí golpea (nadie activo puede matar)', g.ok && g.canKill, g);
check('f3) y puede entrar al squad', huntCoordinator.canClaim(1, 803, ON).ok);

console.log(failures === 0 ? '\nTODO OK' : `\n${failures} FALLA(S)`);
if (failures > 0) process.exit(1);
