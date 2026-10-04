/**
 * Tests de los parsers/handlers de monstruitos (8210 / 8245 / 8231 / 8230 /
 * 8232 / 8227).
 *
 * Uso: npx ts-node scripts/test-familiars.ts
 *
 * Fixtures: bodies RECV reales extraidos de logs/ (cada uno viene de una
 * cuenta distinta). 8210a/b/c son tres capturas del proto 8210 con
 * distinto count; 8245 es una captura del proto 8245 (11 talentos).
 */
import { parse8210, parse8227, parse8230, parse8231, parse8232, parse8245 } from '../src/bot/parsers/familiars.parser';
import { handle8227, handle8231 } from '../src/bot/handlers/familiar.handler';
import type { BotInstance } from '../src/bot/core/bot-instance';
import { buildFamiliarViews, SKILL_DEFS, FAMILIAR_DEFS } from '../src/bot/data/familiars-db';
import { defaultBotConfig, getFamiliarSkillsConfig } from '../src/models/bot-config';
import { FamiliarSkillsAction } from '../src/bot/actions/familiar.action';
import { buildUseFamiliarSkillBody } from '../src/bot/commands/familiar-skill.commands';
import { computeFamiliarStats } from '../src/bot/familiar-stats';
import { computeResearchStats } from '../src/bot/research-stats';
import { computePlayerStats } from '../src/bot/features/player-stats';

const HEX_8210_A = '012200080014d50200000103010101306900000000000000000000000000000a003c00000000020a010101000000000000000000000000000000000b0025c10c0000010104010100000000ea6b000000000000000000000c002f0c0d0000010807010165ce0200af6e000000000000000000000d0033c9080000020808010165ce0200c0ed03000000000000000000110014d5020000010501010164450200000000000000000000000000120014d50200000105010101f8f40000000000000000000000000000130014d50200000103010101d0d20000000000000000000000000000180032030d0000020501010117290100000000000000000000000000190034140c000002080404016b3004004068000017110000000000001a00249c0100000106010101637e00000000000000000000000000001b00329c020000020401010109b900000000000000000000000000001c00145e0700000101010101000000000000000000000000000000001d002854080000010404010197cd0000f43c010000000000000000001e0014400400000005010101809e02000000000000000000000000001f003c00000000020a0a09010000000000000000209f070000000000200033d70000000203080101702b0000237202000000000000000000210014400400000101010101000000000000000000000000000000002300142e11000001010101010000000000000000000000000000000024001469170000010101010150c3000000000000000000000000000027000100000000000101010100000000000000000000000000000000280033f62e0000020202020129570000ec5900003f090000000000002c0014300800000101020101000000004f0600000000000000000000300014691700000101010101000000000000000000000000000000003100146517000001010101010000000000000000000000000000000032001b621700000101010101a8610000000000000000000000000000340014410400000104030101d6b20000fe4101000000000000000000350018cb0300000101010101000000000000000000000000000000003600328012000001010101010000000000000000000000000000000037001440040000010103010100000000493f01000000000000000000380032ef110000020808010165ce02000e8500000000000000000000390001000000000001010101000000000000000000000000000000003b00330304000002080303012e1f00009c7a000060280000000000003c0033af25000002080604019209060054e500001eb2020000000000'; // count=34, len=955
const HEX_8210_B = '01210008003c00000000020a010101000000000000000000000000000000000a0024440400000105010101157201000000000000000000000000000b0001000000000001010101000000000000000000000000000000000c00202c0400000102040101ebbf00003b5d010000000000000000000d00115c020000000101010100000000000000000000000000000000110032030d000002080101018313000000000000000000000000000012003c0000000002010101010000000000000000000000000000000013003c00000000020a010101000000000000000000000000000000001800174f030000010301010180230200000000000000000000000000190001000000000001010101000000000000000000000000000000001a00084e0000000001010101000000000000000000000000000000001b000ae50000000002010101dd0101000000000000000000000000001c000d710300000001010101000000000000000000000000000000001d001de70000000101020101000000006084000000000000000000001e0009e20000000001010101000000000000000000000000000000001f0032b91e0000010706010153ad0100a877010000000000000000002000085c00000000010101010000000000000000000000000000000021000100000000000101010100000000000000000000000000000000230001000000000002010101d812000000000000000000000000000024000100000000000101010100000000000000000000000000000000280001000000000001010101000000000000000000000000000000002c0001000000000001010101000000000000000000000000000000003000010000000000010101010000000000000000000000000000000031000100000000000101010100000000000000000000000000000000320001000000000001010101aac301000000000000000000000000003400010000000000010101010000000000000000000000000000000035003c00000000020a0a010100000000000000000000000000000000360014400400000104010101edb800000000000000000000000000003700144004000001020101013042000000000000000000000000000038000bb4000000000101010100000000000000000000000000000000390014ca0c000001040101010c3502000000000000000000000000003b000da30300000001010101000000000000000000000000000000003c000100000000000101010100000000000000000000000000000000'; // count=33, len=927
const HEX_8210_C = '010800080031c00a000001010101010000000000000000000000000000000011000100000000000101010100000000000000000000000000000000120001000000000001010101000000000000000000000000000000001a0001000000000001010101000000000000000000000000000000001e000100000000000101010100000000000000000000000000000000230001000000000001010101000000000000000000000000000000002400010000000000010101010000000000000000000000000000000030000100000000000101010100000000000000000000000000000000'; // count=8,  len=227
const HEX_8245 = '0b000a000a0d00021800031900011b00031f00082000042800043800033b00013c0001'; // count=11, len=35

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) { pass++; console.log(`PASS ${label}`); }
  else { fail++; console.log(`FAIL ${label}${detail ? ' — ' + detail : ''}`); }
}

function hex(s: string): Buffer { return Buffer.from(s, 'hex'); }

// --- 8210: invariants generales en las 3 capturas ---
for (const [name, h, count] of [
  ['8210a', HEX_8210_A, 34],
  ['8210b', HEX_8210_B, 33],
  ['8210c', HEX_8210_C, 8],
] as const) {
  const pets = parse8210(hex(h));
  if (!pets) { check(name + ' parsea', false, 'null'); continue; }
  check(name + ' count=' + count, pets.length === count, 'got ' + pets.length);
  check(name + ' niveles 1..60', pets.every(p => p.level >= 1 && p.level <= 60));
  check(name + ' etapas 0..2', pets.every(p => p.stage >= 0 && p.stage <= 2));
  check(name + ' skills 1..10', pets.every(p => p.skills.every(s => s.level >= 1 && s.level <= 10)));
  check(name + ' flags=0', pets.every(p => p.flags === 0));
  check(name + ' exp=0 al nv60', pets.filter(p => p.level === 60).every(p => p.exp === 0));
  check(name + ' petIds unicos', new Set(pets.map(p => p.petId)).size === pets.length);
}

// --- 8210: valores concretos de la captura B ---
const b = parse8210(hex(HEX_8210_B))!;
const jaziek = b.find(p => p.petId === 8);
check('B: Jaziek (id8) nv60 etapa2', !!jaziek && jaziek.level === 60 && jaziek.stage === 2, JSON.stringify(jaziek));
check('B: Jaziek skill1 nv10 exp0', !!jaziek && jaziek.skills[0]!.level === 10 && jaziek.skills[0]!.exp === 0);
check('B: 20 crías / 8 adulto / 5 anciano',
  b.filter(p => p.stage === 0).length === 20 && b.filter(p => p.stage === 1).length === 8 && b.filter(p => p.stage === 2).length === 5);
check('B: 4 monstruitos nv60', b.filter(p => p.level === 60).length === 4);
check('B: 17 con exp>0', b.filter(p => p.exp > 0).length === 17);
const yeti = b.find(p => p.petId === 10);
check('B: Yeti (id10) nv36 exp1092 etapa1 skill1 nv5', !!yeti && yeti.level === 36 && yeti.exp === 1092 && yeti.stage === 1 && yeti.skills[0]!.level === 5, JSON.stringify(yeti));

// --- 8210: valores concretos de la captura C ---
const c = parse8210(hex(HEX_8210_C))!;
check('C: ids exactos', JSON.stringify(c.map(p => p.petId)) === JSON.stringify([8, 17, 18, 26, 30, 35, 36, 48]),
  JSON.stringify(c.map(p => p.petId)));
check('C: Jaziek nv49 etapa1', c[0]!.level === 49 && c[0]!.stage === 1);
check('C: el resto nv1 crías', c.slice(1).every(p => p.level === 1 && p.stage === 0));

// --- 8210: casos borde ---
check('8210 null con body corto', parse8210(Buffer.alloc(2)) === null);
check('8210 null con tag != 1', (() => { const x = hex(HEX_8210_B); x[0] = 2; return parse8210(x) === null; })());
check('8210 null con bytes de más', parse8210(Buffer.concat([hex(HEX_8210_B), Buffer.from([0])])) === null);
check('8210 null con bytes de menos', parse8210(hex(HEX_8210_B).subarray(0, 900)) === null);

// --- 8245 ---
const t = parse8245(hex(HEX_8245));
check('8245 count=11', !!t && t.length === 11, t ? 'got ' + t.length : 'null');
const expect8245 = [[10, 10], [13, 2], [24, 3], [25, 1], [27, 3], [31, 8], [32, 4], [40, 4], [56, 3], [59, 1], [60, 1]];
check('8245 pares exactos', !!t && JSON.stringify(t.map(x => [x.petId, x.level])) === JSON.stringify(expect8245),
  t ? JSON.stringify(t.map(x => [x.petId, x.level])) : 'null');
check('8245 niveles 1..10', !!t && t.every(x => x.level >= 1 && x.level <= 10));
check('8245 null con longitud impar', parse8245(Buffer.alloc(8)) === null);
check('8245 null con count inflado', parse8245(Buffer.from('0b000a', 'hex')) === null);

// --- vistas enriquecidas (familiars-db) ---
if (t) {
  const views = buildFamiliarViews({ pets: b, talents: t });
  check('views count=33', views.length === 33, 'got ' + views.length);
  check('views todos con nombre', views.every(v => v.name && !v.name.includes('#')));
  const v8 = views.find(v => v.petId === 8)!;
  check('view Jaziek: nombre/talento', !!v8 && v8.name === 'Jaziek' && !!v8.talent && v8.talent.name === 'Filo letal', JSON.stringify(v8?.talent));
  check('view Jaziek pct[9]=40', !!v8?.talent?.pct && v8.talent.pct[9] === 40);
  check('view Jaziek talento nv0 (sin 8245 para id8)', !!v8 && v8.talent!.level === 0);
  check('view Jaziek skill1 Guardián de Almacén 10/10',
    !!v8 && v8.skills[0]!.name === 'Guardián de Almacén' && v8.skills[0]!.maxLevel === 10, JSON.stringify(v8?.skills[0]));
  const v10 = views.find(v => v.petId === 10)!;
  check('view Yeti talento nv10 (de 8245)', !!v10.talent && v10.talent.level === 10, JSON.stringify(v10.talent));
  const v13 = views.find(v => v.petId === 13)!;
  check('view Cabeza hueca talento nv2', !!v13.talent && v13.talent.level === 2, JSON.stringify(v13.talent));
  // Soldado fantasma (id14) tiene tactics=0 en PetTbl → sin talento.
  // (ningún pet del fixture B tiene tactics=0, por eso va sintético)
  const synth = buildFamiliarViews({
    pets: [{ petId: 14, level: 5, exp: 0, stage: 0, flags: 0, skills: [{ level: 1, exp: 0 }, { level: 1, exp: 0 }, { level: 1, exp: 0 }, { level: 1, exp: 0 }] }],
    talents: [],
  });
  check('view sin talento (Soldado fantasma tactics=0) → null', synth[0]!.talent === null && synth[0]!.name === 'Soldado fantasma');
}

// --- maxLevel por skill: 10 para TODAS (ground truth: UI del juego x/10) ---
// Regresión: PetSkill@18 da 44298 para la skill78 (basura) y 5 para la 39;
// PetSkillExp sugiere 5 para la 39 pero el juego la muestra /10.
check('maxLevel skill78 Sendero Ardiente = 10 (regresión @18=44298)', SKILL_DEFS[78]?.maxLevel === 10, 'got ' + SKILL_DEFS[78]?.maxLevel);
check('maxLevel skill75 Fuegos Amistosos = 10', SKILL_DEFS[75]?.maxLevel === 10);
check('maxLevel skill42 Crisol = 10', SKILL_DEFS[42]?.maxLevel === 10);
check('maxLevel skill39 Cautiverio Místico = 10 (regresión exp-curve=5)', SKILL_DEFS[39]?.maxLevel === 10, 'got ' + SKILL_DEFS[39]?.maxLevel);
check('TODAS las skills maxLevel=10', Object.values(SKILL_DEFS).every(s => s.maxLevel === 10),
  JSON.stringify(Object.values(SKILL_DEFS).filter(s => s.maxLevel !== 10).map(s => [s.id, s.maxLevel])));

// --- pasivas de stats (type=2) vs activas (type=1) ---
const allDefs = Object.values(SKILL_DEFS);
const nPassive = allDefs.filter(s => s.type === 'passive').length;
const nActive = allDefs.filter(s => s.type === 'active').length;
check('72 pasivas / 36 activas', nPassive === 72 && nActive === 36, JSON.stringify({ nPassive, nActive }));
check('toda pasiva tiene effectText + values[10] + unit',
  allDefs.filter(s => s.type === 'passive').every(s => !!s.effectText && !!s.values && s.values.length === 10 && s.unit !== undefined),
  JSON.stringify(allDefs.filter(s => s.type === 'passive' && (!s.effectText || !s.values)).map(s => s.id)));
check('toda activa tiene desc (placeholders %a..%g opcionales: 4 son estáticas)',
  allDefs.filter(s => s.type === 'active').every(s => !!s.desc),
  JSON.stringify(allDefs.filter(s => s.type === 'active' && !s.desc).map(s => s.id)));
// Las activas usadas por algún pet deben tener params para TODOS los placeholders
// de su desc (skills 105-108 = kind31 no las usa ningún pet y traen D=0).
const usedSkillIds = new Set(Object.values(FAMILIAR_DEFS).flatMap(p => p.skills));
check('activas USADAS: params completos para todos los placeholders de la desc',
  allDefs.filter(s => usedSkillIds.has(s.id) && s.type === 'active' && /%[a-g]/.test(s.desc || ''))
    .every(s => [...s.desc!.matchAll(/%([a-g])/g)].every(m => !!s.params?.[m[1]])),
  JSON.stringify(allDefs.filter(s => usedSkillIds.has(s.id) && s.type === 'active' && s.desc && /%[a-g]/.test(s.desc)
    && ![...s.desc!.matchAll(/%([a-g])/g)].every(m => !!s.params?.[m[1]])).map(s => s.id)));

const s3 = SKILL_DEFS[3]!;
check('skill3 Manos ocupadas pasiva → effect248 "Vel. construcción +"',
  s3.type === 'passive' && s3.effectId === 248 && s3.effectText === 'Vel. construcción +' && s3.unit === 0, JSON.stringify(s3));
check('skill3 valores 100..500 (=1%..5%)', s3.values?.[0] === 100 && s3.values?.[9] === 500);
const s39 = SKILL_DEFS[39]!;
check('skill39 Cautiverio Místico → effect357 "Fusionando Pacto +" valores 1..5',
  s39.effectId === 357 && s39.effectText === 'Fusionando Pacto +' && s39.unit === 1
  && JSON.stringify(s39.values?.slice(0, 5)) === '[1,2,3,4,5]', JSON.stringify(s39));
const s73 = SKILL_DEFS[73]!;
check('skill73 Arreglo Rápido → effect305 unit=2 segundos 1800..21600',
  s73.effectId === 305 && s73.unit === 2 && s73.values?.[0] === 1800 && s73.values?.[9] === 21600, JSON.stringify(s73));
const s102 = SKILL_DEFS[102]!;
check('skill102 Bendición ardiente-Inf → effect456 (450..1500 = 4.5%..15%)',
  s102.effectId === 456 && s102.unit === 0 && s102.values?.[0] === 450 && s102.values?.[9] === 1500, JSON.stringify(s102));
const s78 = SKILL_DEFS[78]!;
check('skill78 Sendero Ardiente activa con desc %e~%c',
  s78.type === 'active' && !!s78.desc?.includes('%e~%c'), JSON.stringify(s78.desc)?.slice(0, 120));
check('skill78 params %a=1 %b=500 %e=3000 (nv1)',
  s78.params?.a?.values[0] === 1 && s78.params?.b?.values[0] === 500 && s78.params?.e?.values[0] === 3000,
  JSON.stringify({ a: s78.params?.a?.values[0], b: s78.params?.b?.values[0], e: s78.params?.e?.values[0] }));

// --- stats del jugador: las pasivas de monstruitos entran en playerStats ---
{
  const passives = allDefs.filter(s => s.type === 'passive' && s.effectId);
  check('toda pasiva lleva effectUnit (Effect.ValueID)',
    passives.every(s => typeof s.effectUnit === 'string'),
    JSON.stringify(passives.filter(s => typeof s.effectUnit !== 'string').map(s => s.id)));
  const units: Record<string, number> = {};
  for (const s of passives) units[s.effectUnit!] = (units[s.effectUnit!] || 0) + 1;
  check('effectUnit: 65 % + 5 "" + 2 minutos', units['%'] === 65 && units[''] === 5 && units['minutos'] === 2, JSON.stringify(units));

  check('computeFamiliarStats(undefined) → []', computeFamiliarStats(undefined).length === 0);

  // Pets sintéticos: 59 Gemming Duendecillo (skill3 = efect248) y 33 Strix (skill73 = efect305)
  const p59 = FAMILIAR_DEFS[59]!;
  const idx3 = p59.skills.indexOf(3);
  const fam59 = {
    pets: [{
      petId: 59, level: 1, exp: 0, stage: 0, flags: 0,
      skills: p59.skills.map((_, i) => ({ level: i === idx3 ? 2 : 1, exp: 0 })),
    }],
    talents: [],
  };
  const st59 = computeFamiliarStats(fam59);
  const vel = st59.find(s => s.key === 'Vel. construcción +|%');
  check('stat "Vel. construcción +|%": total 125 (nv2 = 1.25%) count 1',
    !!vel && vel.total === 125 && vel.count === 1 && vel.unit === '%', JSON.stringify(vel));
  check('item del stat = "Gemming Duendecillo · Manos ocupadas" nv2',
    vel?.skills[0]?.petName === p59.name && vel?.skills[0]?.skillName === SKILL_DEFS[3]!.name && vel?.skills[0]?.level === 2, JSON.stringify(vel?.skills));
  check('keys con formato name|unit (igual que investigación/talentos)',
    st59.every(s => s.key === `${s.name}|${s.unit}`));

  const p33 = FAMILIAR_DEFS[33]!;
  const fam33 = {
    pets: [{
      petId: 33, level: 1, exp: 0, stage: 0, flags: 0,
      skills: p33.skills.map(() => ({ level: 1, exp: 0 })),
    }],
    talents: [],
  };
  const st33 = computeFamiliarStats(fam33);
  const exec = st33.find(s => s.key === 'Reduce tiempo espera ejecución en|minutos');
  check('skill73 segundos→minutos: 1800 s = 30 min (unit "minutos")',
    !!exec && exec.total === 30 && exec.unit === 'minutos' && exec.skills[0]?.value === 30, JSON.stringify(exec));

  // Suma con investigación: tech6 effect248 valores [100,...] (nv1 = 1%) + familiar nv2 (1.25%) = 225
  const rl = [0, 0, 0, 0, 0, 1];
  const rKeys = computeResearchStats(rl).map(r => r.key);
  check('research comparte key con familiar (Vel. construcción +|%)', rKeys.includes('Vel. construcción +|%'), JSON.stringify(rKeys));
  const merged = computePlayerStats({ research: { techLevels: rl }, familiars: fam59 });
  const velM = merged.find(s => s.name === 'Vel. construcción +' && s.unit === '%');
  check('playerStats suma research+familiar: 100+125=225',
    !!velM && velM.total === 225, JSON.stringify(velM));
  check('contribuciones: research + Monstruitos',
    !!velM && velM.contributions.map(c => c.source).join(',') === 'research,familiar'
    && velM.contributions[1]?.label === 'Monstruitos', JSON.stringify(velM?.contributions.map(c => c.label)));

  // Fixture B real: las pasivas de los 33 pets generan stats con keys válidas
  const fsB = computeFamiliarStats({ pets: b, talents: t ?? [] });
  check('fixture B: stats de monstruitos no vacíos', fsB.length > 0, 'got ' + fsB.length);
  check('fixture B: keys name|unit', fsB.every(s => s.key === `${s.name}|${s.unit}`));
}

if (t) {
  const views2 = buildFamiliarViews({ pets: b, talents: t });
  const allViewSkills = views2.flatMap(v => v.skills.filter(s => s.id > 0));
  check('views: toda pasiva lleva effectText/values en la vista',
    allViewSkills.filter(s => s.type === 'passive').every(s => !!s.effectText && !!s.values),
    JSON.stringify(allViewSkills.filter(s => s.type === 'passive' && !s.effectText).slice(0, 3)));
  check('views: toda skill lleva type', allViewSkills.every(s => s.type === 'passive' || s.type === 'active'));
}

// --- 8231: cooldown de skills activas (fixture real: 1er paquete de la cuenta
//     1035379223 el 2026-09-29, burst que confirmó use = availableAt - CD[nivel]*60) ---
const HEX_8231 = '0b4500d377be6a00000000470014eebc6a0000000048002d426d6a000000004a00c012876a000000004c00ac046a6a000000004d00feb9bd6a000000004e00e62b406a000000005100ff7bbf6a00000000520068b8c06a00000000550081996169000000005800d89e496a00000000'; // count=11, len=111
{
  const cds = parse8231(hex(HEX_8231));
  check('8231 count=11', !!cds && cds.length === 11, cds ? 'got ' + cds.length : 'null');
  check('8231 length ancla 1+count*10', HEX_8231.length / 2 === 1 + 11 * 10);
  const byId = new Map((cds ?? []).map(c => [c.skillId, c.availableAt]));
  check('8231 s69 availableAt=1790867411 (burst 15:10:11Z)', byId.get(69) === 1790867411, 'got ' + byId.get(69));
  check('8231 s71 availableAt=1790766612 (burst 15:10:12Z)', byId.get(71) === 1790766612, 'got ' + byId.get(71));
  check('8231 s77 availableAt=1790818814 (burst 15:10:14Z)', byId.get(77) === 1790818814, 'got ' + byId.get(77));
  check('8231 s81 availableAt=1790934015 (burst 15:10:15Z)', byId.get(81) === 1790934015, 'got ' + byId.get(81));
  check('8231 s82 availableAt=1791015016 (burst 15:10:16Z)', byId.get(82) === 1791015016, 'got ' + byId.get(82));
  check('8231 todos los availableAt > 0', (cds ?? []).every(c => c.availableAt > 0));

  // Casos borde
  check('8231 count=0 → []', JSON.stringify(parse8231(Buffer.alloc(1))) === '[]');
  check('8231 null con body vacío', parse8231(Buffer.alloc(0)) === null);
  check('8231 null con count inflado', parse8231(Buffer.from('ff', 'hex')) === null);
  check('8231 null con bytes de menos', parse8231(hex(HEX_8231).subarray(0, 110)) === null);
  check('8231 null con bytes de más', parse8231(Buffer.concat([hex(HEX_8231), Buffer.from([0])])) === null);

  // Merge monotónico del handler: un stale del servidor no baja el availableAt
  const logLines: string[] = [];
  const fake = {
    familiars: { pets: [], talents: [], cooldowns: [{ skillId: 69, availableAt: 1790867411 }] },
    bot: { log: (m: string) => logLines.push(m) },
    emit: () => undefined,
  } as unknown as BotInstance;
  handle8231(fake, Buffer.from('014500' + (1790000000).toString(16).padStart(8, '0').match(/../g)!.reverse().join('') + '00000000', 'hex'));
  check('8231 merge monotónico: stale (menor) no baja', fake.familiars?.cooldowns?.[0]?.availableAt === 1790867411,
    JSON.stringify(fake.familiars?.cooldowns));
  handle8231(fake, Buffer.from('014500' + (1790999999).toString(16).padStart(8, '0').match(/../g)!.reverse().join('') + '00000000', 'hex'));
  check('8231 merge: uso nuevo (mayor) sube', fake.familiars?.cooldowns?.[0]?.availableAt === 1790999999,
    JSON.stringify(fake.familiars?.cooldowns));
  check('8231 handler loguea cambio de CD', logLines.some(l => l.includes('CD → lista')), JSON.stringify(logLines));
}

// --- 8230: fatiga (fixture real: fatigue 0 / max 45 / reset epoch) ---
{
  const f = parse8230(hex('00002d00807e966a00000000'));
  check('8230 fatigue=0 max=45 resetAt=1788247680', !!f && f.fatigue === 0 && f.max === 45 && f.resetAt === 1788247680, JSON.stringify(f));
  check('8230 null con longitud ≠ 12', parse8230(Buffer.alloc(11)) === null && parse8230(Buffer.alloc(13)) === null);
}

// --- 8232: buffs activos (fixture real: skill89 nv10, dur 21600 s) ---
{
  const buffs = parse8232(hex('0000000000000000000000000159000aeae29a6a0000000060540000'));
  check('8232 count=1 skill89 nv10', !!buffs && buffs.length === 1 && buffs[0]!.skillId === 89 && buffs[0]!.level === 10, JSON.stringify(buffs));
  check('8232 startTs=1788535530 dur=21600', !!buffs && buffs[0]!.startTs === 1788535530 && buffs[0]!.durationSec === 21600, JSON.stringify(buffs?.[0]));
  const empty = parse8232(Buffer.alloc(13));
  check('8232 count=0 → []', JSON.stringify(empty) === '[]');
  check('8232 null con header corto', parse8232(Buffer.alloc(12)) === null);
  check('8232 null con bytes de menos', parse8232(hex('0000000000000000000000000159000aeae29a6a000000006054')) === null);
}

// --- 8227: respuesta del uso de skill (fixtures reales) ---
{
  const ok = parse8227(hex('001d004700423ac26a0000000000000000'));
  check('8227 éxito: result=0 pet29 skill71', !!ok && ok.result === 0 && ok.petId === 29 && ok.skillId === 71, JSON.stringify(ok));
  check('8227 éxito: availableAt=0x6ac23a42', !!ok && ok.availableAt === 0x6ac23a42, String(ok?.availableAt));
  const ko = parse8227(hex('0600000000000000000000000000000000'));
  check('8227 rechazo: result=6 sin eco de pet/skill', !!ko && ko.result === 6 && ko.petId === 0 && ko.skillId === 0, JSON.stringify(ko));
  check('8227 null con body corto', parse8227(Buffer.alloc(4)) === null);

  const logLines: string[] = [];
  const fake = {
    familiars: { pets: [], talents: [], cooldowns: [{ skillId: 71, availableAt: 1790000000 }] },
    bot: { log: (m: string) => logLines.push(m) },
    emit: () => undefined,
  } as unknown as BotInstance;
  handle8227(fake, hex('001d004700423ac26a0000000000000000'));
  check('8227 handler: guarda el CD nuevo', fake.familiars?.cooldowns?.[0]?.availableAt === 0x6ac23a42,
    JSON.stringify(fake.familiars?.cooldowns));
  check('8227 handler loguea el uso', logLines.some(l => l.includes('usada')), JSON.stringify(logLines));
  handle8227(fake, hex('0600000000000000000000000000000000'));
  check('8227 handler: el rechazo no toca el CD', fake.familiars?.cooldowns?.[0]?.availableAt === 0x6ac23a42,
    JSON.stringify(fake.familiars?.cooldowns));
  check('8227 handler loguea el rechazo', logLines.some(l => l.includes('rechazado')), JSON.stringify(logLines));
}

(async () => {
  // --- config familiarSkills ---
  {
    const def = defaultBotConfig('');
    check('config default: familiarSkills deshabilitado',
      def.familiarSkills.enable === false && def.familiarSkills.pets.length === 0, JSON.stringify(def.familiarSkills));
    const legacy = getFamiliarSkillsConfig({} as any);
    check('config getter tolera configs viejas (sin la sección)',
      legacy.enable === false && legacy.pets.length === 0, JSON.stringify(legacy));
    const filtered = getFamiliarSkillsConfig({ familiarSkills: { enable: true, pets: [29, -1, 'x', 0] } } as any);
    check('config getter filtra ids inválidos',
      filtered.enable === true && JSON.stringify(filtered.pets) === '[29]', JSON.stringify(filtered));
  }

  // --- FamiliarSkillsAction: dispara la skill activa que está lista ---
  {
    const sent: { proto: number; body: string; seq: boolean }[] = [];
    const logs: string[] = [];
    // pet 29 Aquarion: skills [32 pasiva, 71 activa, 0, 0]
    const pet29 = {
      petId: 29, level: 40, exp: 0, stage: 1, flags: 0,
      skills: [{ level: 4, exp: 0 }, { level: 4, exp: 0 }, { level: 1, exp: 0 }, { level: 1, exp: 0 }],
    };
    const make = (cooldowns: { skillId: number; availableAt: number }[], enable = true) =>
      ({
        config: { familiarSkills: { enable, pets: [29] } },
        familiars: { pets: [pet29], talents: [], cooldowns },
        playerInfo: { castleX: 502, castleY: 892 },
        bot: {
          isOnline: true,
          log: (m: string) => logs.push(m),
          sendCommandPacket: (proto: number, body: Buffer, seq: boolean) => sent.push({ proto, body: body.toString('hex'), seq }),
        },
      }) as unknown as BotInstance;

    check('acción: envía el 8226 con la skill activa lista',
      (await new FamiliarSkillsAction().execute(make([]))) === true && sent.length === 1 && sent[0]!.proto === 8226,
      JSON.stringify(sent));
    check('acción: body = coord(502,892) + pet29 + skill71 (la pasiva 32 no se dispara)',
      sent[0]?.body === '7f03cb1d004700', sent[0]?.body);
    check('acción: va con seq', sent[0]?.seq === true, JSON.stringify(sent[0]));

    check('acción: no envía si la skill tiene cooldown',
      (await new FamiliarSkillsAction().execute(make([{ skillId: 71, availableAt: 0x7fffffff }]))) === false && sent.length === 1,
      JSON.stringify(sent));
    check('acción: no hace nada si está deshabilitada',
      (await new FamiliarSkillsAction().execute(make([], false))) === false && sent.length === 1,
      JSON.stringify(sent));
    check('acción: no hace nada sin monstruitos cargados',
      (await new FamiliarSkillsAction().execute({ ...make([]), familiars: undefined } as any)) === false && sent.length === 1,
      JSON.stringify(sent));
    check('acción: loguea el envío', logs.some(l => l.includes('8226 enviado')), JSON.stringify(logs));
  }

  // --- 8226: el prefijo es encodeCoord(castillo emisor) — contra capturas reales ---
  {
    const b = (x: number, y: number, pet: number, skill: number) =>
      buildUseFamiliarSkillBody(pet, skill, { x, y }).toString('hex');
    check('8226 body: captura 370263 (230,566) pet29 skill71',
      b(230, 566, 29, 71) === '3702631d004700', b(230, 566, 29, 71));
    check('8226 body: captura 370263 (230,566) pet53 skill69',
      b(230, 566, 53, 69) === '37026335004500', b(230, 566, 53, 69));
    check('8226 body: captura 2702d5 (235,557) pet29 skill71',
      b(235, 557, 29, 71) === '2702d51d004700', b(235, 557, 29, 71));
    check('8226 body: captura ab03f1 (355,943) pet54 skill72',
      b(355, 943, 54, 72) === 'ab03f136004800', b(355, 943, 54, 72));
  }

  console.log('---');
  console.log(pass + ' pass, ' + fail + ' fail');
  process.exit(fail > 0 ? 1 : 0);
})();
