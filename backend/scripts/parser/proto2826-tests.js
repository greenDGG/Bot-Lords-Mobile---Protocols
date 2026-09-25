'use strict';

/**
 * Protocol 2826 — Guild Applications Tests
 *
 * Validates parsing of guild join application lists from the server.
 */

const { parse, hexToBytes, bytesToHex, HEADER_SIZE, ENTRY_SIZE } = require('./proto2826-parser');

// ---------------------------------------------------------------------------
// Real captured packets
// ---------------------------------------------------------------------------

// 1 application (Gyaru Squad)
const ONE_ENTRY =
  '04000a0b' + // header (len=4, proto=2826)
  '0001' +     // version = 1
  '01' +       // count = 1
  'a8461d4e' + // userId
  '00000000' + // separator1
  '2200' +     // unknown1
  '47796172752053717561640000' + // name (13 bytes)
  '00' +       // separator2
  'b7f76a0f' + // power
  '00000000' + // separator3
  'b66d5000' + // troopsKilled
  '00000000000000'; // endSeparator

// 2 applications (Gyaru Squad + Ussewa Mood)
const TWO_ENTRIES =
  '5d000a0b' + // header (len=93, proto=2826)
  '0001' +     // version = 1
  '02' +       // count = 2
  // Entry 1
  'a8461d4e' +
  '00000000' +
  '2200' +
  '47796172752053717561640000' +
  '00' +
  'b7f76a0f' +
  '00000000' +
  'b66d5000' +
  '00000000000000' +
  // Entry 2
  '724b8d50' +
  '00000000' +
  '1d00' +
  '557373657761204d6f6f640000' +
  '00' +
  '591ae30a' +
  '00000000' +
  '94bb5300' +
  '00000000000000';

// ---------------------------------------------------------------------------
// Test framework
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

// ---------------------------------------------------------------------------
// Tests — 1 entry
// ---------------------------------------------------------------------------

console.log('=== Protocol 2826 Parser Tests ===\n');

console.log('1 entry packet:');

test('parses without error', () => {
  const r = parse(ONE_ENTRY);
  assert(!r.error, r.error);
});

test('packetSize = 50', () => {
  const r = parse(ONE_ENTRY);
  assertEqual(r.packetSize, 50, 'packetSize');
});

test('packetLength = 4', () => {
  const r = parse(ONE_ENTRY);
  assertEqual(r.packetLength, 4, 'packetLength');
});

test('proto = 2826', () => {
  const r = parse(ONE_ENTRY);
  assertEqual(r.proto, 2826, 'proto');
});

test('version raw hex = 0001', () => {
  const r = parse(ONE_ENTRY);
  assertEqual(r.raw.versionHex, '0001', 'version hex');
});

test('count = 1', () => {
  const r = parse(ONE_ENTRY);
  assertEqual(r.count, 1, 'count');
});

test('has 1 entry', () => {
  const r = parse(ONE_ENTRY);
  assertEqual(r.entries.length, 1, 'entries length');
});

test('entry 0: userId LE = 1310541480 (0x4e1d46a8)', () => {
  const r = parse(ONE_ENTRY);
  assertEqual(r.entries[0].userId, 1310541480, 'userId');
});

test('entry 0: userIdHex = a8461d4e', () => {
  const r = parse(ONE_ENTRY);
  assertEqual(r.entries[0].userIdHex, 'a8461d4e', 'userIdHex');
});

test('entry 0: separator1 = 00000000', () => {
  const r = parse(ONE_ENTRY);
  assertEqual(r.entries[0].separator1, '00000000', 'separator1');
});

test('entry 0: unknown1 = 0x2200 (34)', () => {
  const r = parse(ONE_ENTRY);
  assertEqual(r.entries[0].unknown1, 34, 'unknown1');
});

test('entry 0: unknown1Hex = 2200', () => {
  const r = parse(ONE_ENTRY);
  assertEqual(r.entries[0].unknown1Hex, '2200', 'unknown1Hex');
});

test('entry 0: name = Gyaru Squad', () => {
  const r = parse(ONE_ENTRY);
  assertEqual(r.entries[0].name, 'Gyaru Squad', 'name');
});

test('entry 0: nameRaw = 47796172752053717561640000', () => {
  const r = parse(ONE_ENTRY);
  assertEqual(r.entries[0].nameRaw, '47796172752053717561640000', 'nameRaw');
});

test('entry 0: separator2 = 00', () => {
  const r = parse(ONE_ENTRY);
  assertEqual(r.entries[0].separator2, '00', 'separator2');
});

test('entry 0: power LE = 258668471 (0x0f6af7b7)', () => {
  const r = parse(ONE_ENTRY);
  assertEqual(r.entries[0].power, 258668471, 'power');
});

test('entry 0: powerHex = b7f76a0f', () => {
  const r = parse(ONE_ENTRY);
  assertEqual(r.entries[0].powerHex, 'b7f76a0f', 'powerHex');
});

test('entry 0: separator3 = 00000000', () => {
  const r = parse(ONE_ENTRY);
  assertEqual(r.entries[0].separator3, '00000000', 'separator3');
});

test('entry 0: troopsKilled = 5270966', () => {
  const r = parse(ONE_ENTRY);
  assertEqual(r.entries[0].troopsKilled, 5270966, 'troopsKilled');
});

test('entry 0: troopsKilledHex = b66d5000', () => {
  const r = parse(ONE_ENTRY);
  assertEqual(r.entries[0].troopsKilledHex, 'b66d5000', 'troopsKilledHex');
});

test('entry 0: endSeparator = 00000000000000', () => {
  const r = parse(ONE_ENTRY);
  assertEqual(r.entries[0].endSeparator, '00000000000000', 'endSeparator');
});

// ---------------------------------------------------------------------------
// Tests — 2 entries
// ---------------------------------------------------------------------------

console.log('\n2 entries packet:');

test('parses without error', () => {
  const r = parse(TWO_ENTRIES);
  assert(!r.error, r.error);
});

test('packetSize = 93', () => {
  const r = parse(TWO_ENTRIES);
  assertEqual(r.packetSize, 93, 'packetSize');
});

test('packetLength = 0x005d (93)', () => {
  const r = parse(TWO_ENTRIES);
  assertEqual(r.packetLength, 93, 'packetLength');
});

test('count = 2', () => {
  const r = parse(TWO_ENTRIES);
  assertEqual(r.count, 2, 'count');
});

test('has 2 entries', () => {
  const r = parse(TWO_ENTRIES);
  assertEqual(r.entries.length, 2, 'entries length');
});

test('entry 0: name = Gyaru Squad', () => {
  const r = parse(TWO_ENTRIES);
  assertEqual(r.entries[0].name, 'Gyaru Squad', 'entry 0 name');
});

test('entry 0: userId LE = 1310541480', () => {
  const r = parse(TWO_ENTRIES);
  assertEqual(r.entries[0].userId, 1310541480, 'entry 0 userId');
});

test('entry 0: power LE = 258668471', () => {
  const r = parse(TWO_ENTRIES);
  assertEqual(r.entries[0].power, 258668471, 'entry 0 power');
});

test('entry 0: troopsKilled = 5270966', () => {
  const r = parse(TWO_ENTRIES);
  assertEqual(r.entries[0].troopsKilled, 5270966, 'entry 0 troopsKilled');
});

test('entry 1: userId LE = 1351437170', () => {
  const r = parse(TWO_ENTRIES);
  assertEqual(r.entries[1].userId, 1351437170, 'entry 1 userId');
});

test('entry 1: userIdHex = 724b8d50', () => {
  const r = parse(TWO_ENTRIES);
  assertEqual(r.entries[1].userIdHex, '724b8d50', 'entry 1 userIdHex');
});

test('entry 1: unknown1 = 0x1d00 (29)', () => {
  const r = parse(TWO_ENTRIES);
  assertEqual(r.entries[1].unknown1, 29, 'entry 1 unknown1');
});

test('entry 1: unknown1Hex = 1d00', () => {
  const r = parse(TWO_ENTRIES);
  assertEqual(r.entries[1].unknown1Hex, '1d00', 'entry 1 unknown1Hex');
});

test('entry 1: name = Ussewa Mood', () => {
  const r = parse(TWO_ENTRIES);
  assertEqual(r.entries[1].name, 'Ussewa Mood', 'entry 1 name');
});

test('entry 1: nameRaw = 557373657761204d6f6f640000', () => {
  const r = parse(TWO_ENTRIES);
  assertEqual(r.entries[1].nameRaw, '557373657761204d6f6f640000', 'entry 1 nameRaw');
});

test('entry 1: power LE = 182655577', () => {
  const r = parse(TWO_ENTRIES);
  assertEqual(r.entries[1].power, 182655577, 'entry 1 power');
});

test('entry 1: powerHex = 591ae30a', () => {
  const r = parse(TWO_ENTRIES);
  assertEqual(r.entries[1].powerHex, '591ae30a', 'entry 1 powerHex');
});

test('entry 1: troopsKilled LE = 5487508', () => {
  const r = parse(TWO_ENTRIES);
  assertEqual(r.entries[1].troopsKilled, 5487508, 'entry 1 troopsKilled');
});

test('entry 1: troopsKilledHex = 94bb5300', () => {
  const r = parse(TWO_ENTRIES);
  assertEqual(r.entries[1].troopsKilledHex, '94bb5300', 'entry 1 troopsKilledHex');
});

test('entry 1: separator1 = 00000000', () => {
  const r = parse(TWO_ENTRIES);
  assertEqual(r.entries[1].separator1, '00000000', 'entry 1 separator1');
});

test('entry 1: separator2 = 00', () => {
  const r = parse(TWO_ENTRIES);
  assertEqual(r.entries[1].separator2, '00', 'entry 1 separator2');
});

test('entry 1: separator3 = 00000000', () => {
  const r = parse(TWO_ENTRIES);
  assertEqual(r.entries[1].separator3, '00000000', 'entry 1 separator3');
});

test('entry 1: endSeparator = 00000000000000', () => {
  const r = parse(TWO_ENTRIES);
  assertEqual(r.entries[1].endSeparator, '00000000000000', 'entry 1 endSeparator');
});

// ---------------------------------------------------------------------------
// Structural tests
// ---------------------------------------------------------------------------

console.log('\nStructural tests:');

test('ENTRY_SIZE = 43', () => {
  assertEqual(ENTRY_SIZE, 43, 'ENTRY_SIZE');
});

test('HEADER_SIZE = 4', () => {
  assertEqual(HEADER_SIZE, 4, 'HEADER_SIZE');
});

test('total size = HEADER + 3 + (ENTRY_SIZE × count)', () => {
  const r1 = parse(ONE_ENTRY);
  const r2 = parse(TWO_ENTRIES);
  assertEqual(r1.packetSize, HEADER_SIZE + 3 + ENTRY_SIZE * 1, '1 entry size');
  assertEqual(r2.packetSize, HEADER_SIZE + 3 + ENTRY_SIZE * 2, '2 entries size');
});

test('both packets have same version raw hex = 0001', () => {
  const r1 = parse(ONE_ENTRY);
  const r2 = parse(TWO_ENTRIES);
  assertEqual(r1.raw.versionHex, '0001', '1 entry version');
  assertEqual(r2.raw.versionHex, '0001', '2 entries version');
});

test('all separator fields are zero', () => {
  const r = parse(TWO_ENTRIES);
  for (let i = 0; i < r.entries.length; i++) {
    const e = r.entries[i];
    assertEqual(e.separator1, '00000000', `entry ${i} separator1`);
    assertEqual(e.separator2, '00', `entry ${i} separator2`);
    assertEqual(e.separator3, '00000000', `entry ${i} separator3`);
    assertEqual(e.endSeparator, '00000000000000', `entry ${i} endSeparator`);
  }
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

console.log('\nError handling:');

test('returns error for too-short packet', () => {
  const r = parse('0400');
  assert(r.error, 'Should have error');
});

test('returns error for wrong protocol', () => {
  const r = parse('04000b0b');
  assert(r.error, 'Should have error');
  assert(r.error.includes('2826'), 'Error mentions expected proto');
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
