import {
  parseHeroList,
  parseHeroListDetailed,
  formatHeroList,
  serializeHeroes,
} from '../src/bot/models/heroes.types';
import { HERO_DEFS, HERO_IDS, heroName, heroNameEn, heroSkills, heroBattleSkills } from '../src/bot/data/heros-db';
import { HERO_IDS as HERO_IDS_LEGACY, heroName as heroNameLegacy } from '../src/bot/data/hero-ids';

let ok = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'OK  ' : 'FALLA'} ${msg}`);
  if (cond) ok++;
  else process.exitCode = 1;
};

console.log('== heros.json / heros-db ==');
check(Object.keys(HERO_DEFS).length === 95, `95 héroes cargados (${Object.keys(HERO_DEFS).length})`);
check(heroName(1) === 'Guardián', `heroName(1) = ${heroName(1)}`);
check(heroName(5) === 'Prima Donna', `heroName(5) = ${heroName(5)}`);
check(heroName(7) === 'Caballero Letal', `heroName(7) = ${heroName(7)}`);
check(heroName(107) === 'Escudero', `heroName(107) = ${heroName(107)}`);
check(heroName(9999) === 'Héroe #9999', `fallback = ${heroName(9999)}`);
check(heroNameEn(1) === 'Oath Keeper', `heroNameEn(1) = ${heroNameEn(1)}`);
check(heroNameEn(9999) === 'Héroe #9999', `fallback EN = ${heroNameEn(9999)}`);
check(HERO_IDS[1] === 'Guardián' && HERO_IDS_LEGACY[1] === 'Guardián', 'HERO_IDS re-exportado igual en hero-ids');
check(heroNameLegacy(5) === heroName(5), 'heroName re-exportado igual en hero-ids');

console.log('\n== skills y battle skills ==');
check(heroSkills(1).length === 4, `héroe 1 tiene 4 skills (${heroSkills(1).length})`);
check(heroSkills(1)[0].name === 'Onda de choque', `skill 1 = ${heroSkills(1)[0]?.name}`);
check(heroBattleSkills(1).length === 4, `héroe 1 tiene 4 battle skills (${heroBattleSkills(1).length})`);
check(heroBattleSkills(1)[0].name === 'Golpe fatal', `battle skill 1 = ${heroBattleSkills(1)[0]?.name}`);
check(heroBattleSkills(5)[0].name === 'Melodía de la muerte', `héroe 5 battle 1 = ${heroBattleSkills(5)[0]?.name}`);
check(heroSkills(107).length === 0 && heroBattleSkills(107).length === 0, 'héroe 107 sin skills en tablas');
check(heroSkills(9999).length === 0, 'id desconocido => []');

console.log('\n== parse 1201: header 10 / entry 20 ==');
function buildEntry(id: number, level: number, power: number, rank: number, grade: number, entryLen = 20): Buffer {
  const b = Buffer.alloc(entryLen);
  b.writeUInt16LE(id, 0);
  b[2] = level;
  b.writeUInt32LE(power, 3);
  b[7] = rank;
  b[8] = grade;
  b[9] = 0x1f;
  if (entryLen >= 19) b.writeUInt16LE(0x3c3c, 16);
  if (entryLen === 20) b.writeUInt16LE(0x1428, 18);
  return b;
}

function buildBody(entries: Buffer[], headerLen: number): Buffer {
  const head = Buffer.alloc(headerLen);
  head.writeUInt32LE(0x66f6ebfd, 0);
  if (headerLen === 10) head.writeUInt16LE(entries.length, 8);
  else head[8] = entries.length;
  return Buffer.concat([head, ...entries]);
}

const entries = [
  buildEntry(1, 60, 174617, 7, 5),
  buildEntry(5, 58, 120000, 6, 4),
  buildEntry(7, 44, 30000, 5, 3),
];

const body10 = buildBody(entries, 10);
const r10 = parseHeroListDetailed(body10);
check(r10.heroes.length === 3, `3 héroes (${r10.heroes.length})`);
check(r10.layout === 'header 10 / entry 20' && r10.strict, `layout ${r10.layout} strict=${r10.strict}`);
check(r10.heroes[0].heroId === 1 && r10.heroes[0].level === 60 && r10.heroes[0].power === 174617, 'héroe 1 fields');
check(r10.heroes[0].rank === 7 && r10.heroes[0].grade === 5, 'héroe 1 rank/grade');
check(r10.heroes[2].heroId === 7 && r10.heroes[2].level === 44, 'héroe 3 fields');

console.log('\n== parse 1201: header 9 / entry 20 ==');
const body9 = buildBody(entries, 9);
const r9 = parseHeroListDetailed(body9);
check(r9.heroes.length === 3, `3 héroes (${r9.heroes.length})`);
check(r9.layout === 'header 9 / entry 20' && r9.strict, `layout ${r9.layout} strict=${r9.strict}`);
check(r9.heroes[1].heroId === 5 && r9.heroes[1].rank === 6, 'héroe 2 fields');

console.log('\n== parse 1201: header 10 / entry 19 ==');
const body19 = buildBody(entries.map(e => e.subarray(0, 19)), 10);
const r19 = parseHeroListDetailed(body19);
check(r19.heroes.length === 3, `3 héroes (${r19.heroes.length})`);
check(r19.layout === 'header 10 / entry 19', `layout ${r19.layout}`);

console.log('\n== parse 1201: basura ==');
check(parseHeroList(Buffer.alloc(64)).length === 0, 'buffer de ceros => []');
check(parseHeroList(Buffer.alloc(40, 0xff)).length === 0, 'buffer 0xff => []');
check(parseHeroList(Buffer.from('fdebf66800000000', 'hex')).length === 0, 'sólo header => []');

console.log('\n== formato y serialización ==');
const fmt = formatHeroList(r10.heroes);
check(fmt.includes('Guardián') && fmt.includes('nivel 60 rango 7 grado 5'), 'formatHeroList con nombre ES');
const views = serializeHeroes(r10.heroes);
check(views[0].name === 'Guardián' && views[0].nameEn === 'Oath Keeper', 'serializeHeroes nombres');
check(views[0].skills.length === 4 && views[0].battleSkills.length === 4, 'serializeHeroes skills');
check(views[0].battleSkills[0].name === 'Golpe fatal', 'serializeHeroes battle skill');

console.log(`\n${ok} OK, ${process.exitCode ? 'con fallas' : 'sin fallas'}`);
