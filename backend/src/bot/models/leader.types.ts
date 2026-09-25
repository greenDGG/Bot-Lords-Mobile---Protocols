export interface LordCaptivePacket {
  rawHeader: Buffer;
  guildTag: string;
  playerName: string;
  rawLocation: Buffer;
  unknownByte1: number;
  prisonEndTimestamp: number;
  unknownUint1: number;
  unknownUint2: number;
  captorBounty: number;
  rescueBounty: number;
  unknownFlag: number;
  unknownShort: number;
  unknownByte2: number;
}

export function parseLordCaptive(body: Buffer): LordCaptivePacket | null {
  if (body.length < 48) return null;

  let offset = 0;

  const rawHeader = body.subarray(offset, offset + 4);
  offset += 4;

  const guildTag = body.toString('ascii', offset, offset + 3);
  offset += 3;

  let nameEnd = offset;
  while (nameEnd < offset + 13 && body[nameEnd] !== 0) nameEnd++;
  const playerName = body.toString('ascii', offset, nameEnd);
  offset += 13;

  const rawLocation = body.subarray(offset, offset + 3);
  offset += 3;

  const unknownByte1 = body[offset];
  offset += 1;

  const prisonEndTimestamp = body.readUInt32LE(offset);
  offset += 4;

  const unknownUint1 = body.readUInt32LE(offset);
  offset += 4;

  const unknownUint2 = body.readUInt32LE(offset);
  offset += 4;

  const captorBounty = body.readUInt32LE(offset);
  offset += 4;

  const rescueBounty = body.readUInt32LE(offset);
  offset += 4;

  const unknownFlag = body[offset];
  offset += 1;

  const unknownShort = body.readUInt16LE(offset);
  offset += 2;

  const unknownByte2 = body[offset];

  return {
    rawHeader,
    guildTag,
    playerName,
    rawLocation,
    unknownByte1,
    prisonEndTimestamp,
    unknownUint1,
    unknownUint2,
    captorBounty,
    rescueBounty,
    unknownFlag,
    unknownShort,
    unknownByte2,
  };
}
