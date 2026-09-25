'use strict';

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ FAIL: ${msg}`); }
}

const HEADER_SEP = 5;
const HEADER_NAME = 13;
const HEADER_TAG = 3;
const DATA_START = 31;

const LINE_TYPE_ATTACK = 5;
const LINE_TYPE_SCOUT = 8;

function readCString(buf, offset, len) {
  let end = offset;
  const max = offset + len;
  while (end < max && buf[end] !== 0) end++;
  return buf.toString('ascii', offset, end);
}

function parseMarch(body) {
  if (body.length < HEADER_SEP + HEADER_NAME + HEADER_TAG) {
    return null;
  }

  const lineType = body[0];
  const attackerName = readCString(body, HEADER_SEP, HEADER_NAME);
  const guildTag = readCString(body, HEADER_SEP + HEADER_NAME, HEADER_TAG);

  if (lineType !== LINE_TYPE_ATTACK) {
    return { lineType, attackerName, guildTag, totalTroops: 0, heroCount: 0, troops: [], heroes: [], scout: true };
  }

  if (body.length < DATA_START + 20) {
    return null;
  }

  const totalTroops = body.readUInt32LE(23);
  const heroCount = body[27];

  const troops = [];
  let offset = DATA_START;
  for (let i = 0; i < 16; i++) {
    troops.push(body.readUInt32LE(offset + i * 4));
  }

  return { lineType, attackerName, guildTag, totalTroops, heroCount, troops, heroes: [], scout: false };
}

// ── Scout packet (the failing one) ──
const SCOUT_BODY = Buffer.from('0819610289506176656c37373737000d36284c2f505c0c3405', 'hex');

console.log('=== 2446 Scout Packet Tests ===');
console.log(`\nPacket: Len=29 body=${SCOUT_BODY.toString('hex')}`);

const scoutResult = parseMarch(SCOUT_BODY);

assert(scoutResult !== null, 'scout packet parses without error');
assert(scoutResult.scout === true, 'detected as scout (not attack)');
assert(scoutResult.lineType === 8, `lineType = ${scoutResult.lineType} (SCOUT=8)`);
assert(scoutResult.attackerName === 'Pavel7777', `attackerName = "${scoutResult.attackerName}"`);
assert(scoutResult.guildTag === 'L/P', `guildTag = "${scoutResult.guildTag}"`);
assert(scoutResult.totalTroops === 0, `totalTroops = 0 (scout has no troops)`);
assert(scoutResult.heroCount === 0, `heroCount = 0`);
assert(scoutResult.troops.length === 0, `troops array is empty`);

// ── Verify old attack format still works ──
console.log('\n=== 2446 Attack Packet Tests ===');

const attackBody = Buffer.alloc(160);
attackBody[0] = 0x05; // LINE_TYPE_ATTACK
attackBody.write('New Genesis', 5, 'ascii');
attackBody.write('uFO', 18, 'ascii');
attackBody.writeUInt32LE(1, 23);
attackBody[27] = 0;
attackBody[28] = 0x08;
attackBody.writeUInt32LE(100, 43);

const attackResult = parseMarch(attackBody);

assert(attackResult !== null, 'attack packet parses without error');
assert(attackResult.scout === false, 'detected as attack (not scout)');
assert(attackResult.lineType === 5, `lineType = ${attackResult.lineType} (ATTACK=5)`);
assert(attackResult.attackerName === 'New Genesis', `attackerName = "${attackResult.attackerName}"`);
assert(attackResult.guildTag === 'uFO', `guildTag = "${attackResult.guildTag}"`);
assert(attackResult.totalTroops === 1, `totalTroops = ${attackResult.totalTroops}`);
assert(attackResult.troops.length === 16, `troops has ${attackResult.troops.length} entries`);
assert(attackResult.troops[15] === 100, `infantry T4 count = ${attackResult.troops[15]}`);

// ── Error: too short ──
console.log('\n=== Error Handling ===');
const tooShort = parseMarch(Buffer.alloc(5));
assert(tooShort === null, 'returns null for body < 21 bytes');

// ── Simulate handler behavior ──
console.log('\n=== Handler Simulation ===');

function simulateHandler(body) {
  const parsed = parseMarch(body);
  if (!parsed) return 'NO_Parse';
  if (parsed.scout) return `SCOUT: ${parsed.attackerName} [${parsed.guildTag}]`;
  return `ATTACK: ${parsed.attackerName} [${parsed.guildTag}] ${parsed.totalTroops} troops, ${parsed.heroCount} heroes`;
}

assert(simulateHandler(SCOUT_BODY) === 'SCOUT: Pavel7777 [L/P]', 'handler handles scout correctly');
assert(simulateHandler(attackBody) === 'ATTACK: New Genesis [uFO] 1 troops, 0 heroes', 'handler handles attack correctly');
assert(simulateHandler(Buffer.alloc(5)) === 'NO_Parse', 'handler handles too-short packet');

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
