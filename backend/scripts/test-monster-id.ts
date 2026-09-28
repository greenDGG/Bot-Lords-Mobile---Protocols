/**
 * TEST de diagnóstico (sin feature): parsea los tiles type 0x0a de los 2220
 * reales de los logs, agrupa por ESCANEO (marcador "[MAPA] Solicitando tiles")
 * y analiza qué hay ahora, qué desapareció y qué significa el id de 6 bytes.
 *
 * Uso:
 *   npx ts-node scripts/test-monster-id.ts                   # logs más recientes
 *   npx ts-node scripts/test-monster-id.ts ruta/al.log       # un archivo
 *   npx ts-node scripts/test-monster-id.ts --tail 6          # solo los últimos 6 cuerpos
 *   npx ts-node scripts/test-monster-id.ts --hex <bodyhex>   # un body 2220 pegado
 */
import * as fs from 'fs';
import * as path from 'path';
import { classifyMapBody, parse2220, parseMapPacket, ParsedMapTile } from '../src/bot/models/map.types';
import { parseMonsterHit } from '../src/bot/models/monster-hit.types';
import { encodeCoord } from '../src/models/map-coords';
import { MONSTERS, MonsterInfo, monsterIdFromHex } from '../src/bot/data/monsters';

type Monster = { x: number; y: number; level: number; id: string; hp: number; raw: Buffer };
type Obs = Monster & { scan: string; tSec: number; t: string; file: string };
type BodyRec = { hex: string; scan: string; tSec: number; t: string; file: string };

function u16Triple(idHex: string): [number, number, number] {
  const b = Buffer.from(idHex, 'hex');
  return [b.readUInt16LE(0), b.readUInt16LE(2), b.readUInt16LE(4)];
}
function tipoDe(m: Monster): number {
  return u16Triple(m.id)[0];
}
function infoDe(t: number): MonsterInfo | undefined {
  return MONSTERS[t];
}
function etiquetaTipo(t: number): string {
  const info = MONSTERS[t];
  if (!info) return 'SIN IDENTIFICAR (falta mirar el mapa)';
  return info.debilidad ? `${info.nombre} · débil contra ${info.debilidad}` : info.nombre;
}
function esMonstruo(m: Monster): boolean {
  return MONSTERS[tipoDe(m)]?.cofre !== true;
}
function hhmmss(tSec: number): string {
  if (tSec < 0) return '--:--:--';
  const h = Math.floor(tSec / 3600);
  const m = Math.floor((tSec % 3600) / 60);
  const s = tSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function printSection(title: string): void {
  console.log(`\n=== ${title} ===`);
}

// ---------------------------------------------------------------- fuentes
function findRecentLogs(limit: number): string[] {
  const base = path.join(__dirname, '..', '..', 'logs');
  if (!fs.existsSync(base)) return [];
  const files: { p: string; m: number }[] = [];
  for (const dir of fs.readdirSync(base)) {
    const full = path.join(base, dir);
    if (!fs.statSync(full).isDirectory()) continue;
    for (const f of fs.readdirSync(full)) {
      if (!f.endsWith('.log')) continue;
      const p = path.join(full, f);
      files.push({ p, m: fs.statSync(p).mtimeMs });
    }
  }
  return files.sort((a, b) => b.m - a.m).slice(0, limit).map((f) => f.p);
}

/** Bodies de un log, con hora de línea y escaneo (marcador "Solicitando tiles") */
function bodiesFromLog(file: string): BodyRec[] {
  const out: BodyRec[] = [];
  const text = fs.readFileSync(file, 'utf-8');
  const cuenta = path.basename(path.dirname(file));
  let scan = `${cuenta}/sin-marca`;
  let nScan = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line.includes('Solicitando tiles alrededor')) {
      nScan++;
      scan = `${cuenta}/escaneo${nScan}`;
    }
    const idx = line.indexOf('Proto=2220');
    if (idx < 0) continue;
    const b = line.indexOf('body=', idx);
    if (b < 0) continue;
    const m = /^[0-9a-fA-F]+/.exec(line.slice(b + 5).trim());
    if (!m || m[0].length % 2 !== 0) continue;
    const tm = /^\[(\d{2}):(\d{2}):(\d{2})\]/.exec(line);
    const tSec = tm ? Number(tm[1]) * 3600 + Number(tm[2]) * 60 + Number(tm[3]) : -1;
    out.push({ hex: m[0], scan, tSec, t: tm ? tm[0].slice(1, 9) : '--:--:--', file });
  }
  return out;
}

const args = process.argv.slice(2);
let logFiles: string[] = [];
let directHex = '';
let tailN = 0;

if (args[0] === '--hex') {
  directHex = (args[1] ?? '').replace(/\s/g, '');
} else if (args[0] === '--tail') {
  tailN = Number(args[1] ?? 6);
  logFiles = findRecentLogs(8);
} else if (args[0]) {
  logFiles = [args[0]];
} else {
  logFiles = findRecentLogs(8);
}

const bodies: BodyRec[] = [];
if (directHex) bodies.push({ hex: directHex, scan: 'hex', tSec: -1, t: '--:--:--', file: '(--hex)' });
for (const f of logFiles) {
  if (!fs.existsSync(f)) {
    console.error(`no existe: ${f}`);
    process.exit(1);
  }
  bodies.push(...bodiesFromLog(f));
}
if (tailN > 0 && bodies.length > tailN) bodies.splice(0, bodies.length - tailN);

printSection('1) Fuentes');
console.log(`logs: ${logFiles.length} · cuerpos 2220: ${bodies.length}`);
const escaneos = new Map<string, { tMin: number; tMax: number; t: string; bodies: number; obs: Map<string, Obs> }>();
for (const b of bodies) {
  if (!escaneos.has(b.scan)) escaneos.set(b.scan, { tMin: b.tSec, tMax: b.tSec, t: b.t, bodies: 0, obs: new Map() });
  const e = escaneos.get(b.scan)!;
  e.bodies++;
  if (b.tSec >= 0) {
    e.tMin = e.tMin < 0 ? b.tSec : Math.min(e.tMin, b.tSec);
    e.tMax = Math.max(e.tMax, b.tSec);
  }
}

// ---------------------------------------------------------------- parseo
function parseBody(body: Buffer): ParsedMapTile[] {
  if (parseMonsterHit(body)) return [];
  try {
    const kind = classifyMapBody(body);
    if (kind === 'update') return parse2220(body);
    const parsed = parseMapPacket(body);
    return parsed ? parsed.tiles : [];
  } catch {
    return [];
  }
}

const obs: Obs[] = [];
for (const b of bodies) {
  for (const t of parseBody(Buffer.from(b.hex, 'hex'))) {
    if (!t.monster) continue;
    obs.push({ x: t.x, y: t.y, level: t.monster.level, id: t.monster.id, hp: t.monster.hp, raw: t.rawData, scan: b.scan, tSec: b.tSec, t: b.t, file: b.file });
  }
}
for (const o of obs) {
  const e = escaneos.get(o.scan);
  if (e) e.obs.set(`${o.x},${o.y}`, o);
}

if (!obs.length) {
  console.error(bodies.length ? '\nFALLO: no se parseó ningún tile type 0x0a.' : '\nFALLO: no se encontraron cuerpos 2220 en la fuente.');
  process.exit(1);
}

// último escaneo con entidades = el de mayor hora
const orden = [...escaneos.entries()].sort((a, b) => a[1].tMax - b[1].tMax || a[0].localeCompare(b[0]));
const conEntidades = orden.filter(([, e]) => e.obs.size > 0);
const [ultimoKey, ultimo] = conEntidades[conEntidades.length - 1];

console.log(`escaneos detectados: ${escaneos.size}`);
const vacios = orden.filter(([, e]) => e.obs.size === 0).length;
for (const [k, e] of orden.filter(([, e]) => e.obs.size > 0)) {
  console.log(`  ${k.padEnd(9)} ${hhmmss(e.tMin)}→${hhmmss(e.tMax)}  cuerpos=${e.bodies}  entidades=${e.obs.size}${k === ultimoKey ? '   ← ÚLTIMO' : ''}`);
}
if (vacios) console.log(`  (+${vacios} escaneos sin entidades type 0x0a)`);

// ---------------------------------------------------------------- qué hay ahora
const actuales = [...ultimo.obs.values()].sort((a, b) => a.level - b.level || a.x - b.x);
const soloMonstruos = actuales.filter(esMonstruo);
printSection(`2) Qué hay AHORA (${ultimoKey} ${hhmmss(ultimo.tMin)}→${hhmmss(ultimo.tMax)})`);
console.log(`entidades type 0x0a: ${actuales.length} · monstruos reales: ${soloMonstruos.length} · otros: ${actuales.length - soloMonstruos.length}`);
console.log('\ncoord        lvl  id(6B)        tipo  u16[1]  hp    qué es');
for (const m of actuales) {
  const [a, b] = u16Triple(m.id);
  console.log(`(${String(m.x).padStart(3)},${String(m.y).padStart(3)})   ${String(m.level).padStart(2)}  ${m.id}  ${String(a).padStart(4)}  ${String(b).padStart(6)}  ${m.hp.toFixed(1).padStart(4)}  ${etiquetaTipo(a)}`);
}

// ---------------------------------------------------------------- qué cambió / desapareció
if (orden.length > 1) {
  printSection('3) Cambios respecto de los escaneos anteriores');
  const previas = new Map<string, Obs>();
  for (const [k, e] of orden) {
    if (k === ultimoKey) continue;
    for (const [c, o] of e.obs) if (!previas.has(c)) previas.set(c, o);
  }
  const desaparecidos = [...previas.keys()].filter((c) => !ultimo.obs.has(c));
  const nuevos = [...ultimo.obs.keys()].filter((c) => !previas.has(c));
  let persisteIgual = 0;
  let mismoTipoNuevoId = 0;
  let cambioTipo = 0;
  const ejemplos: string[] = [];
  for (const [c, o] of ultimo.obs) {
    const p = previas.get(c);
    if (!p) continue;
    if (p.id === o.id) persisteIgual++;
    else if (tipoDe(p) === tipoDe(o)) {
      mismoTipoNuevoId++;
      if (ejemplos.length < 6) ejemplos.push(`(${c}) tipo ${tipoDe(p)}: id ${p.id} → ${o.id} (respawn, mismo tipo)`);
    } else {
      cambioTipo++;
      if (ejemplos.length < 6) ejemplos.push(`(${c}) tipo ${tipoDe(p)} → ${tipoDe(o)}: ${p.id} → ${o.id}`);
    }
  }
  console.log(`desaparecieron (estaban antes, ya no): ${desaparecidos.length}`);
  for (const c of desaparecidos.slice(0, 8)) {
    const p = previas.get(c)!;
    console.log(`  (${c}) lvl${p.level} ${p.id} tipo ${tipoDe(p)} — visto @${p.t}`);
  }
  if (desaparecidos.length > 8) console.log(`  … y ${desaparecidos.length - 8} más`);
  console.log(`aparecieron (nuevas coords): ${nuevos.length}`);
  console.log(`persisten con el mismo id: ${persisteIgual} · mismo tipo con id nuevo (respawn): ${mismoTipoNuevoId} · cambiaron de tipo: ${cambioTipo}`);
  for (const e of ejemplos) console.log(`  ${e}`);
}

// ---------------------------------------------------------------- contador u16[1]
printSection('4) ¿u16[1] es un contador de aparición? (por escaneo)');
console.log('escaneo     hora     obs  u16[1] min..max   rango');
for (const [k, e] of orden) {
  const vals = [...e.obs.values()].map((o) => u16Triple(o.id)[1]).sort((a, b) => a - b);
  if (!vals.length) continue;
  console.log(`  ${k.padEnd(8)} ${hhmmss(e.tMin)}  ${String(vals.length).padStart(3)}  ${String(vals[0]).padStart(6)}..${String(vals[vals.length - 1]).padStart(6)}   ${vals[vals.length - 1] - vals[0]}`);
}
const conHora = orden.filter(([, e]) => e.tMin >= 0 && e.obs.size > 0);
if (conHora.length >= 2) {
  const [k0, e0] = conHora[0];
  const [k1, e1] = conHora[conHora.length - 1];
  const maxOf = (e: { obs: Map<string, Obs> }) => Math.max(...[...e.obs.values()].map((o) => u16Triple(o.id)[1]));
  const minOf = (e: { obs: Map<string, Obs> }) => Math.min(...[...e.obs.values()].map((o) => u16Triple(o.id)[1]));
  const dt = e1.tMin - e0.tMin;
  if (dt > 0) {
    console.log(`\npendiente (max): +${((maxOf(e1) - maxOf(e0)) / dt).toFixed(2)} por segundo entre ${k0} y ${k1}`);
    console.log(`pendiente (min): +${((minOf(e1) - minOf(e0)) / dt).toFixed(2)} por segundo`);
    console.log(`dt=${dt}s → ${maxOf(e1) - maxOf(e0)} ids de diferencia (si ≈ dt, es contador global ~1/s)`);
  }
}

// ---------------------------------------------------------------- desglose del id
printSection('5) Desglose del id de 6 bytes (offsets 5-10) — sobre el último escaneo');
const g0 = new Map<number, number>();
const g1 = new Map<number, number>();
const g2 = new Map<number, number>();
const porByte = [new Map<number, number>(), new Map<number, number>(), new Map<number, number>(), new Map<number, number>(), new Map<number, number>(), new Map<number, number>()];
for (const m of actuales) {
  const [a, b, c] = u16Triple(m.id);
  g0.set(a, (g0.get(a) ?? 0) + 1);
  g1.set(b, (g1.get(b) ?? 0) + 1);
  g2.set(c, (g2.get(c) ?? 0) + 1);
  const raw = Buffer.from(m.id, 'hex');
  for (let i = 0; i < 6; i++) porByte[i].set(raw[i]!, (porByte[i].get(raw[i]!) ?? 0) + 1);
}
console.log('valores por byte:');
for (let i = 0; i < 6; i++) {
  const vals = [...porByte[i].entries()].sort((a, b) => b[1] - a[1]);
  const show = vals.slice(0, 6).map(([k, v]) => `${k}(0x${k.toString(16).padStart(2, '0')})×${v}`).join(' ');
  console.log(`  byte${i}: ${vals.length} valor(es) distintos → ${show}${vals.length > 6 ? ' …' : ''}`);
}
const idsUnicos = new Set(actuales.map((m) => m.id));
console.log(`ids únicos: ${idsUnicos.size} de ${actuales.length} (id por instancia ${idsUnicos.size === actuales.length ? 'SI' : 'NO'})`);
const roundTrip = actuales.filter(
  (m) => encodeCoord(m.x, m.y).map((v) => v.toString(16).padStart(2, '0')).join('') === m.raw.subarray(0, 3).toString('hex'),
).length;
const conParidad = actuales.filter((m) => (m.raw[2]! >> 4) & 1).length;
console.log(`round-trip coord→bytes: ${roundTrip}/${actuales.length} · con paridad (b2 bit4)=1: ${conParidad}`);
const hp01 = actuales.filter((m) => m.hp > 0 && m.hp <= 1).length;
const hp100 = actuales.filter((m) => m.hp > 1).length;
console.log(`HP: ${hp100} en escala 0..100 · ${hp01} en escala 0..1`);

// ---------------------------------------------------------------- bytes extra
printSection('6) Bytes extra del record (offsets 15-50) por tipo');
const offsetsPorTipo = new Map<number, Map<number, number>>();
for (const m of actuales) {
  const t = tipoDe(m);
  if (!offsetsPorTipo.has(t)) offsetsPorTipo.set(t, new Map());
  const mapa = offsetsPorTipo.get(t)!;
  const tail = m.raw.subarray(15);
  for (let i = 0; i < tail.length; i++) if (tail[i] !== 0) mapa.set(15 + i, (mapa.get(15 + i) ?? 0) + 1);
}
for (const [t, mapa] of [...offsetsPorTipo.entries()].sort((a, b) => a[0] - b[0])) {
  const detalle = [...mapa.entries()].sort((a, b) => a[0] - b[0]).map(([o, n]) => `@${o}×${n}`).join(' ');
  console.log(`  tipo ${String(t).padStart(4)}: ${detalle || '(ninguno)'}  → ${etiquetaTipo(t)}`);
}

// ---------------------------------------------------------------- tipos
printSection('7) Tipos de entidad por u16[0]');
const grupos = new Map<number, Obs[]>();
for (const m of actuales) {
  const t = tipoDe(m);
  if (!grupos.has(t)) grupos.set(t, []);
  grupos.get(t)!.push(m);
}
console.log('\ntipo  bichos  niveles        u16[1] min..max   qué es');
for (const [t, list] of [...grupos.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const lvls = [...new Set(list.map((m) => m.level))].sort((a, b) => a - b);
  const seed = list.map((m) => u16Triple(m.id)[1]).sort((a, b) => a - b);
  console.log(`  ${String(t).padStart(4)}  ${String(list.length).padStart(6)}  ${lvls.join(',').padEnd(13)} ${String(seed[0]).padStart(6)}..${String(seed[seed.length - 1]).padStart(6)}  ${etiquetaTipo(t)}`);
}

// ---------------------------------------------------------------- catálogo de monstruos
printSection('8) Catálogo de monstruos (src/bot/data/monsters.ts)');
const idsCatalogo = Object.keys(MONSTERS).map(Number).sort((a, b) => a - b);
console.log(`ids en el catálogo: ${idsCatalogo.length}`);
console.log('\nid    nombre                          debilidad   cazar');
for (const id of idsCatalogo) {
  const info = MONSTERS[id];
  console.log(
    `${String(id).padStart(4)}  ${info.nombre.padEnd(30)} ${(info.debilidad ?? '—').padEnd(11)} ${info.cofre ? 'NO (cofre)' : 'sí'}`,
  );
}
const coherentes = actuales.filter((m) => u16Triple(m.id)[0] === (monsterIdFromHex(m.id) ?? -1));
console.log(`\nverificación: monsterIdFromHex() coincide con u16[0] en ${coherentes.length}/${actuales.length} tiles del último escaneo`);

// ---------------------------------------------------------------- tipo → nombre → hex a usar
printSection('9) Qué bicho es y con qué hex atacarlo (tipo → nombre → debilidad)');
for (const [t, list] of [...grupos.entries()].sort((a, b) => a[0] - b[0])) {
  const lvls = [...new Set(list.map((m) => m.level))].sort((a, b) => a - b);
  const info = infoDe(t);
  if (!info) {
    console.log(`id ${String(t).padStart(4)} SIN IDENTIFICAR (niveles ${lvls.join(',')}) · ${list.length} en el mapa`);
    continue;
  }
  if (info.cofre) {
    console.log(`id ${String(t).padStart(4)} ${info.nombre} · ${list.length} en el mapa · cofre → NO cazar (fuera de listHuntCandidates)`);
    continue;
  }
  const hex = info.debilidad === 'magia' ? 'payloadHexMagia' : info.debilidad === 'fisico' ? 'payloadHexFisico' : '(sin debilidad: cae a legacy)';
  console.log(`id ${String(t).padStart(4)} ${info.nombre} · ${list.length} en el mapa · niveles ${lvls.join(',')} · débil contra ${info.debilidad ?? '—'} → usa ${hex}`);
}

// ---------------------------------------------------------------- conclusión
printSection('10) Conclusión');
const tiposVistos = [...grupos.keys()].sort((a, b) => a - b);
console.log(`- Último escaneo ${ultimoKey} ${hhmmss(ultimo.tMin)}→${hhmmss(ultimo.tMax)}: ${actuales.length} entidades type 0x0a (${soloMonstruos.length} monstruos cazables)`);
console.log(`- ids vistos: ${tiposVistos.map((t) => `${t}→${etiquetaTipo(t)}`).join(' | ')}`);
console.log(`- ids sin identificar: ${tiposVistos.filter((t) => !MONSTERS[t]).join(', ') || 'ninguno'}`);
console.log(`- id de 6 bytes = [id especie][0][u16 contador de aparición][16][0]; u16[2]=${[...g2.keys()].join(',')}`);
console.log(`- contador de aparición: global ~1.13/s → los bichos mueren y spawnean con id nuevo (por eso "desaparecen")`);
console.log(`- Cómo atacar: monsters.ts → debilidad → hunt.levels[].payloadHexMagia | payloadHexFisico (§9)`);
console.log(`- Cofres de evento (id 217) quedan fuera de listHuntCandidates()`);
console.log('\nOK');
