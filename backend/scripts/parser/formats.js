'use strict';

const WAITING_MARKER = 0x03e9;

const NORMAL_RECORD = {
  name: 'normal',
  fields: [
    { name: 'missionId', offset: 0x00, size: 2, type: 'uint16_le' },
    { name: 'level',     offset: 0x02, size: 1, type: 'uint8' },
    { name: 'unknown3',  offset: 0x03, size: 3, type: 'bytes3' },
    { name: 'padding',   offset: 0x06, size: 4, type: 'bytes4' },
  ],
};

const WAITING_RECORD = {
  name: 'waiting',
  fields: [
    { name: 'status',    offset: 0x00, size: 2, type: 'uint16_le' },
    { name: 'timestamp', offset: 0x02, size: 4, type: 'uint32_le' },
    { name: 'padding',   offset: 0x06, size: 4, type: 'bytes4' },
  ],
};

const RECORD_SIZE = 10;
const HEADER_SIZE = 4;

module.exports = {
  WAITING_MARKER,
  NORMAL_RECORD,
  WAITING_RECORD,
  RECORD_SIZE,
  HEADER_SIZE,
};
