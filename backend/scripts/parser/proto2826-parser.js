'use strict';

/**
 * Protocol 2826 — Guild Applications (Response)
 *
 * Parses the server response containing a list of guild join applications.
 */

function hexToBytes(hex) {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length % 2 !== 0) {
    throw new Error(`Invalid hex string length: ${clean.length}`);
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
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

function readAscii(buf, offset, size) {
  const bytes = readBytes(buf, offset, size);
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) break;
    str += String.fromCharCode(bytes[i]);
  }
  return str;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

const HEADER_SIZE = 4;
const ENTRY_SIZE = 43;

function parse(hexString) {
  const buf = hexToBytes(hexString);

  if (buf.length < HEADER_SIZE) {
    return { error: `Packet too short: need at least ${HEADER_SIZE} bytes, have ${buf.length}` };
  }

  const packetLength = readUint16LE(buf, 0);
  const proto = readUint16LE(buf, 2);

  if (proto !== 2826) {
    return { error: `Wrong protocol: expected 2826, got ${proto}` };
  }

  // Body starts at offset 4
  if (buf.length < HEADER_SIZE + 3) {
    return { error: 'Packet too short for body' };
  }

  const version = readUint16LE(buf, HEADER_SIZE);
  const count = readUint8(buf, HEADER_SIZE + 2);

  const entries = [];
  let offset = HEADER_SIZE + 3;

  for (let i = 0; i < count; i++) {
    if (offset + ENTRY_SIZE > buf.length) {
      return { error: `Entry ${i}: not enough bytes (need ${ENTRY_SIZE} at offset ${offset}, have ${buf.length - offset})` };
    }

    const entry = {
      userId: readUint32LE(buf, offset),
      userIdHex: bytesToHex(readBytes(buf, offset, 4)),
      separator1: bytesToHex(readBytes(buf, offset + 4, 4)),
      unknown1: readUint16LE(buf, offset + 8),
      unknown1Hex: bytesToHex(readBytes(buf, offset + 8, 2)),
      nameRaw: bytesToHex(readBytes(buf, offset + 10, 13)),
      name: readAscii(buf, offset + 10, 13),
      separator2: bytesToHex(readBytes(buf, offset + 23, 1)),
      power: readUint32LE(buf, offset + 24),
      powerHex: bytesToHex(readBytes(buf, offset + 24, 4)),
      separator3: bytesToHex(readBytes(buf, offset + 28, 4)),
      troopsKilled: readUint32LE(buf, offset + 32),
      troopsKilledHex: bytesToHex(readBytes(buf, offset + 32, 4)),
      endSeparator: bytesToHex(readBytes(buf, offset + 36, 7)),
    };

    entries.push(entry);
    offset += ENTRY_SIZE;
  }

  return {
    packetLength,
    proto,
    version,
    count,
    entries,
    packetSize: buf.length,
    raw: {
      header: bytesToHex(readBytes(buf, 0, HEADER_SIZE)),
      versionHex: bytesToHex(readBytes(buf, HEADER_SIZE, 2)),
      countHex: bytesToHex(readBytes(buf, HEADER_SIZE + 2, 1)),
      body: bytesToHex(readBytes(buf, HEADER_SIZE, buf.length - HEADER_SIZE)),
    },
  };
}

module.exports = {
  parse,
  hexToBytes,
  bytesToHex,
  HEADER_SIZE,
  ENTRY_SIZE,
};
