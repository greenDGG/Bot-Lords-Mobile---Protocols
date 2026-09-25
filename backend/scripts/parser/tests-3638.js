'use strict';

const { parse3638 } = require('./parser-3638');

const EXAMPLE_BODY = 'ff18000208ab87a16a00000000f4240000abe49e6a00000000000000000000000000011ee99e6a00000000012700001fe99e6a0000000002250000';

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`FAIL: ${message}\n  Expected: ${expected}\n  Actual:   ${actual}`);
  }
}

function assertBufferEqual(actual, expected, message) {
  const a = actual.toString('hex');
  const e = expected.toString('hex');
  if (a !== e) {
    throw new Error(`FAIL: ${message}\n  Expected: ${e}\n  Actual:   ${a}`);
  }
}

let passed = 0;
let failed = 0;
const errors = [];

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

console.log('=== Proto 3638 Tests ===\n');

console.log('Basic parsing:');
test('parses example body without error', () => {
  const buf = Buffer.from(EXAMPLE_BODY, 'hex');
  const result = parse3638(buf);
  assert(result !== null, 'Should not be null');
});

test('returns null for body too short', () => {
  const buf = Buffer.from('ff1800', 'hex');
  const result = parse3638(buf);
  assertEqual(result, null, 'Should be null for short body');
});

console.log('\nActive Mission:');

test('parses unknown byte', () => {
  const buf = Buffer.from(EXAMPLE_BODY, 'hex');
  const result = parse3638(buf);
  assertEqual(result.activeMission.unknown, 0xff, 'unknown');
});

test('parses missionId', () => {
  const buf = Buffer.from(EXAMPLE_BODY, 'hex');
  const result = parse3638(buf);
  assertEqual(result.activeMission.missionId, 0x0018, 'missionId');
});

test('parses level', () => {
  const buf = Buffer.from(EXAMPLE_BODY, 'hex');
  const result = parse3638(buf);
  assertEqual(result.activeMission.level, 2, 'level');
});

test('parses remaining', () => {
  const buf = Buffer.from(EXAMPLE_BODY, 'hex');
  const result = parse3638(buf);
  assertEqual(result.activeMission.remaining, 8, 'remaining');
});

test('parses endTimestamp', () => {
  const buf = Buffer.from(EXAMPLE_BODY, 'hex');
  const result = parse3638(buf);
  assertEqual(result.activeMission.endTimestamp, 0x6aa187ab, 'endTimestamp');
});

test('parses separator1 as zero buffer', () => {
  const buf = Buffer.from(EXAMPLE_BODY, 'hex');
  const result = parse3638(buf);
  assertBufferEqual(result.activeMission.separator1, Buffer.from('00000000', 'hex'), 'separator1');
});

test('parses timeMinutes', () => {
  const buf = Buffer.from(EXAMPLE_BODY, 'hex');
  const result = parse3638(buf);
  assertEqual(result.activeMission.timeMinutes, 0x000024f4, 'timeMinutes');
});

test('parses startTimestamp', () => {
  const buf = Buffer.from(EXAMPLE_BODY, 'hex');
  const result = parse3638(buf);
  assertEqual(result.activeMission.startTimestamp, 0x6a9ee4ab, 'startTimestamp');
});

test('parses reserved as 12 zero bytes', () => {
  const buf = Buffer.from(EXAMPLE_BODY, 'hex');
  const result = parse3638(buf);
  assertEqual(result.activeMission.reserved.length, 12, 'reserved length');
  assertBufferEqual(result.activeMission.reserved, Buffer.alloc(12), 'reserved zeros');
});

test('parses missionType', () => {
  const buf = Buffer.from(EXAMPLE_BODY, 'hex');
  const result = parse3638(buf);
  assertEqual(result.activeMission.missionType, 0, 'missionType (0 = 200%)');
});

test('parses specialFlag as true', () => {
  const buf = Buffer.from(EXAMPLE_BODY, 'hex');
  const result = parse3638(buf);
  assertEqual(result.activeMission.specialFlag, true, 'specialFlag');
});

console.log('\n200% Mission:');

test('parses appearanceTimestamp', () => {
  const buf = Buffer.from(EXAMPLE_BODY, 'hex');
  const result = parse3638(buf);
  assertEqual(result.mission200.appearanceTimestamp, 0x6a9ee91e, 'appearanceTimestamp');
});

test('parses separator as zero buffer', () => {
  const buf = Buffer.from(EXAMPLE_BODY, 'hex');
  const result = parse3638(buf);
  assertBufferEqual(result.mission200.separator, Buffer.from('00000000', 'hex'), 'separator');
});

test('parses level', () => {
  const buf = Buffer.from(EXAMPLE_BODY, 'hex');
  const result = parse3638(buf);
  assertEqual(result.mission200.level, 1, 'level');
});

test('parses missionId', () => {
  const buf = Buffer.from(EXAMPLE_BODY, 'hex');
  const result = parse3638(buf);
  assertEqual(result.mission200.missionId, 0x0027, 'missionId');
});

test('parses completed count', () => {
  const buf = Buffer.from(EXAMPLE_BODY, 'hex');
  const result = parse3638(buf);
  assertEqual(result.mission200.completed, 0, 'completed');
});

console.log('\n120% Mission:');

test('parses appearanceTimestamp', () => {
  const buf = Buffer.from(EXAMPLE_BODY, 'hex');
  const result = parse3638(buf);
  assertEqual(result.mission120.appearanceTimestamp, 0x6a9ee91f, 'appearanceTimestamp');
});

test('parses separator as zero buffer', () => {
  const buf = Buffer.from(EXAMPLE_BODY, 'hex');
  const result = parse3638(buf);
  assertBufferEqual(result.mission120.separator, Buffer.from('00000000', 'hex'), 'separator');
});

test('parses level', () => {
  const buf = Buffer.from(EXAMPLE_BODY, 'hex');
  const result = parse3638(buf);
  assertEqual(result.mission120.level, 2, 'level');
});

test('parses missionId', () => {
  const buf = Buffer.from(EXAMPLE_BODY, 'hex');
  const result = parse3638(buf);
  assertEqual(result.mission120.missionId, 0x0025, 'missionId');
});

test('parses completed count', () => {
  const buf = Buffer.from(EXAMPLE_BODY, 'hex');
  const result = parse3638(buf);
  assertEqual(result.mission120.completed, 0, 'completed');
});

console.log('\nEdge cases:');

test('handles exact 59-byte body', () => {
  const buf = Buffer.alloc(59);
  const result = parse3638(buf);
  assert(result !== null, 'Should parse exactly 59 bytes');
});

test('handles body with extra trailing bytes', () => {
  const buf = Buffer.from(EXAMPLE_BODY + 'ffff', 'hex');
  const result = parse3638(buf);
  assert(result !== null, 'Should parse with trailing bytes');
});

test('returns null for 58 bytes', () => {
  const buf = Buffer.alloc(58);
  const result = parse3638(buf);
  assertEqual(result, null, 'Should be null for 58 bytes');
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

if (failed > 0) {
  console.log('\nFailed tests:');
  for (const err of errors) {
    console.log(`  ✗ ${err.name}`);
    console.log(`    ${err.error.split('\n').join('\n    ')}`);
  }
  process.exit(1);
}
