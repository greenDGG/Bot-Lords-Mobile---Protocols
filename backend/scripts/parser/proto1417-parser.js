'use strict';

/**
 * Protocol 1417 — Costume/Skin List Parser
 *
 * Parses the body of proto 1417 which contains a list of costumes (trajes).
 *
 * Structure:
 *   00              start (1 byte)
 *   XXXXXXXX        timestamp (4 bytes LE)
 *   XXXXXXXX        timestampSeparator (4 bytes)
 *   XXYY            separator (2 bytes)
 *   XXYY            count (2 bytes LE)
 *   [items × 19]    costume entries
 */

const HEADER_SIZE = 13;
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

function readUint8(buf, offset) {
  return buf[offset];
}

function readUint16LE(buf, offset) {
  return buf[offset] | (buf[offset + 1] << 8);
}

function readUint32LE(buf, offset) {
  return (
    buf[offset] |
    (buf[offset + 1] << 8) |
    (buf[offset + 2] << 16) |
    (buf[offset + 3] << 24)
  );
}

function readBytes(buf, offset, size) {
  return buf.slice(offset, offset + size);
}

function parseProto1417(hexString) {
  const buf = hexToBytes(hexString);

  if (buf.length === 0) {
    return { error: 'EMPTY: no bytes to parse', header: null, items: [], remaining: '' };
  }

  const hasHeader =
    buf.length >= HEADER_SIZE &&
    (buf.length - HEADER_SIZE) % ITEM_SIZE === 0;

  let off = 0;
  let header = null;

  if (hasHeader) {
    const start = bytesToHex(readBytes(buf, off, 1)); off += 1;
    const timestampRaw = bytesToHex(readBytes(buf, off, 4));
    const timestampDec = readUint32LE(buf, off); off += 4;
    const timestampSeparator = bytesToHex(readBytes(buf, off, 4)); off += 4;
    const separator = bytesToHex(readBytes(buf, off, 2)); off += 2;
    const countRaw = bytesToHex(readBytes(buf, off, 2));
    const countDec = readUint16LE(buf, off); off += 2;

    header = {
      start,
      timestamp: { raw: timestampRaw, decimalLE: timestampDec },
      timestampSeparator,
      separator,
      count: { raw: countRaw, decimalLE: countDec },
    };
  }

  const itemBytes = buf.length - off;
  const itemCount = Math.floor(itemBytes / ITEM_SIZE);
  const remainingBytes = itemBytes - itemCount * ITEM_SIZE;

  const items = [];
  for (let i = 0; i < itemCount; i++) {
    const itemOff = off;
    const id = bytesToHex(readBytes(buf, off, 2)); off += 2;
    const grade = bytesToHex(readBytes(buf, off, 1)); off += 1;
    const gemLevel1 = bytesToHex(readBytes(buf, off, 1)); off += 1;
    const gemLevel2 = bytesToHex(readBytes(buf, off, 1)); off += 1;
    const gemLevel3 = bytesToHex(readBytes(buf, off, 1)); off += 1;
    const stealthLevel1 = bytesToHex(readBytes(buf, off, 1)); off += 1;
    const gemId1 = bytesToHex(readBytes(buf, off, 2)); off += 2;
    const gemId2 = bytesToHex(readBytes(buf, off, 2)); off += 2;
    const gemId3 = bytesToHex(readBytes(buf, off, 2)); off += 2;
    const stealthId1 = bytesToHex(readBytes(buf, off, 2)); off += 2;
    const index = bytesToHex(readBytes(buf, off, 2)); off += 2;
    const end = bytesToHex(readBytes(buf, off, 2)); off += 2;

    items.push({
      offsetStart: itemOff,
      offsetEnd: itemOff + ITEM_SIZE - 1,
      raw: bytesToHex(readBytes(buf, itemOff, ITEM_SIZE)),
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
    });
  }

  const remaining = remainingBytes > 0
    ? bytesToHex(readBytes(buf, off, remainingBytes))
    : '';

  return {
    header,
    hasHeader,
    itemCount,
    items,
    remaining,
  };
}

module.exports = {
  parseProto1417,
  hexToBytes,
  bytesToHex,
  HEADER_SIZE,
  ITEM_SIZE,
};
