'use strict';

/**
 * Protocol 3804 — Equipped Costume Tests
 *
 * Parses real captured hex of currently equipped lord equipment.
 * Same 19-byte item structure as proto 1417, but NO header.
 */

const ITEM_SIZE = 19;

function hexToBytes(hex) {
  const clean = hex.replace(/\/\/.*$/gm, '').replace(/\s+/g, '');
  if (clean.length % 2 !== 0) {
    throw new Error(`Invalid hex string length: ${clean.length} (must be even)`);
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function readUint16LE(buf, offset) {
  return buf[offset] | (buf[offset + 1] << 8);
}

function parseEquippedCostumes(hexString) {
  const buf = hexToBytes(hexString);

  const items = [];
  let off = 0;

  while (off + ITEM_SIZE <= buf.length) {
    const itemOff = off;
    const id = readUint16LE(buf, off); off += 2;
    const grade = buf[off]; off += 1;
    const gemLevel1 = buf[off]; off += 1;
    const gemLevel2 = buf[off]; off += 1;
    const gemLevel3 = buf[off]; off += 1;
    const stealthLevel1 = buf[off]; off += 1;
    const gemId1 = readUint16LE(buf, off); off += 2;
    const gemId2 = readUint16LE(buf, off); off += 2;
    const gemId3 = readUint16LE(buf, off); off += 2;
    const stealthId1 = readUint16LE(buf, off); off += 2;
    const index = readUint16LE(buf, off); off += 2;
    const end = readUint16LE(buf, off); off += 2;

    if (id === 0 && grade === 0 && gemLevel1 === 0 && gemLevel2 === 0) break;

    items.push({
      id,
      grade,
      gemLevel1,
      gemLevel2,
      gemLevel3,
      stealthLevel1,
      gemId1,
      gemId2,
      gemId3,
      stealthId1,
      index,
      end,
      raw: bytesToHex(readBytes(buf, itemOff, ITEM_SIZE)),
    });
  }

  const remaining = off < buf.length
    ? bytesToHex(readBytes(buf, off, buf.length - off))
    : '';

  return { items, remaining, totalBytes: buf.length };
}

function readBytes(buf, offset, size) {
  return buf.slice(offset, offset + size);
}

// ---------------------------------------------------------------------------
// Real captured hex — 8 equipped costumes
// ---------------------------------------------------------------------------

const TEST_HEX = `
8a12040000000000000000000000000b000000
8b12030000000000000000000000000c000000
6b120300000000000000000000000006000000
75120300000000000000000000000007000000
3e110500000000000000000000000003000000
70110500000000000000000000000008000000
70110500000000000000000000000009000000
7011040000000000000000000000000a000000
0000000000000000
`;

// ---------------------------------------------------------------------------
// Pretty-printer
// ---------------------------------------------------------------------------

function printResult(result) {
  console.log('Proto 3804 Parser — Equipped Costumes');
  console.log('────────────────────────\n');

  for (let i = 0; i < result.items.length; i++) {
    const item = result.items[i];
    const num = String(i + 1).padStart(2, ' ');
    console.log(`EQUIPPED #${num}`);
    console.log(`  id=${item.id}  grade=${item.grade}  gem1=${item.gemLevel1}  gem2=${item.gemLevel2}  gem3=${item.gemLevel3}  stealth=${item.stealthLevel1}`);
    console.log(`  gemId1=${item.gemId1}  gemId2=${item.gemId2}  gemId3=${item.gemId3}  stealthId=${item.stealthId1}`);
    console.log(`  index=${item.index}  end=${item.end}`);
  }
  console.log();

  console.log('VALIDATION');
  console.log(`  Total bytes:   ${result.totalBytes}`);
  console.log(`  Parsed items:  ${result.items.length}`);
  console.log(`  Consumed:      ${result.items.length * ITEM_SIZE} bytes`);
  console.log(`  Remaining:     ${result.remaining || '(empty)'}`);
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`FAIL: ${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`);
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log('=== Protocol 3804 — Equipped Costume Tests ===\n');

const result = parseEquippedCostumes(TEST_HEX);
printResult(result);
console.log('────────────────────────\n');

console.log('Automatic tests:\n');

test('parses without error', () => {
  assert(!result.error, result.error);
});

test('parses 8 equipped items', () => {
  assertEqual(result.items.length, 8, 'item count');
});

test('remaining = trailing zeros', () => {
  assertEqual(result.remaining, '0000000000000000', 'remaining');
});

test('item #1: id=128a grade=04 (LE: bytes 8a,12)', () => {
  assertEqual(result.items[0].id, 0x128a, 'id');
  assertEqual(result.items[0].grade, 0x04, 'grade');
});

test('item #1: index=000b (slot 11)', () => {
  assertEqual(result.items[0].index, 0x000b, 'index');
});

test('item #3: id=126b grade=03 (no gems)', () => {
  assertEqual(result.items[2].id, 0x126b, 'id');
  assertEqual(result.items[2].grade, 0x03, 'grade');
  assertEqual(result.items[2].gemLevel1, 0, 'gemLevel1');
  assertEqual(result.items[2].gemId1, 0, 'gemId1');
});

test('item #5: id=113e grade=05 (legendary)', () => {
  assertEqual(result.items[4].id, 0x113e, 'id');
  assertEqual(result.items[4].grade, 0x05, 'grade');
});

test('item #8: id=1170 grade=04 (last equipped)', () => {
  assertEqual(result.items[7].id, 0x1170, 'id');
  assertEqual(result.items[7].grade, 0x04, 'grade');
  assertEqual(result.items[7].index, 0x000a, 'index');
});

test('all items are 19 bytes raw (38 hex chars)', () => {
  for (let i = 0; i < result.items.length; i++) {
    assertEqual(result.items[i].raw.length, 38, `item ${i + 1} raw length`);
  }
});

test('skips trailing zeros (all-zero item not parsed)', () => {
  const lastItem = result.items[result.items.length - 1];
  assert(lastItem.id !== 0, 'last item is not all zeros');
});

// Edge cases

test('empty hex returns no items', () => {
  const r = parseEquippedCostumes('');
  assertEqual(r.items.length, 0, 'no items');
});

test('single item parses correctly', () => {
  const r = parseEquippedCostumes('5b110500000000000000000000000001000000');
  assertEqual(r.items.length, 1, 'one item');
  assertEqual(r.items[0].id, 0x115b, 'id');
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
