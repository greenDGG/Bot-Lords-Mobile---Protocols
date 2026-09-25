'use strict';

/**
 * Attack/Battle packet parser.
 *
 * Conservative parser: only decodes fields with confirmed meaning.
 * Unknown fields are preserved as raw hex and labeled UNKNOWN.
 *
 * See docs/protocols/3418.md for the full protocol documentation.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function readUint24LE(buf, offset) {
  return buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16);
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
  return String.fromCharCode(...bytes);
}

// ---------------------------------------------------------------------------
// Field layout (offsets computed at parse time)
// ---------------------------------------------------------------------------

const FIELD_DEFS = [
  // --- Unknown prefix ---
  { name: 'unknownPrefix1',        offset: 0,   size: 4,  read: 'bytes' },
  { name: 'separator1',            offset: 4,   size: 1,  read: 'bytes' },

  // --- Timestamp ---
  { name: 'timestamp',             offset: 5,   size: 4,  read: 'uint32le' },

  { name: 'separator2',            offset: 9,   size: 4,  read: 'bytes' },
  { name: 'unknownPrefix2',        offset: 13,  size: 7,  read: 'bytes' },

  // --- Attacker identity ---
  { name: 'attackerKingdom',       offset: 20,  size: 2,  read: 'uint16le' },
  { name: 'enemyGuildTag',         offset: 22,  size: 3,  read: 'ascii' },
  { name: 'attackerNameRaw',       offset: 25,  size: 13, read: 'bytes' },

  // --- Defender identity ---
  { name: 'defenderKingdom',       offset: 38,  size: 2,  read: 'uint16le' },
  { name: 'myGuildTag',            offset: 40,  size: 3,  read: 'ascii' },
  { name: 'defenderNameRaw',       offset: 43,  size: 13, read: 'bytes' },

  // --- Unknown block 1 ---
  { name: 'unknownBlock1',         offset: 56,  size: 62, read: 'bytes' },

  // --- Enemy battle stats ---
  { name: 'enemyLocation',         offset: 118, size: 3,  read: 'bytes' },
  { name: 'enemyPowerLost',        offset: 121, size: 4,  read: 'uint32le' },
  { name: 'separator3',            offset: 125, size: 4,  read: 'bytes' },
  { name: 'enemyTroopsSent',       offset: 129, size: 4,  read: 'uint32le' },
  { name: 'enemyTroopsDefeated',   offset: 133, size: 4,  read: 'uint32le' },
  { name: 'separator4',            offset: 137, size: 4,  read: 'bytes' },

  // --- Defender battle stats ---
  { name: 'myLocation',            offset: 141, size: 3,  read: 'bytes' },
  { name: 'myPowerLost',           offset: 144, size: 4,  read: 'uint32le' },
  { name: 'separator5',            offset: 148, size: 4,  read: 'bytes' },
  { name: 'myTotalTroops',         offset: 152, size: 4,  read: 'uint32le' },
  { name: 'myTroopsDefeated',      offset: 156, size: 4,  read: 'uint32le' },

  // --- Unknown block 2 ---
  { name: 'unknownBlock2',         offset: 160, size: 24, read: 'bytes' },

  // --- Levels ---
  { name: 'attackerLevel',         offset: 184, size: 1,  read: 'uint8' },
  { name: 'unknownLevelField1',    offset: 185, size: 3,  read: 'bytes' },
  { name: 'attackerVipLevel',      offset: 188, size: 1,  read: 'uint8' },
  { name: 'unknownLevelField2',    offset: 189, size: 1,  read: 'bytes' },
  { name: 'defenderLevel',         offset: 190, size: 1,  read: 'uint8' },
  { name: 'unknownLevelField3',    offset: 191, size: 3,  read: 'bytes' },
  { name: 'defenderVipLevel',      offset: 194, size: 1,  read: 'uint8' },
  { name: 'unknownLevelField4',    offset: 195, size: 1,  read: 'bytes' },
];

const MIN_SIZE = 196; // up to and including unknownLevelField4

// ---------------------------------------------------------------------------
// Name extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extract the ASCII portion and trailing bytes from a 13-byte nameRaw field.
 *
 * The nameRaw field is structured as:
 *   [ASCII chars...] [00] [trailing bytes...]
 *
 * We find the first 0x00 byte; everything before it is the ASCII name,
 * everything from 0x00 onward (including the 00) is preserved as raw.
 */
function extractName(rawBytes) {
  const hex = bytesToHex(rawBytes);
  const nullIdx = hex.indexOf('00');
  if (nullIdx === -1) {
    // No null found: entire block is ASCII (unusual, but handle it)
    return {
      ascii: readAscii(rawBytes, 0, rawBytes.length),
      raw: hex,
      trailingHex: '',
    };
  }
  const asciiBytes = nullIdx / 2;
  const ascii = readAscii(rawBytes, 0, asciiBytes);
  const trailingHex = hex.substring(nullIdx);
  return { ascii, raw: hex, trailingHex };
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

function parse(hexString) {
  const buf = hexToBytes(hexString);

  if (buf.length < MIN_SIZE) {
    return {
      error: `Packet too short: need at least ${MIN_SIZE} bytes, have ${buf.length}`,
      raw: bytesToHex(buf),
    };
  }

  const raw = {};

  for (const field of FIELD_DEFS) {
    const slice = readBytes(buf, field.offset, field.size);
    raw[field.name] = bytesToHex(slice);

    switch (field.read) {
      case 'uint8':
        raw[field.name + '_value'] = readUint8(buf, field.offset);
        break;
      case 'uint16le':
        raw[field.name + '_value'] = readUint16LE(buf, field.offset);
        break;
      case 'uint24le':
        raw[field.name + '_value'] = readUint24LE(buf, field.offset);
        break;
      case 'uint32le':
        raw[field.name + '_value'] = readUint32LE(buf, field.offset);
        break;
      case 'ascii':
        raw[field.name + '_value'] = readAscii(buf, field.offset, field.size);
        break;
      // 'bytes' → only raw hex, no decoded value
    }
  }

  // Remaining bytes after all defined fields
  const remainingOffset = 196;
  const remainingSize = buf.length - remainingOffset;
  if (remainingSize > 0) {
    raw.unknownFinalBlock = bytesToHex(readBytes(buf, remainingOffset, remainingSize));
  }

  // Parse attacker name
  const attackerName = extractName(readBytes(buf, 25, 13));
  // Parse defender name
  const defenderName = extractName(readBytes(buf, 43, 13));

  return {
    raw,
    packetSize: buf.length,

    unknownPrefix: {
      part1: raw.unknownPrefix1,
      separator1: raw.separator1,
      part2: raw.unknownPrefix2,
      separator2: raw.separator2,
    },

    timestamp: {
      raw: raw.timestamp,
      value: raw.timestamp_value,
    },

    attacker: {
      kingdom: raw.attackerKingdom_value,
      kingdomHex: raw.attackerKingdom,
      guildTag: raw.enemyGuildTag_value,
      name: attackerName.ascii,
      nameRaw: attackerName.raw,
      nameTrailingHex: attackerName.trailingHex,
    },

    defender: {
      kingdom: raw.defenderKingdom_value,
      kingdomHex: raw.defenderKingdom,
      guildTag: raw.myGuildTag_value,
      name: defenderName.ascii,
      nameRaw: defenderName.raw,
      nameTrailingHex: defenderName.trailingHex,
    },

    unknownBlock1: raw.unknownBlock1,

    enemyStats: {
      location: raw.enemyLocation,
      powerLost: raw.enemyPowerLost_value,
      powerLostHex: raw.enemyPowerLost,
      separator: raw.separator3,
      troopsSent: raw.enemyTroopsSent_value,
      troopsSentHex: raw.enemyTroopsSent,
      troopsDefeated: raw.enemyTroopsDefeated_value,
      troopsDefeatedHex: raw.enemyTroopsDefeated,
      separatorEnd: raw.separator4,
    },

    defenderStats: {
      location: raw.myLocation,
      powerLost: raw.myPowerLost_value,
      powerLostHex: raw.myPowerLost,
      separator: raw.separator5,
      totalTroops: raw.myTotalTroops_value,
      totalTroopsHex: raw.myTotalTroops,
      troopsDefeated: raw.myTroopsDefeated_value,
      troopsDefeatedHex: raw.myTroopsDefeated,
    },

    unknownBlock2: raw.unknownBlock2,

    levels: {
      attackerLevel: raw.attackerLevel_value,
      unknownField1: raw.unknownLevelField1,
      attackerVipLevel: raw.attackerVipLevel_value,
      unknownField2: raw.unknownLevelField2,
      defenderLevel: raw.defenderLevel_value,
      unknownField3: raw.unknownLevelField3,
      defenderVipLevel: raw.defenderVipLevel_value,
      unknownField4: raw.unknownLevelField4,
    },

    unknownFinalBlock: raw.unknownFinalBlock || null,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  parse,
  hexToBytes,
  bytesToHex,
  extractName,
  FIELD_DEFS,
  MIN_SIZE,
};
