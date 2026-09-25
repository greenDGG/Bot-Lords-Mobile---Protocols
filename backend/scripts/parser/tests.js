'use strict';

const { parse, formatRecord, formatPacket } = require('./parser');

const FULL_PACKET = '090013002600020a9f6a000000000f0001d19e6a000000001f0001d19e6a000000000e0002f99e6a000000001100010a9f6a000000001e00010f9f6a00000000100001d19e6a00000000260003b49e6a000000000a0000d19e6a000000002c0003d19e6a00000000090001059f6a00000000100002d19e6a000000002a0000d19e6a000000001f0002cb9e6a000000002a0001d19e6a00000000180000079f6a00000000190002109f6a000000000f0001069f6a00000000180002069f6a00000000290002109f6a0000000000';

const SINGLE_RECORDS = [
  { hex: '1f0001d19e6a00000000', type: 'normal', missionId: '1f00', level: 1, unknown3: 'd19e6a' },
  { hex: '0e0002f99e6a00000000', type: 'normal', missionId: '0e00', level: 2, unknown3: 'f99e6a' },
  { hex: '1100010a9f6a00000000', type: 'normal', missionId: '1100', level: 1, unknown3: '0a9f6a' },
  { hex: '100001d19e6a00000000', type: 'normal', missionId: '1000', level: 1, unknown3: 'd19e6a' },
  { hex: '0a0000d19e6a00000000', type: 'normal', missionId: '0a00', level: 0, unknown3: 'd19e6a' },
  { hex: '2c0003d19e6a00000000', type: 'normal', missionId: '2c00', level: 3, unknown3: 'd19e6a' },
  { hex: '090001059f6a00000000', type: 'normal', missionId: '0900', level: 1, unknown3: '059f6a' },
  { hex: '100002d19e6a00000000', type: 'normal', missionId: '1000', level: 2, unknown3: 'd19e6a' },
  { hex: '2a0000d19e6a00000000', type: 'normal', missionId: '2a00', level: 0, unknown3: 'd19e6a' },
  { hex: '1f0002cb9e6a00000000', type: 'normal', missionId: '1f00', level: 2, unknown3: 'cb9e6a' },
  { hex: '2a0001d19e6a00000000', type: 'normal', missionId: '2a00', level: 1, unknown3: 'd19e6a' },
  { hex: '180000079f6a00000000', type: 'normal', missionId: '1800', level: 0, unknown3: '079f6a' },
  { hex: '0f0001069f6a00000000', type: 'normal', missionId: '0f00', level: 1, unknown3: '069f6a' },
  { hex: '180002069f6a00000000', type: 'normal', missionId: '1800', level: 2, unknown3: '069f6a' },
  { hex: 'e90386109f6a00000000', type: 'waiting', timestamp: '86109f6a' },
  { hex: 'e9037c109f6a00000000', type: 'waiting', timestamp: '7c109f6a' },
];

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

console.log('=== Parser Tests ===\n');

console.log('Header parsing:');
test('extracts 4-byte header from full packet', () => {
  const packet = parse(FULL_PACKET);
  assertEqual(packet.header.raw, '09001300', 'header raw');
  assertEqual(packet.header.size, 4, 'header size');
});

test('header is independent from records', () => {
  const packet = parse(FULL_PACKET);
  const firstRecord = packet.records[0];
  assert(firstRecord.fields.missionId !== '0900', 'First record missionId is not header');
  assertEqual(firstRecord.fields.missionId, '2600', 'First record missionId');
});

test('handles different headers', () => {
  const headers = [
    '09001300',
    'a0113002',
    '0b021300',
  ];
  for (const h of headers) {
    const packet = parse(h + '1f0001d19e6a00000000');
    assertEqual(packet.header.raw, h, `header ${h}`);
  }
});

test('handles header only (no records)', () => {
  const packet = parse('09001300');
  assertEqual(packet.header.raw, '09001300', 'header');
  assertEqual(packet.records.length, 0, 'no records');
});

test('handles incomplete header', () => {
  const packet = parse('0900');
  assert(packet.header.error, 'Should have header error');
  assertEqual(packet.records.length, 0, 'no records');
});

test('handles empty string', () => {
  const packet = parse('');
  assert(packet.header.error, 'Should have header error');
  assertEqual(packet.records.length, 0, 'no records');
});

console.log('\nFull packet parsing:');

test('parses 20 complete records + 1 trailing error', () => {
  const packet = parse(FULL_PACKET);
  assertEqual(packet.records.length, 21, 'record count');
  assertEqual(packet.records[20].type, 'error', 'last record is error (trailing byte)');
});

test('all complete records are normal type', () => {
  const packet = parse(FULL_PACKET);
  for (let i = 0; i < 20; i++) {
    assertEqual(packet.records[i].type, 'normal', `record ${i} type`);
  }
});

console.log('\nFull packet - individual record validation:');

test('record #1: missionId=2600, level=2, unknown3=0a9f6a', () => {
  const packet = parse(FULL_PACKET);
  const r = packet.records[0];
  assertEqual(r.fields.missionId, '2600', 'missionId');
  assertEqual(r.fields.level, 2, 'level');
  assertEqual(r.fields.unknown3, '0a9f6a', 'unknown3');
});

test('record #2: missionId=0f00, level=1, unknown3=d19e6a', () => {
  const packet = parse(FULL_PACKET);
  const r = packet.records[1];
  assertEqual(r.fields.missionId, '0f00', 'missionId');
  assertEqual(r.fields.level, 1, 'level');
  assertEqual(r.fields.unknown3, 'd19e6a', 'unknown3');
});

test('record #3: missionId=1f00, level=1, unknown3=d19e6a', () => {
  const packet = parse(FULL_PACKET);
  const r = packet.records[2];
  assertEqual(r.fields.missionId, '1f00', 'missionId');
  assertEqual(r.fields.level, 1, 'level');
  assertEqual(r.fields.unknown3, 'd19e6a', 'unknown3');
});

test('record #4: missionId=0e00, level=2, unknown3=f99e6a', () => {
  const packet = parse(FULL_PACKET);
  const r = packet.records[3];
  assertEqual(r.fields.missionId, '0e00', 'missionId');
  assertEqual(r.fields.level, 2, 'level');
  assertEqual(r.fields.unknown3, 'f99e6a', 'unknown3');
});

test('record #5: missionId=1100, level=1, unknown3=0a9f6a', () => {
  const packet = parse(FULL_PACKET);
  const r = packet.records[4];
  assertEqual(r.fields.missionId, '1100', 'missionId');
  assertEqual(r.fields.level, 1, 'level');
  assertEqual(r.fields.unknown3, '0a9f6a', 'unknown3');
});

test('record #6: missionId=1e00, level=1, unknown3=0f9f6a', () => {
  const packet = parse(FULL_PACKET);
  const r = packet.records[5];
  assertEqual(r.fields.missionId, '1e00', 'missionId');
  assertEqual(r.fields.level, 1, 'level');
  assertEqual(r.fields.unknown3, '0f9f6a', 'unknown3');
});

test('record #7: missionId=1000, level=1, unknown3=d19e6a', () => {
  const packet = parse(FULL_PACKET);
  const r = packet.records[6];
  assertEqual(r.fields.missionId, '1000', 'missionId');
  assertEqual(r.fields.level, 1, 'level');
  assertEqual(r.fields.unknown3, 'd19e6a', 'unknown3');
});

test('record #8: missionId=2600, level=3, unknown3=b49e6a', () => {
  const packet = parse(FULL_PACKET);
  const r = packet.records[7];
  assertEqual(r.fields.missionId, '2600', 'missionId');
  assertEqual(r.fields.level, 3, 'level');
  assertEqual(r.fields.unknown3, 'b49e6a', 'unknown3');
});

test('record #9: missionId=0a00, level=0, unknown3=d19e6a', () => {
  const packet = parse(FULL_PACKET);
  const r = packet.records[8];
  assertEqual(r.fields.missionId, '0a00', 'missionId');
  assertEqual(r.fields.level, 0, 'level');
  assertEqual(r.fields.unknown3, 'd19e6a', 'unknown3');
});

test('record #10: missionId=2c00, level=3, unknown3=d19e6a', () => {
  const packet = parse(FULL_PACKET);
  const r = packet.records[9];
  assertEqual(r.fields.missionId, '2c00', 'missionId');
  assertEqual(r.fields.level, 3, 'level');
  assertEqual(r.fields.unknown3, 'd19e6a', 'unknown3');
});

test('record #11: missionId=0900, level=1, unknown3=059f6a', () => {
  const packet = parse(FULL_PACKET);
  const r = packet.records[10];
  assertEqual(r.fields.missionId, '0900', 'missionId');
  assertEqual(r.fields.level, 1, 'level');
  assertEqual(r.fields.unknown3, '059f6a', 'unknown3');
});

test('record #12: missionId=1000, level=2, unknown3=d19e6a', () => {
  const packet = parse(FULL_PACKET);
  const r = packet.records[11];
  assertEqual(r.fields.missionId, '1000', 'missionId');
  assertEqual(r.fields.level, 2, 'level');
  assertEqual(r.fields.unknown3, 'd19e6a', 'unknown3');
});

test('record #13: missionId=2a00, level=0, unknown3=d19e6a', () => {
  const packet = parse(FULL_PACKET);
  const r = packet.records[12];
  assertEqual(r.fields.missionId, '2a00', 'missionId');
  assertEqual(r.fields.level, 0, 'level');
  assertEqual(r.fields.unknown3, 'd19e6a', 'unknown3');
});

test('record #14: missionId=1f00, level=2, unknown3=cb9e6a', () => {
  const packet = parse(FULL_PACKET);
  const r = packet.records[13];
  assertEqual(r.fields.missionId, '1f00', 'missionId');
  assertEqual(r.fields.level, 2, 'level');
  assertEqual(r.fields.unknown3, 'cb9e6a', 'unknown3');
});

test('record #15: missionId=2a00, level=1, unknown3=d19e6a', () => {
  const packet = parse(FULL_PACKET);
  const r = packet.records[14];
  assertEqual(r.fields.missionId, '2a00', 'missionId');
  assertEqual(r.fields.level, 1, 'level');
  assertEqual(r.fields.unknown3, 'd19e6a', 'unknown3');
});

test('record #16: missionId=1800, level=0, unknown3=079f6a', () => {
  const packet = parse(FULL_PACKET);
  const r = packet.records[15];
  assertEqual(r.fields.missionId, '1800', 'missionId');
  assertEqual(r.fields.level, 0, 'level');
  assertEqual(r.fields.unknown3, '079f6a', 'unknown3');
});

test('record #17: missionId=1900, level=2, unknown3=109f6a', () => {
  const packet = parse(FULL_PACKET);
  const r = packet.records[16];
  assertEqual(r.fields.missionId, '1900', 'missionId');
  assertEqual(r.fields.level, 2, 'level');
  assertEqual(r.fields.unknown3, '109f6a', 'unknown3');
});

test('record #18: missionId=0f00, level=1, unknown3=069f6a', () => {
  const packet = parse(FULL_PACKET);
  const r = packet.records[17];
  assertEqual(r.fields.missionId, '0f00', 'missionId');
  assertEqual(r.fields.level, 1, 'level');
  assertEqual(r.fields.unknown3, '069f6a', 'unknown3');
});

test('record #19: missionId=1800, level=2, unknown3=069f6a', () => {
  const packet = parse(FULL_PACKET);
  const r = packet.records[18];
  assertEqual(r.fields.missionId, '1800', 'missionId');
  assertEqual(r.fields.level, 2, 'level');
  assertEqual(r.fields.unknown3, '069f6a', 'unknown3');
});

test('record #20: missionId=2900, level=2, unknown3=109f6a', () => {
  const packet = parse(FULL_PACKET);
  const r = packet.records[19];
  assertEqual(r.fields.missionId, '2900', 'missionId');
  assertEqual(r.fields.level, 2, 'level');
  assertEqual(r.fields.unknown3, '109f6a', 'unknown3');
});

console.log('\nEdge cases:');

test('handles incomplete record after header', () => {
  const packet = parse('09001300ff');
  assertEqual(packet.header.raw, '09001300', 'header');
  assertEqual(packet.records.length, 1, '1 record');
  assertEqual(packet.records[0].type, 'error', 'record is error');
});

test('handles hex with spaces', () => {
  const packet = parse('09 00 13 00 1f 00 01 d1 9e 6a 00 00 00 00');
  assertEqual(packet.header.raw, '09001300', 'header');
  assertEqual(packet.records.length, 1, '1 record');
  assertEqual(packet.records[0].fields.missionId, '1f00', 'missionId');
});

test('handles hex with mixed case', () => {
  const packet = parse('090013001F0001D19E6A00000000');
  assertEqual(packet.header.raw, '09001300', 'header');
  assertEqual(packet.records[0].fields.missionId, '1f00', 'missionId');
});

console.log('\nOutput formatting:');

test('formatPacket produces readable output', () => {
  const packet = parse(FULL_PACKET);
  const formatted = formatPacket(packet);
  assert(formatted.includes('Header:'), 'Contains Header');
  assert(formatted.includes('09001300'), 'Contains header hex');
  assert(formatted.includes('Records: 21'), 'Contains record count');
  assert(formatted.includes('Record #1'), 'Contains first record');
  assert(formatted.includes('Record #20'), 'Contains last valid record');
});

test('formatRecord for normal record', () => {
  const packet = parse(FULL_PACKET);
  const formatted = formatRecord(packet.records[0], 0);
  assert(formatted.includes('Record #1'), 'Contains record number');
  assert(formatted.includes('normal'), 'Contains type');
  assert(formatted.includes('2600'), 'Contains missionId');
  assert(formatted.includes('0a9f6a'), 'Contains unknown3');
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
