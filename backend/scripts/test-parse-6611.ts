/**
 * Test del parser de 6611 (agrupaciones a torres) contra muestras REALES de logs.
 *
 * Verifica por cada cuerpo de 6611 que se encuentra en los .log bajo logs/:
 *   - tiene 87 bytes y el header (lado, slot) es coherente
 *   - el nombre de líder es ASCII imprimible de hasta 13 chars (no bytes del gremio)
 *   - las coordenadas decodificadas quedan en rango de mapa
 *   - timeRemaining / timestamp / tropas en rangos plausibles
 * y simula la construcción de la lista por (lado, slot) para comprobar que
 * N paquetes dan N entradas (sin entradas fantasma).
 *
 * Uso: npx ts-node scripts/test-parse-6611.ts [dir logs]
 */
import * as fs from 'fs';
import * as path from 'path';
import { parse6611, apply6611, Entry6611 } from '../src/bot/war/war-6611';
import { WarEvent } from '../src/bot/models/war.types';

function walk(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.log')) out.push(p);
  }
  return out;
}

const RECV = /Proto=6611 Len=(\d+) header=\S+ body=([0-9a-fA-F]+)/;

function isPrintableName(s: string): boolean {
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) return false;
  }
  return true;
}

interface Failure { file: string; line: number; why: string; }

function main(): void {
  const root = process.argv[2] || path.join(__dirname, '..', '..', 'logs');
  const files = walk(root);
  let total = 0;
  let wrongLen = 0;
  let badHeader = 0;
  const bySide = { own: 0, against: 0 };
  const slotSeen = { own: new Set<number>(), against: new Set<number>() };
  const names = new Set<string>();
  let emptyNames = 0;
  let maxCoordX = 0;
  let maxCoordY = 0;
  let maxTimeRem = 0;
  let maxTroops = 0;
  let noMax = 0;
  const failures: Failure[] = [];
  const sample: Entry6611[] = [];

  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = RECV.exec(lines[i]);
      if (!m) continue;
      total++;
      const len = parseInt(m[1], 10);
      const payload = Buffer.from(m[2], 'hex');
      const rel = path.relative(root, file);
      const fail = (why: string) => { if (failures.length < 50) failures.push({ file: rel, line: i + 1, why }); };

      if (len !== 91 || payload.length !== 87) {
        wrongLen++;
        fail(`len=${len} body=${payload.length}`);
        continue;
      }
      if (payload[0] > 1) { badHeader++; fail(`byte0=${payload[0]} (no es lado 0/1)`); continue; }

      const e = parse6611(payload);
      if (!e) { fail('parse6611 devolvió null'); continue; }

      if (e.slot > 7) fail(`slot=${e.slot}`);
      if (!e.rallyLeader) emptyNames++;
      else if (!isPrintableName(e.rallyLeader) || e.rallyLeader.length > 13) fail(`nombre ilegible "${e.rallyLeader}"`);

      if (e.coordX > 1000 || e.coordY > 1000 || e.coordX < 0 || e.coordY < 0) fail(`coord fuera de rango (${e.coordX},${e.coordY})`);
      if (e.timeRemainingSec > 86400) fail(`timeRemainingSec=${e.timeRemainingSec}`);
      if (e.ts < 1577836800 || e.ts > 1893456000) fail(`ts=${e.ts}`);
      if (e.troopsCurrent > 100000000) fail(`troopsCurrent=${e.troopsCurrent}`);
      if (e.troopsMax !== undefined && e.troopsMax < e.troopsCurrent) fail(`max=${e.troopsMax} < cur=${e.troopsCurrent}`);

      bySide[e.side]++;
      slotSeen[e.side].add(e.slot);
      if (e.rallyLeader) names.add(e.rallyLeader);
      maxCoordX = Math.max(maxCoordX, e.coordX);
      maxCoordY = Math.max(maxCoordY, e.coordY);
      maxTimeRem = Math.max(maxTimeRem, e.timeRemainingSec);
      maxTroops = Math.max(maxTroops, e.troopsCurrent);
      if (e.troopsMax === undefined) noMax++;
      if (sample.length < 12) sample.push(e);
    }
  }

  console.log(`archivos: ${files.length}   cuerpos 6611: ${total}`);
  console.log(`  por lado: propias=${bySide.own} en contra=${bySide.against}`);
  console.log(`  slots vistos: propias=[${[...slotSeen.own].sort((a, b) => a - b)}] en contra=[${[...slotSeen.against].sort((a, b) => a - b)}]`);
  console.log(`  nombres distintos: ${names.size}   vacíos: ${emptyNames}`);
  console.log(`  max coord: (${maxCoordX},${maxCoordY})  max timeRem: ${maxTimeRem}s  max tropas: ${maxTroops}`);
  console.log(`  sin troopsMax (cur > max): ${noMax}`);
  console.log(`  longitudes malas: ${wrongLen}   headers malos: ${badHeader}`);

  console.log('\nmuestras:');
  for (const e of sample) {
    console.log(`  ${e.side === 'own' ? 'propias  ' : 'en contra'} [${e.slot}] ${JSON.stringify(e.rallyLeader)} (${e.coordX},${e.coordY}) ${e.troopsCurrent}/${e.troopsMax ?? '?'} timeRem=${e.timeRemainingSec}`);
  }

  if (failures.length) {
    console.log(`\nFALLAS (${failures.length}):`);
    for (const f of failures) console.log(`  ${f.file}:${f.line} — ${f.why}`);
    process.exit(1);
  }
  if (total === 0) {
    console.log('\nNo se encontraron cuerpos 6611 para probar.');
    process.exit(1);
  }

  replay(root);
  console.log('\nOK: todas las muestras pasaron.');
}

/**
 * Fase 2: replay por bot de todos los cuerpos 6611 (en orden de llegada)
 * aplicando apply6611, verificando que:
 *   - nunca haya dos entradas con el mismo (lado, slot)
 *   - al final cada lado tiene slots contiguos desde 0 (listas sanas)
 *   - los refrescos actualizan en vez de duplicar (created << updated)
 */
function replay(root: string): void {
  const bots = fs.readdirSync(root, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  let problems = 0;
  let totalCreated = 0;
  let totalUpdated = 0;
  let lastFinal: WarEvent[] = [];
  let lastName = '';

  for (const bot of bots) {
    const files = walk(path.join(root, bot)).sort();
    let list: WarEvent[] = [];
    let created = 0;
    let updated = 0;

    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      for (const line of lines) {
        const m = RECV.exec(line);
        if (!m || parseInt(m[1], 10) !== 91) continue;
        const e = parse6611(Buffer.from(m[2], 'hex'));
        if (!e) continue;
        const r = apply6611(list, e, 1);
        list = r.list;
        if (r.created) created++; else updated++;

        const keys = list.filter(w => w.type === 'tower')
          .map(w => `${w.side}:${w.slot}`);
        if (new Set(keys).size !== keys.length) {
          problems++;
          console.log(`  DUPLICADO tras ${path.basename(file)}: [${keys.join(' ')}]`);
        }
      }
    }

    const towers = list.filter(w => w.type === 'tower');
    for (const side of ['own', 'against'] as const) {
      const slots = towers.filter(w => w.side === side).map(w => w.slot ?? -1).sort((a, b) => a - b);
      const expected = slots.map((_, i) => i);
      if (JSON.stringify(slots) !== JSON.stringify(expected)) {
        problems++;
        console.log(`  SLOTS no contiguos en ${bot} (${side}): [${slots.join(',')}]`);
      }
    }

    totalCreated += created;
    totalUpdated += updated;
    if (towers.length) {
      lastFinal = towers;
      lastName = bot;
    }
  }

  console.log(`\nreplay por bot: ${bots.length} bots, entradas creadas=${totalCreated} actualizadas=${totalUpdated}`);
  if (lastFinal.length) {
    console.log(`último bot con torres (${lastName}) — ${lastFinal.length} entradas:`);
    for (const w of lastFinal.sort((a, b) => (a.side || '').localeCompare(b.side || '') || (a.slot ?? 0) - (b.slot ?? 0))) {
      console.log(`  ${w.side === 'own' ? 'propias  ' : 'en contra'} [${w.slot}] ${JSON.stringify(w.rallyLeader)} (${w.coordX},${w.coordY}) ${w.troopsCurrent}/${w.troopsMax ?? '?'}`);
    }
  }
  if (problems) {
    console.log(`\nFALLAS en replay: ${problems}`);
    process.exit(1);
  }
}

main();
