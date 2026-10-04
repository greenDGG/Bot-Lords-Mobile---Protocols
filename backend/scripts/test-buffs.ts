import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { BuffCategory, BuffInstance } from '../src/bot/models/player.types';
import { parseBuffs, getBuffDef, getKnownBuffs, BUFF_ENTRY_SIZE } from '../src/bot/parsers/player.parser';
import { BuffManager } from '../src/bot/features/buff-manager';

let ok = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'OK  ' : 'FALLA'} ${msg}`);
  if (cond) ok++;
  else process.exitCode = 1;
};

// Construye un body de 1111: count + entries de 16 B
const entry = (buffId: number, itemId: number, startTs: number, durSec: number): Buffer => {
  const b = Buffer.alloc(BUFF_ENTRY_SIZE);
  b.writeUInt16LE(buffId, 0);
  b.writeUInt16LE(itemId, 2);
  b.writeBigInt64LE(BigInt(startTs), 4);
  b.writeInt32LE(durSec, 12);
  return b;
};
const packet = (...entries: Buffer[]): Buffer => Buffer.concat([Buffer.from([entries.length]), ...entries]);

// ── Paquetes reales de logs (3914 muestras) ──
// 1 buff: escudo 3 d
const HEX_1 = '0102001d0460be5e6a0000000080f40300';
// 2 buffs: escudo 3 d + potenc. entrenamiento 10 %
const HEX_2 = '0202001d0460be5e6a0000000080f403001900f7048444626a0000000040380000';
// 3 buffs: escudo 8 h + tamaño ejército 50 % + antiexplor. 7 d
const HEX_3 = '0302001b045aef686a000000008070000006002804bee8686a00000000403800000500200483ab666a00000000803a0900';
// sin buffs (520 muestras en logs)
const HEX_0 = '00';
// furia de batalla
const HEX_FURY = '011b000a05634f626a0000000084030000';

console.log('== parseBuffs (layout) ==');
check(BUFF_ENTRY_SIZE === 16, 'entrada de 16 B');

const p1 = parseBuffs(Buffer.from(HEX_1, 'hex'))!;
check(p1 !== null && p1.length === 1, `count=1 => 1 buff (${p1?.length})`);
check(p1![0].def.id === 0x041D, `itemId = 0x041D (escudo 3 d), no buffId (${p1![0].def.id.toString(16)})`);
check(p1![0].def.name === 'Escudo 3d', `nombre = "${p1![0].def.name}"`);
check(p1![0].def.category === BuffCategory.Shield, 'categoría Shield');
check(p1![0].start.getTime() === 1784594016 * 1000, `startTs = 1784594016 (${p1![0].start.toISOString()})`);
check(p1![0].expires.getTime() - p1![0].start.getTime() === 259200 * 1000, 'durSec 259200 = 3 d');

const p2 = parseBuffs(Buffer.from(HEX_2, 'hex'))!;
check(p2.length === 2, `count=2 => 2 buffs (${p2.length})`);
check(p2[0].def.id === 0x041D && p2[1].def.id === 0x04F7, `entries = [041D, 04F7] (${p2.map((b) => b.def.id.toString(16)).join(', ')})`);
check(p2[1].def.category === BuffCategory.Train, '0x04F7 => categoría Train');
check(p2[1].expires.getTime() - p2[1].start.getTime() === 14400 * 1000, 'durSec 14400 = 4 h');
check(p2[1].start.getTime() === 1784824964 * 1000, 'startTs de la 2.ª entry correcto (sin desalinear)');

const p3 = parseBuffs(Buffer.from(HEX_3, 'hex'))!;
check(p3.length === 3, `count=3 => 3 buffs (${p3.length})`);
check(p3.map((b) => b.def.id.toString(16)).join(',') === '41b,428,420', `entries = [041B, 0428, 0420] (${p3.map((b) => b.def.id.toString(16)).join(', ')})`);
check(p3[0].def.name === 'Escudo 8h', `1.er buff = "${p3[0].def.name}"`);
check(p3[1].def.category === BuffCategory.ArmySize, '0x0428 => categoría ArmySize');
check(p3[2].def.category === BuffCategory.AntiScout, '0x0420 => categoría AntiScout');
check(p3[2].expires.getTime() - p3[2].start.getTime() === 604800 * 1000, 'durSec 604800 = 7 d');
check(p3[2].start.getTime() === 1785113475 * 1000, `startTs de la 3.ª entry correcto (el bug viejo la desalineaba): ${p3[2].start.toISOString()}`);

const p0 = parseBuffs(Buffer.from(HEX_0, 'hex'))!;
check(p0 !== null && p0.length === 0, `count=0 => lista vacíaa (${p0?.length})`);

const pf = parseBuffs(Buffer.from(HEX_FURY, 'hex'))!;
check(pf.length === 1 && pf[0].def.id === 0x050A, 'furia => itemId 0x050A');
check(pf[0].def.category === BuffCategory.Fury, 'categoría Fury');
check(pf[0].expires.getTime() - pf[0].start.getTime() === 900 * 1000, 'durSec 900 = 15 min');

console.log('\n== paquetes inválidos ==');
check(parseBuffs(Buffer.alloc(0)) === null, 'body vacío => null');
check(parseBuffs(Buffer.from('0302001d0460be5e6a0000000080f40300', 'hex')) === null, 'count=3 con body de 1 entry => null');

console.log('\n== buffs sin definición ==');
const unknown = parseBuffs(packet(entry(0x0009, 0x1234, 1784594016, 600)))!;
check(unknown.length === 1, 'itemId desconocido igual se registra');
check(unknown[0].def.id === 0x1234, 'se indexa por itemId');
check(unknown[0].def.category === BuffCategory.Other, 'categoría Other');
check(unknown[0].def.name === 'Buff 0x1234', `nombre genérico = "${unknown[0].def.name}"`);

console.log('\n== getBuffDef / getKnownBuffs ==');
check(!!getBuffDef(0x041C) && getBuffDef(0x041C)!.category === BuffCategory.Shield, '0x041C = Escudo 1d');
check(!!getBuffDef(0x050A) && getBuffDef(0x050A)!.category === BuffCategory.Fury, '0x050A = Furia');
check(!!getBuffDef(0x047B) && getBuffDef(0x047B)!.category === BuffCategory.AntiScout, '0x047B = Antiexplor. 4h');
check(!!getBuffDef(0x0487) && getBuffDef(0x0487)!.category === BuffCategory.ArmyAtk, '0x0487 = ATQ ejército 20%');
check(!!getBuffDef(0x0488) && getBuffDef(0x0488)!.category === BuffCategory.ArmyDef, '0x0488 = DEF ejército 20%');
check(!!getBuffDef(0x0424) && getBuffDef(0x0424)!.category === BuffCategory.ArmySize, '0x0424 = tamaño ejército 20%');
check(!!getBuffDef(0x040D) && getBuffDef(0x040D)!.category === BuffCategory.Gather, '0x040D = recolección 50%');
check(!!getBuffDef(0x0474) && getBuffDef(0x0474)!.category === BuffCategory.March, '0x0474 = viaje 50%');
const known = getKnownBuffs();
check(known.length >= 20, `${known.length} definiciones conocidas`);
check(new Set(known.map((b) => b.id)).size === known.length, 'sin ids duplicados');

console.log('\n== BuffManager (snapshot) ==');
// Los paquetes reales de logs son de julio 2026 (ya expirados), así que para
// los getters se usan entradas con startTs "ahora".
const now = Math.floor(Date.now() / 1000);
const PKT_3 = packet(entry(0x0002, 0x041B, now - 60, 28800), entry(0x0006, 0x0428, now - 60, 14400), entry(0x0005, 0x0420, now - 60, 604800));
const PKT_1 = packet(entry(0x0002, 0x041D, now - 60, 259200));
const PKT_FURY = packet(entry(0x001b, 0x050A, now - 30, 900));

const mgr = new BuffManager();
let events = 0;
mgr.onBuffChanged = () => events++;

mgr.handlePacket(PKT_3);
check(mgr.all.length === 3, `3 buffs activos (${mgr.all.length})`);
check(events === 1, `emitió buffsChanged una vez (${events})`);
check(!!mgr.shield && mgr.shield.def.id === 0x041B, `shield = 0x041B (${mgr.shield?.def.name})`);

mgr.handlePacket(PKT_3);
check(events === 1, `mismo snapshot => sin evento (${events})`);

mgr.handlePacket(PKT_1);
check(mgr.all.length === 1, `snapshot de 1 buff reemplaza a los 3 (${mgr.all.length})`);
check(mgr.all[0].def.id === 0x041D, 'sólo queda el escudo 3 d');
check(events === 2, `cambio real => evento (${events})`);

mgr.handlePacket(Buffer.from(HEX_0, 'hex'));
check(mgr.all.length === 0, 'count=0 limpia el estado');
check(!mgr.shield, 'sin escudo despuéss de count=0');
check(events === 3, `limpieza => evento (${events})`);

mgr.handlePacket(Buffer.from('0302001d0460be5e6a0000000080f40300', 'hex'));
check(mgr.all.length === 0, 'paquete mal formado no toca el estado');
check(events === 3, 'ni emite evento');

mgr.handlePacket(PKT_FURY);
check(!!mgr.fury && mgr.fury.def.id === 0x050A, 'furia detectada');
check(mgr.fury!.remaining > 0, `remaining > 0 (${mgr.fury!.remaining} ms)`);

console.log('\n== expiración ==');
const past = now - 400000;
const mgr2 = new BuffManager();
mgr2.handlePacket(packet(entry(0x0002, 0x041D, past, 259200)));
check(mgr2.all.length === 0, 'all() filtra buffs expirados');
check(mgr2.shield === undefined, 'getter shield ignora buffs expirados');
mgr2.handlePacket(packet(entry(0x001b, 0x050A, past, 900)));
check(mgr2.fury === undefined, 'getter fury ignora buffs expirados');
check(mgr2.all.length === 0, 'furia expirada tampoco aparece en all()');

const mgr3 = new BuffManager();
mgr3.handlePacket(packet(entry(0x0002, 0x041D, now - 60, 259200), entry(0x001b, 0x050A, now - 30, 900)));
check(!!mgr3.shield && !!mgr3.fury, 'escudo y furia vivos a la vez');
check(mgr3.all.length === 2, 'all = 2 buffs');

console.log('\n== setShield / setFury (optimista) ==');
const mgr4 = new BuffManager();
const shieldDef = { id: 0x041C, name: 'Escudo 1d', category: BuffCategory.Shield, durationMs: 24 * 3600 * 1000 };
mgr4.setShield(new BuffInstance(shieldDef, new Date(), 24 * 3600 * 1000));
check(!!mgr4.shield && mgr4.shield.def.id === 0x041C, 'setShield registra 0x041C');
mgr4.setShield(new BuffInstance({ ...shieldDef, id: 0x041D, name: 'Escudo 3d' }, new Date(), 3 * 24 * 3600 * 1000));
check(mgr4.all.length === 1 && mgr4.shield!.def.id === 0x041D, 'setShield reemplaza el anterior');
mgr4.setFury(new Date(), 900000);
check(mgr4.all.length === 2 && !!mgr4.fury, 'setFury convive con el escudo');
mgr4.expire(0x050A);
check(!mgr4.fury, 'expire(0x050A) quita la furia');
mgr4.clear();
check(mgr4.all.length === 0, 'clear() vacíaa todo');

// ── Barrido opcional sobre los logs reales ──
//   npx ts-node scripts/test-buffs.ts --logs [dirLogs]
// Parsea TODOS los `Proto=1111` de ./logs y verifica que ninguno quede mal
// formado ni con itemId desconocido (además de armar la tabla del doc).
async function sweepLogs(dir: string): Promise<void> {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.log'));
  const RE = /Proto=1111 Len=(\d+) header=\S+ body=([0-9a-fA-F]+)/;
  let total = 0;
  let badLen = 0;
  let malformed = 0;
  const byItem = new Map<number, { n: number; buffs: Set<number>; durs: Set<number> }>();
  const unknown = new Set<number>();

  for (const f of files) {
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(dir, f)), crlfDelay: Infinity });
    for await (const line of rl) {
      const m = RE.exec(line);
      if (!m) continue;
      total++;
      const body = Buffer.from(m[2], 'hex');
      if (Number(m[1]) !== body.length + 4) badLen++;
      const list = parseBuffs(body);
      if (!list) { malformed++; continue; }
      list.forEach((b, i) => {
        const buffId = body.readUInt16LE(1 + i * BUFF_ENTRY_SIZE);
        const cur = byItem.get(b.def.id) || { n: 0, buffs: new Set<number>(), durs: new Set<number>() };
        cur.n++;
        cur.buffs.add(buffId);
        cur.durs.add(Math.round((b.expires.getTime() - b.start.getTime()) / 1000));
        byItem.set(b.def.id, cur);
        if (!getBuffDef(b.def.id)) unknown.add(b.def.id);
      });
    }
  }

  console.log(`\n== barrido de logs (${files.length} archivos) ==`);
  check(total > 0, `${total} paquetes 1111 parseados`);
  check(badLen === 0, `Len = 4 + body en todos (${badLen} descuadres)`);
  check(malformed === 0, `ninguno mal formado (${malformed})`);

  const rows = [...byItem.entries()].sort((a, b) => b[1].n - a[1].n);
  console.log('\nitemId      n      buffIds           durSec observados         definición');
  for (const [itemId, st] of rows) {
    const def = getBuffDef(itemId);
    const buffs = [...st.buffs].sort((a, b) => a - b).map((x) => '0x' + x.toString(16).toUpperCase()).join(',');
    console.log(
      `0x${itemId.toString(16).toUpperCase().padStart(4, '0')}  ${String(st.n).padStart(5)}  ` +
      `${buffs.padEnd(17)} [${[...st.durs].sort((a, b) => a - b).join(',')}]`.padEnd(47) +
      `${def ? def.name : '?'}`
    );
  }
  console.log(`\nitemIds distintos: ${rows.length}; sin definición: ${unknown.size}${unknown.size ? ` (${[...unknown].map((i) => '0x' + i.toString(16)).join(', ')})` : ''}`);
  check(unknown.size === 0, 'todos los itemId observados tienen definición');
}

const logsIdx = process.argv.indexOf('--logs');
const sweep = logsIdx >= 0
  ? sweepLogs(process.argv[logsIdx + 1] || path.join(__dirname, '..', '..', 'logs'))
  : Promise.resolve();

sweep
  .then(() => console.log(`\n${ok} checks OK`))
  .catch((e) => { console.error(e); process.exitCode = 1; });
