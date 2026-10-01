/**
 * Parser del proto 3201 (estado de investigación).
 *
 * Estructura (265 bytes):
 *   Cabecera 15B: techId(u16) + nivel(u8) + timestamp(u32) + reservado(u32) + restantes(u32)
 *   Cola 250B:    AllTechData, 500 niveles empaquetados (2 por byte;
 *                 id impar -> nibble bajo, id par -> nibble alto)
 *
 * Muestras reales extraidas de los logs (cuenta 1297816148).
 *
 * Uso: npx ts-node scripts/test-parse-3201.ts
 */

import { parse3201 } from '../src/bot/parsers/research.parser';
import { TECH_COUNT } from '../src/bot/models/research.types';
import techsJson from '../src/bot/data/techs.json';

const IDLE_HEX =
  '000000000000000000000000000000aaaaaaaa1a11919a11100111a0aaaaaaaaaaaaaa1a1a1111111111a188a999a98888a09a9919110199999999999999aaaaaaaaaaaaaa19000030a34188888888440600101111888899997797890801009a99991a07050910019099a905000091998810000088888888888800000000000091990099110000000000000000000010111266565566060000000000000010000005008054aa0a0a0000000000a0aa029000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
const ACTIVE_HEX =
  '2a010952cd626a000000005dc00700aaaaaaaa1a11919a11100111a0aaaaaaaaaaaaaa1a1a1111111111a188a999a98888a09a9919110199999999999999aaaaaaaaaaaaaa19000030a34188888888440600101111888899997797890801009a99991a07050910019099a905000091998810000088888888888800000000000091990099110000000000000000000010111266565566060000000000000010000005008054aa0a0a0000000000a0aa029000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
const EVENT_3208_HEX = '2a0109'; // techId 298 + nivel 9

const techs = (techsJson as any).techs as Record<string, { levelMax: number; name: string }>;

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  OK   ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function summarize(label: string, data: NonNullable<ReturnType<typeof parse3201>>): void {
  const conNivel = data.techLevels.filter(l => l > 0).length;
  const alMaximo = data.techLevels.filter((l, i) => {
    const t = techs[String(i + 1)];
    return !!t && l === t.levelMax;
  }).length;
  console.log(`\n[${label}]`);
  console.log(`  tech activa=${data.activeTechId} nivel=${data.activeLevel} restantes=${data.remainingSeconds}s timestamp=${data.timestamp}`);
  console.log(`  techs con nivel>0: ${conNivel} | al máximo: ${alMaximo}`);
}

function main(): void {
  console.log('== 3201 sin investigación activa ==');
  const idle = parse3201(Buffer.from(IDLE_HEX, 'hex'));
  check('parsea', !!idle);
  if (idle) {
    summarize('idle', idle);
    check('sin investigación activa', idle.activeTechId === 0 && idle.remainingSeconds === 0 && idle.activeLevel === 0);
    check('500 niveles', idle.techLevels.length === TECH_COUNT, `${idle.techLevels.length}`);
    const exceden = idle.techLevels.filter((l, i) => l > (techs[String(i + 1)]?.levelMax ?? 0));
    check('ningún nivel supera levelMax', exceden.length === 0, `${exceden.length} excesos`);
    check('hay techs avanzadas', idle.techLevels.filter(l => l > 0).length > 0);
  }

  console.log('\n== 3201 con investigación activa ==');
  const active = parse3201(Buffer.from(ACTIVE_HEX, 'hex'));
  check('parsea', !!active);
  if (active) {
    summarize('active', active);
    check('tech activa = 298', active.activeTechId === 298, `${active.activeTechId}`);
    check('nivel en curso = 9', active.activeLevel === 9, `${active.activeLevel}`);
    check('restantes = 507997', active.remainingSeconds === 507997, `${active.remainingSeconds}`);
    check('timestamp = 1784859986', active.timestamp === 1784859986, `${active.timestamp}`);
    check('mismos niveles que la muestra idle', JSON.stringify(active.techLevels) === JSON.stringify(idle!.techLevels));
  }

  console.log('\n== 3208 (evento de investigación) ==');
  const evt = Buffer.from(EVENT_3208_HEX, 'hex');
  const evtTechId = evt.readUInt16LE(0);
  const evtLevel = evt[2];
  check('techId = 298', evtTechId === 298, `${evtTechId}`);
  check('nivel = 9 (>= nivel actual 8 del 3201)', evtLevel === 9 && active!.techLevels[297] === 8, `evento=${evtLevel} tail=${active!.techLevels[297]}`);

  console.log('\n== Muestra demasiado corta ==');
  check('devuelve null con 14 bytes', parse3201(Buffer.alloc(14)) === null);

  console.log(failures === 0 ? '\nTODO OK' : `\n${failures} comprobaciones fallidas`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
