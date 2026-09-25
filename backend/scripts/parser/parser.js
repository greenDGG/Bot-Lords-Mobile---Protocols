'use strict';

const { WAITING_MARKER, NORMAL_RECORD, WAITING_RECORD, RECORD_SIZE, HEADER_SIZE } = require('./formats');

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
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function readUint16LE(buf, offset) {
  return buf[offset] | (buf[offset + 1] << 8);
}

function readUint32LE(buf, offset) {
  return buf[offset]
    | (buf[offset + 1] << 8)
    | (buf[offset + 2] << 16)
    | (buf[offset + 3] << 24);
}

function parseRecord(buf, recordOffset) {
  if (buf.length - recordOffset < RECORD_SIZE) {
    return {
      type: 'error',
      offset: recordOffset,
      error: `Incomplete record: need ${RECORD_SIZE} bytes, have ${buf.length - recordOffset}`,
      raw: bytesToHex(buf.slice(recordOffset)),
    };
  }

  const raw = buf.slice(recordOffset, recordOffset + RECORD_SIZE);
  const first2 = readUint16LE(buf, recordOffset);

  if (first2 === WAITING_MARKER) {
    return parseWaitingRecord(buf, recordOffset, raw);
  }
  return parseNormalRecord(buf, recordOffset, raw);
}

function parseNormalRecord(buf, offset, raw) {
  const missionId = readUint16LE(buf, offset);
  const level = buf[offset + 2];

  const unknown3Bytes = raw.slice(3, 6);
  const unknown3Hex = bytesToHex(unknown3Bytes);
  const unknown3Uint24BE = (unknown3Bytes[0] << 16) | (unknown3Bytes[1] << 8) | unknown3Bytes[2];
  const unknown3Uint24LE = (unknown3Bytes[2] << 16) | (unknown3Bytes[1] << 8) | unknown3Bytes[0];

  const padding = bytesToHex(raw.slice(6, 10));

  return {
    type: 'normal',
    offset,
    raw: bytesToHex(raw),
    fields: {
      missionId: bytesToHex(raw.slice(0, 2)),
      missionIdUint16: missionId,
      level,
      unknown3: unknown3Hex,
      unknown3Uint24BE,
      unknown3Uint24LE,
      padding,
    },
  };
}

function parseWaitingRecord(buf, offset, raw) {
  const status = readUint16LE(buf, offset);
  const timestamp = readUint32LE(buf, offset + 2);
  const padding = bytesToHex(raw.slice(6, 10));

  return {
    type: 'waiting',
    offset,
    raw: bytesToHex(raw),
    fields: {
      status: bytesToHex(raw.slice(0, 2)),
      statusUint16: status,
      timestamp,
      timestampHex: bytesToHex(raw.slice(2, 6)),
      padding,
    },
  };
}

function parse(hexString) {
  const buf = hexToBytes(hexString);

  if (buf.length < HEADER_SIZE) {
    return {
      header: { raw: bytesToHex(buf), error: `Header incomplete: need ${HEADER_SIZE} bytes, have ${buf.length}` },
      records: [],
    };
  }

  const headerRaw = buf.slice(0, HEADER_SIZE);
  const header = {
    raw: bytesToHex(headerRaw),
    size: HEADER_SIZE,
  };

  const records = [];
  for (let i = HEADER_SIZE; i < buf.length; i += RECORD_SIZE) {
    records.push(parseRecord(buf, i));
  }

  return { header, records };
}

function formatRecord(record, index) {
  const lines = [];
  lines.push(`Record #${index + 1}`);
  lines.push(`  Raw:        ${record.raw}`);
  lines.push(`  Offset:     0x${(record.offset || 0).toString(16).padStart(4, '0')}`);

  if (record.type === 'error') {
    lines.push(`  Type:       ERROR`);
    lines.push(`  Error:      ${record.error}`);
    return lines.join('\n');
  }

  if (record.type === 'normal') {
    lines.push(`  Type:       normal`);
    lines.push(`  Mission ID: ${record.fields.missionId} (${record.fields.missionIdUint16})`);
    lines.push(`  Level:      ${record.fields.level.toString(16).padStart(2, '0')} (${record.fields.level})`);
    lines.push(`  Unknown 3:  ${record.fields.unknown3}`);
    lines.push(`    uint24 BE: ${record.fields.unknown3Uint24BE}`);
    lines.push(`    uint24 LE: ${record.fields.unknown3Uint24LE}`);
    lines.push(`  Padding:    ${record.fields.padding}`);
  } else if (record.type === 'waiting') {
    lines.push(`  Type:       waiting`);
    lines.push(`  Status:     ${record.fields.status} (${record.fields.statusUint16})`);
    lines.push(`  Timestamp:  ${record.fields.timestampHex} (${record.fields.timestamp})`);
    lines.push(`  Padding:    ${record.fields.padding}`);
  }

  return lines.join('\n');
}

function formatPacket(packet) {
  const lines = [];
  lines.push('Header:');
  lines.push(`  raw:  ${packet.header.raw}`);
  lines.push(`  size: ${packet.header.size} bytes`);
  lines.push('');
  lines.push(`Records: ${packet.records.length}`);
  lines.push('');

  for (let i = 0; i < packet.records.length; i++) {
    lines.push(formatRecord(packet.records[i], i));
    if (i < packet.records.length - 1) {
      lines.push('');
    }
  }

  return lines.join('\n');
}

module.exports = {
  parse,
  parseRecord,
  hexToBytes,
  bytesToHex,
  formatRecord,
  formatPacket,
};
