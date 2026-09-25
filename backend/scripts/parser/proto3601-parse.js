const hex = '000102010000000000000000000000000000e006000002000000000066170000050034080000d8950000100004090e00ed04020004040100f7030100fd0301001a050100ee040200ed0401008b040200d50901001d0a0100d30701006104010003040200c90415004e0503001a050500f1040100ef040200ed0401008c0402008a040100d50906001d0a0600d40703005804020046040300470403';

const buf = Buffer.from(hex, 'hex');

console.log('=== PROTO 3601 - REAL PACKET ===');
console.log(`Body length: ${buf.length}\n`);

// Dump with clear offset labels
for (let i = 0; i < buf.length; i += 16) {
  const line = buf.slice(i, Math.min(i + 16, buf.length));
  const hexStr = Array.from(line).map(b => b.toString(16).padStart(2, '0')).join(' ');
  console.log(`${i.toString(16).padStart(4, '0')}: ${hexStr}`);
}

console.log('\n=== First bytes analysis ===');
console.log(`Byte 0: ${buf[0]} (varint/count/subtype?)`);

// The IGG protocol header is 6202110e (already stripped from body)
// Body starts with 01

// Let me try: byte 0 = count of activities
// Then each activity block has a type marker

// Search for ALL uint16 values that match known activity types
console.log('\n=== All uint16 values in packet ===');
for (let i = 0; i < buf.length - 1; i += 2) {
  const val = buf.readUInt16LE(i);
  if (val > 0 && val < 100) {
    console.log(`  0x${i.toString(16).padStart(4, '0')}: ${val}`);
  }
}

// The 43 00 at offset 0x17F and 44 00 45 00 at 0x1a5-0x1a7 are clearly activity types
// But wait - in the REAL packet, let me check what's at those offsets

console.log('\n=== Critical offsets with raw bytes ===');
// Where is 43 00?
for (let i = 0; i < buf.length - 1; i++) {
  if (buf[i] === 0x43 && buf[i+1] === 0x00) {
    console.log(`Found 43 00 at offset 0x${i.toString(16)} (${i})`);
    // Show context
    console.log(`  Before: ${buf.slice(Math.max(0, i-4), i).toString('hex')}`);
    console.log(`  After:  ${buf.slice(i, Math.min(buf.length, i+20)).toString('hex')}`);
  }
  if (buf[i] === 0x44 && buf[i+1] === 0x00) {
    console.log(`Found 44 00 at offset 0x${i.toString(16)} (${i})`);
    console.log(`  After:  ${buf.slice(i, Math.min(buf.length, i+20)).toString('hex')}`);
  }
  if (buf[i] === 0x45 && buf[i+1] === 0x00) {
    console.log(`Found 45 00 at offset 0x${i.toString(16)} (${i})`);
  }
  if (buf[i] === 0x50 && buf[i+1] === 0x00) {
    console.log(`Found 50 00 at offset 0x${i.toString(16)} (${i})`);
    console.log(`  After:  ${buf.slice(i, Math.min(buf.length, i+20)).toString('hex')}`);
  }
}

// The first varint is 1, suggesting this packet contains data for 1 activity type?
// Or it's a subtype

// Let me look at the ACTUAL structure
// Maybe: byte0=subtype, then entries follow
// Subtype 1 = full activity list

console.log('\n=== Possible structure: subtype + entries ===');
let pos = 1; // skip subtype byte

// Read a possible count after subtype
const countByte = buf[pos];
console.log(`Offset 0x01: ${countByte} (possible entry count)`);
pos++;

// Try reading activity entries
// Each entry might have: type(uint16) + data...
// But the first non-zero data after pos=2 is at...

// Let me just scan for the structure
// I see at 0x09: 04 (could be a count)
// At 0x0a: 29 00 (41 in uint16)
// 41 = MonopolyWeekChallenge

console.log('\n=== Trying entry count at offset 9 ===');
console.log(`Byte 9: ${buf[9]} (count?)`);
console.log(`Uint16 at 10: ${buf.readUInt16LE(10)} (activity type?)`);

// Actually let me try another approach
// Maybe the structure is simpler than I think
// Byte 0 = 1 (count of activity types?)
// Then each activity has: type(uint16) + beginTime(uint32) + endTime(uint32) + state(byte) + ...

// But there's a HUGE block of zeros (256 bytes!) between offset 0x1E and 0x131
// That's suspicious - maybe it's an array of 64 entries × 4 bytes each?

console.log('\n=== Zero block analysis ===');
console.log(`Zeros from 0x001e to 0x0130 = ${(0x131 - 0x1e)} bytes = ${(0x131 - 0x1e) / 4} × 4-byte entries`);
