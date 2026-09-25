/**
 * Test: decodificar proto 9652 (misiones/quests).
 *
 * Estructura de la response:
 *   [progress:4]        - uint32 LE (progreso de la misión activa)
 *   [entries...]        - N entradas de 19 bytes:
 *     [mission_id:2]    - uint16 LE
 *     [timestamp:4]     - uint32 LE (Unix epoch)
 *     [separator:4]     - 0x00000000
 *     [total:4]         - uint32 LE (objetivo)
 *     [separator:4]     - 0x00000000
 *     [points:1]        - uint8 (recompensa)
 *
 * Uso:
 *   npx ts-node scripts/test-parse-9652.ts <hex>
 *   npx ts-node scripts/test-parse-9652.ts <hex> 9663
 *   npx ts-node scripts/test-parse-9652.ts          (usa ejemplo hardcoded)
 */

const ENTRY_SIZE = 19;

interface Mission {
  id: number;
  idHex: string;
  timestamp: number;
  date: string;
  total: number;
  points: number;
  available: boolean;
}

interface ParseResult {
  progress: number;
  activeMission: Mission | null;
  missions: Mission[];
}

function parse9652(hex: string, format: '9652' | '9661' | '9663' = '9652'): ParseResult {
  const buf = Buffer.from(hex.replace(/\s/g, ''), 'hex');
  console.log(`\nTotal: ${buf.length} bytes\n`);

  let off = 0;
  let progress = 0;

  if (format === '9661') {
    // 9661 tiene un 00 extra al inicio
    if (buf[0] === 0x00) off = 1;
  }

  if (format === '9652' || format === '9661') {
    progress = buf.readUInt32LE(off); off += 4;
    console.log(`=== HEADER ===`);
    console.log(`Progreso misión activa: ${progress}`);
  } else {
    if (buf[0] === 0x00) off = 1;
    console.log(`=== HEADER ===`);
    console.log(`(Sin campo progress - formato 9663)`);
  }

  const allMissions: Mission[] = [];
  const now = Math.floor(Date.now() / 1000);

  console.log(`\n=== MISIONES ===\n`);

  while (off + ENTRY_SIZE <= buf.length) {
    const missionId = buf.readUInt16LE(off);
    const timestamp = buf.readUInt32LE(off + 2);
    const total = buf.readUInt32LE(off + 10);
    const points = buf.readUInt8(off + 18);
    const available = timestamp <= now;
    const date = new Date(timestamp * 1000).toISOString();

    allMissions.push({ id: missionId, idHex: '0x' + missionId.toString(16).padStart(4, '0'), timestamp, date, total, points, available });
    off += ENTRY_SIZE;
  }

  let activeMission: Mission | null = null;
  let missions: Mission[];

  if ((format === '9652' || format === '9661') && allMissions.length > 0) {
    activeMission = allMissions[0];
    missions = allMissions.slice(1);
    console.log(`Misión ACTIVA (slot 0):`);
    console.log(`  ID:        ${activeMission.id} (${activeMission.idHex})`);
    console.log(`  Timestamp: ${activeMission.timestamp} (${activeMission.date})`);
    console.log(`  Estado:    ${activeMission.available ? 'Disponible' : 'Bloqueada'}`);
    console.log(`  Total:     ${activeMission.total}`);
    console.log(`  Puntos:    ${activeMission.points}`);
    console.log();
  } else {
    missions = allMissions;
  }

  console.log(`Misiones restantes (${missions.length}):`);
  for (const m of missions) {
    console.log(`  #${m.id} (${m.idHex}) - Total: ${m.total}, Puntos: ${m.points}, ${m.available ? 'Disponible' : 'Bloqueada'}`);
  }

  return { progress, activeMission, missions };
}

// Main
const hexInput = process.argv[2];
const formatArg = process.argv[3] as '9652' | '9661' | '9663' | undefined;

const DEFAULT_HEX = '204e0000970103479c6a00000000f055000000000000649a01429b9c6a0000000002000000000000003cb001299c9c6a00000000f0000000000000001495012a9c9c6a00000000020000000000000064';

const hex = hexInput || DEFAULT_HEX;
const format = formatArg || '9652';

if (!hexInput) {
  console.log('Usando ejemplo hardcoded (pasá hex como argumento para otro):');
  console.log(`  npx ts-node scripts/test-parse-9652.ts <hex> [9652|9661|9663]\n`);
}

const result = parse9652(hex, format);

console.log(`\n=== RESUMEN ===`);
if (result.activeMission) {
  console.log(`Misión activa: #${result.activeMission.id} (${result.progress}/${result.activeMission.total})`);
}
console.log(`Misiones restantes: ${result.missions.length}`);
console.log(`Puntos totales: ${(result.activeMission?.points || 0) + result.missions.reduce((a, m) => a + m.points, 0)}`);
