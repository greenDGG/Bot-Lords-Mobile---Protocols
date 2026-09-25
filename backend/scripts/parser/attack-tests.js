'use strict';

/**
 * Attack packet parser tests.
 *
 * Uses two real captured packets to validate every known field.
 * Unknown fields are tested for existence and byte preservation only.
 */

const { parse, hexToBytes, bytesToHex, extractName } = require('./attack-parser');

// ---------------------------------------------------------------------------
// Real captured packets (both 377 bytes)
// ---------------------------------------------------------------------------

// Packet 1: attacker "AKIIATbIR" (kingdom 1332 → kingdom 1231)
const PACKET_AKIIATBIR =
  '0142000000eea7aa6a0000000057005202e1080134054c2f50414b4949415462495200135700cf0475464f4e65772047656e6573697300c50300000000000000000000000000000000000000000400050100051400051100050200040000000000000000b728d7010000000007000000fbbe1a3e000061020ab81c5e0000000000a0570d003e9d0200000000005202e182f706010000000078802e00db820e000000000000000000000000000000000000000000000000003c690c010f013b2000010d03011400000001000000000501000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000150017001b0029002a000a0a0a050405000300000000000000090900000000000000000000000000040100000000';

// Packet 2: attacker "I Love Ado" (kingdom 1231 → kingdom 1231)
const PACKET_LOVEADO =
  '0d4200000007c2aa6a0000000057005202e10801cf0400000049204c6f76652041646f005700cf0475464f4e65772047656e65736973009c0300000000000000000000000000000000000000000400050100051400051100050200040000000000000000ee66d70100000000070000002356753000005202d140fc20000000000060d8030090ea0000000000005202e1d4453a00000000007c251100e34202000000000027000000270000000000000000000000000000003c2900010e003b2000010d000114000000010000000500010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001700230003001b000000060a0a010005000300000000000000090900000000000000000000000000040100000000';

// ---------------------------------------------------------------------------
// Test framework (minimal, no dependencies)
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const errors = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`FAIL: ${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`);
  }
}

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    errors.push({ name, error: e.message });
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message.split('\n').join('\n    ')}`);
  }
}

// Helper: byte-reconstruct a parsed result and compare to original hex
function verifyReconstruction(result, originalHex) {
  const r = result.raw;
  const reconstructed =
    r.unknownPrefix1 + r.separator1 +
    r.timestamp +
    r.separator2 + r.unknownPrefix2 +
    r.attackerKingdom + r.enemyGuildTag + r.attackerNameRaw +
    r.defenderKingdom + r.myGuildTag + r.defenderNameRaw +
    r.unknownBlock1 +
    r.enemyLocation + r.enemyPowerLost + r.separator3 +
    r.enemyTroopsSent + r.enemyTroopsDefeated + r.separator4 +
    r.myLocation + r.myPowerLost + r.separator5 +
    r.myTotalTroops + r.myTroopsDefeated +
    r.unknownBlock2 +
    r.attackerLevel + r.unknownLevelField1 +
    r.attackerVipLevel + r.unknownLevelField2 +
    r.defenderLevel + r.unknownLevelField3 +
    r.defenderVipLevel + r.unknownLevelField4 +
    (r.unknownFinalBlock || '');

  assertEqual(reconstructed, originalHex, 'byte reconstruction');
}

// ---------------------------------------------------------------------------
// Tests — Packet 1: AKIIATbIR
// ---------------------------------------------------------------------------

console.log('=== Attack Packet Parser Tests ===\n');

console.log('Packet 1: AKIIATbIR');

console.log('\nPacket integrity:');
test('packet is 377 bytes', () => {
  assertEqual(PACKET_AKIIATBIR.length / 2, 377, 'packet byte count');
});

test('parser returns no error', () => {
  const result = parse(PACKET_AKIIATBIR);
  assert(!result.error, 'Should not have error: ' + result.error);
});

test('packetSize matches', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.packetSize, 377, 'packetSize');
});

console.log('\nTimestamp:');
test('timestamp raw hex is eea7aa6a', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.timestamp.raw, 'eea7aa6a', 'timestamp hex');
});

test('timestamp uint32 LE = 1789569006', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.timestamp.value, 1789569006, 'timestamp uint32 LE');
});

console.log('\nKingdoms:');
test('attacker kingdom uint16 LE = 1332', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.attacker.kingdom, 1332, 'attacker kingdom value');
});

test('defender kingdom uint16 LE = 1231', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.defender.kingdom, 1231, 'defender kingdom value');
});

console.log('\nGuild tags:');
test('enemy guild tag = L/P', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.attacker.guildTag, 'L/P', 'enemy guild tag');
});

test('my guild tag = uFO', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.defender.guildTag, 'uFO', 'my guild tag');
});

console.log('\nNames:');
test('attacker name = AKIIATbIR', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.attacker.name, 'AKIIATbIR', 'attacker name');
});

test('defender name = New Genesis', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.defender.name, 'New Genesis', 'defender name');
});

console.log('\nEnemy battle stats:');
test('enemy location raw = 61020a', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.enemyStats.location, '61020a', 'enemy location');
});

test('enemy power lost = 6167736', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.enemyStats.powerLost, 6167736, 'enemy power lost');
});

test('enemy troops sent = 874400', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.enemyStats.troopsSent, 874400, 'enemy troops sent');
});

test('enemy troops defeated = 171326', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.enemyStats.troopsDefeated, 171326, 'enemy troops defeated');
});

test('separator3 = 00000000', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.enemyStats.separator, '00000000', 'separator3');
});

test('separator4 = 00000000', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.enemyStats.separatorEnd, '00000000', 'separator4');
});

console.log('\nDefender battle stats:');
test('my location raw = 5202e1', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.defenderStats.location, '5202e1', 'my location');
});

test('my power lost = 17233794', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.defenderStats.powerLost, 17233794, 'my power lost');
});

test('my total troops = 3047544', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.defenderStats.totalTroops, 3047544, 'my total troops');
});

test('my troops defeated = 951003', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.defenderStats.troopsDefeated, 951003, 'my troops defeated');
});

test('separator5 = 00000000', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.defenderStats.separator, '00000000', 'separator5');
});

console.log('\nLevels:');
test('attacker level = 60', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.levels.attackerLevel, 60, 'attacker level');
});

test('attacker VIP = 15', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.levels.attackerVipLevel, 15, 'attacker VIP');
});

test('defender level = 59', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.levels.defenderLevel, 59, 'defender level');
});

test('defender VIP = 13', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.levels.defenderVipLevel, 13, 'defender VIP');
});

test('unknownLevelField1 = 690c01', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.levels.unknownField1, '690c01', 'unknownLevelField1');
});

test('unknownLevelField4 = 03', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.levels.unknownField4, '03', 'unknownLevelField4');
});

console.log('\nUnknown blocks:');
test('unknownBlock1 is 124 hex chars (62 bytes)', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.unknownBlock1.length, 124, 'unknownBlock1 hex length');
});

test('unknownBlock2 is 48 hex chars (24 bytes)', () => {
  const result = parse(PACKET_AKIIATBIR);
  assertEqual(result.unknownBlock2.length, 48, 'unknownBlock2 hex length');
});

test('unknownFinalBlock is 362 hex chars (181 bytes)', () => {
  const result = parse(PACKET_AKIIATBIR);
  assert(result.unknownFinalBlock, 'Should have unknownFinalBlock');
  assertEqual(result.unknownFinalBlock.length, 362, 'unknownFinalBlock hex length');
});

console.log('\nByte preservation:');
test('reconstructed packet matches original', () => {
  const result = parse(PACKET_AKIIATBIR);
  verifyReconstruction(result, PACKET_AKIIATBIR);
});

// ---------------------------------------------------------------------------
// Tests — Packet 2: I Love Ado
// ---------------------------------------------------------------------------

console.log('\n\nPacket 2: I Love Ado');

console.log('\nPacket integrity:');
test('packet is 377 bytes', () => {
  assertEqual(PACKET_LOVEADO.length / 2, 377, 'packet byte count');
});

test('parser returns no error', () => {
  const result = parse(PACKET_LOVEADO);
  assert(!result.error, 'Should not have error: ' + result.error);
});

console.log('\nTimestamp:');
test('timestamp raw hex is 07c2aa6a', () => {
  const result = parse(PACKET_LOVEADO);
  assertEqual(result.timestamp.raw, '07c2aa6a', 'timestamp hex');
});

console.log('\nKingdoms:');
test('attacker kingdom = 1231 (same kingdom)', () => {
  const result = parse(PACKET_LOVEADO);
  assertEqual(result.attacker.kingdom, 1231, 'attacker kingdom');
});

test('defender kingdom = 1231 (same kingdom)', () => {
  const result = parse(PACKET_LOVEADO);
  assertEqual(result.defender.kingdom, 1231, 'defender kingdom');
});

console.log('\nGuild tags:');
test('enemy guild tag = null guild (000000)', () => {
  const result = parse(PACKET_LOVEADO);
  const raw = result.raw.enemyGuildTag;
  assertEqual(raw, '000000', 'enemy guild tag raw is null bytes');
});

test('my guild tag = uFO', () => {
  const result = parse(PACKET_LOVEADO);
  assertEqual(result.defender.guildTag, 'uFO', 'my guild tag');
});

console.log('\nNames:');
test('attacker name = I Love Ado', () => {
  const result = parse(PACKET_LOVEADO);
  assertEqual(result.attacker.name, 'I Love Ado', 'attacker name');
});

test('defender name = New Genesis', () => {
  const result = parse(PACKET_LOVEADO);
  assertEqual(result.defender.name, 'New Genesis', 'defender name');
});

console.log('\nEnemy battle stats:');
test('enemy location raw = 5202d1', () => {
  const result = parse(PACKET_LOVEADO);
  assertEqual(result.enemyStats.location, '5202d1', 'enemy location');
});

test('enemy power lost = 2161728', () => {
  const result = parse(PACKET_LOVEADO);
  assertEqual(result.enemyStats.powerLost, 2161728, 'enemy power lost');
});

test('enemy troops sent = 252000', () => {
  const result = parse(PACKET_LOVEADO);
  assertEqual(result.enemyStats.troopsSent, 252000, 'enemy troops sent');
});

test('enemy troops defeated = 60048', () => {
  const result = parse(PACKET_LOVEADO);
  assertEqual(result.enemyStats.troopsDefeated, 60048, 'enemy troops defeated');
});

test('separator3 = 00000000', () => {
  const result = parse(PACKET_LOVEADO);
  assertEqual(result.enemyStats.separator, '00000000', 'separator3');
});

test('separator4 = 00000000', () => {
  const result = parse(PACKET_LOVEADO);
  assertEqual(result.enemyStats.separatorEnd, '00000000', 'separator4');
});

console.log('\nDefender battle stats:');
test('my location raw = 5202e1 (same castle)', () => {
  const result = parse(PACKET_LOVEADO);
  assertEqual(result.defenderStats.location, '5202e1', 'my location');
});

test('my power lost = 3818964', () => {
  const result = parse(PACKET_LOVEADO);
  assertEqual(result.defenderStats.powerLost, 3818964, 'my power lost');
});

test('my total troops = 1123708', () => {
  const result = parse(PACKET_LOVEADO);
  assertEqual(result.defenderStats.totalTroops, 1123708, 'my total troops');
});

test('my troops defeated = 148195', () => {
  const result = parse(PACKET_LOVEADO);
  assertEqual(result.defenderStats.troopsDefeated, 148195, 'my troops defeated');
});

test('separator5 = 00000000', () => {
  const result = parse(PACKET_LOVEADO);
  assertEqual(result.defenderStats.separator, '00000000', 'separator5');
});

console.log('\nLevels:');
test('attacker level = 60', () => {
  const result = parse(PACKET_LOVEADO);
  assertEqual(result.levels.attackerLevel, 60, 'attacker level');
});

test('attacker VIP = 14', () => {
  const result = parse(PACKET_LOVEADO);
  assertEqual(result.levels.attackerVipLevel, 14, 'attacker VIP');
});

test('defender level = 59', () => {
  const result = parse(PACKET_LOVEADO);
  assertEqual(result.levels.defenderLevel, 59, 'defender level');
});

test('defender VIP = 13', () => {
  const result = parse(PACKET_LOVEADO);
  assertEqual(result.levels.defenderVipLevel, 13, 'defender VIP');
});

test('unknownLevelField1 = 290001', () => {
  const result = parse(PACKET_LOVEADO);
  assertEqual(result.levels.unknownField1, '290001', 'unknownLevelField1');
});

test('unknownLevelField4 = 00', () => {
  const result = parse(PACKET_LOVEADO);
  assertEqual(result.levels.unknownField4, '00', 'unknownLevelField4');
});

console.log('\nByte preservation:');
test('reconstructed packet matches original', () => {
  const result = parse(PACKET_LOVEADO);
  verifyReconstruction(result, PACKET_LOVEADO);
});

// ---------------------------------------------------------------------------
// Cross-packet structural tests
// ---------------------------------------------------------------------------

console.log('\n\nCross-packet structural tests:');

test('both packets have same total size (377 bytes)', () => {
  assertEqual(PACKET_AKIIATBIR.length, PACKET_LOVEADO.length, 'hex length');
});

test('both packets have same unknownBlock1 size', () => {
  const r1 = parse(PACKET_AKIIATBIR);
  const r2 = parse(PACKET_LOVEADO);
  assertEqual(r1.unknownBlock1.length, r2.unknownBlock1.length, 'UB1 size');
});

test('both packets have same unknownBlock2 size', () => {
  const r1 = parse(PACKET_AKIIATBIR);
  const r2 = parse(PACKET_LOVEADO);
  assertEqual(r1.unknownBlock2.length, r2.unknownBlock2.length, 'UB2 size');
});

test('both packets have same unknownFinalBlock size', () => {
  const r1 = parse(PACKET_AKIIATBIR);
  const r2 = parse(PACKET_LOVEADO);
  assertEqual(r1.unknownFinalBlock.length, r2.unknownFinalBlock.length, 'final block size');
});

test('both packets have same level structure offsets', () => {
  const r1 = parse(PACKET_AKIIATBIR);
  const r2 = parse(PACKET_LOVEADO);
  assertEqual(r1.levels.unknownField3, r2.levels.unknownField3, 'unknownLevelField3 = 200001 in both');
});

test('both packets have same separator3 = 00000000', () => {
  const r1 = parse(PACKET_AKIIATBIR);
  const r2 = parse(PACKET_LOVEADO);
  assertEqual(r1.enemyStats.separator, '00000000', 'P1 separator3');
  assertEqual(r2.enemyStats.separator, '00000000', 'P2 separator3');
});

test('both packets have same separator5 = 00000000', () => {
  const r1 = parse(PACKET_AKIIATBIR);
  const r2 = parse(PACKET_LOVEADO);
  assertEqual(r1.defenderStats.separator, '00000000', 'P1 separator5');
  assertEqual(r2.defenderStats.separator, '00000000', 'P2 separator5');
});

test('both defenders have same name = New Genesis', () => {
  const r1 = parse(PACKET_AKIIATBIR);
  const r2 = parse(PACKET_LOVEADO);
  assertEqual(r1.defender.name, 'New Genesis', 'P1 defender');
  assertEqual(r2.defender.name, 'New Genesis', 'P2 defender');
});

test('both defenders have same location = 5202e1', () => {
  const r1 = parse(PACKET_AKIIATBIR);
  const r2 = parse(PACKET_LOVEADO);
  assertEqual(r1.defenderStats.location, '5202e1', 'P1 myLocation');
  assertEqual(r2.defenderStats.location, '5202e1', 'P2 myLocation');
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

console.log('\n\nError handling:');
test('returns error for too-short packet', () => {
  const result = parse('01420000');
  assert(result.error, 'Should have error');
  assert(result.error.includes('too short'), 'Error mentions too short');
});

test('returns error for empty string', () => {
  const result = parse('');
  assert(result.error, 'Should have error');
});

// ---------------------------------------------------------------------------
// extractName helper
// ---------------------------------------------------------------------------

console.log('\nextractName helper:');
test('extractName handles AKIIATbIR', () => {
  const raw = hexToBytes('414b4949415462495200135700');
  const result = extractName(raw);
  assertEqual(result.ascii, 'AKIIATbIR', 'ASCII portion');
  assertEqual(result.trailingHex, '00135700', 'trailing bytes');
});

test('extractName handles New Genesis', () => {
  const raw = hexToBytes('4e65772047656e6573697300c5');
  const result = extractName(raw);
  assertEqual(result.ascii, 'New Genesis', 'ASCII portion');
  assertEqual(result.trailingHex, '00c5', 'trailing bytes');
});

test('extractName handles I Love Ado', () => {
  const raw = hexToBytes('49204c6f76652041646f005700');
  const result = extractName(raw);
  assertEqual(result.ascii, 'I Love Ado', 'ASCII portion');
  assertEqual(result.trailingHex, '005700', 'trailing bytes');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

if (failed > 0) {
  console.log('\nFailed tests:');
  for (const err of errors) {
    console.log(`  ✗ ${err.name}`);
    console.log(`    ${err.error.split('\n').join('\n    ')}`);
  }
  process.exit(1);
}
