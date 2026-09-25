import { PacketReader } from '../../models/packet-reader';

export interface GuildInfo {
  guildId: number;
  unknownFlag: number;
  leaderName: string;
  guildKills: number;
  unknown0: number;
  guildTag: string;
  guildDisplayName: string;
  guildTitle: string;
  description: string;
  requirements: string;
  padding: Buffer;
  unknownBlock: Buffer;
  kingdomId: number;
  tail: Buffer;
}

export function parseGuildInfo(packet: Buffer): GuildInfo {
  const r = new PacketReader(packet);
  const guildId = r.readUInt32();
  const unknownFlag = r.readByte();
  const leaderName = r.readAsciiNullTerminated();
  if (r.remaining >= 2) r.skip(2);
  const guildKills = r.readUInt32();
  const unknown0 = r.readUInt32();
  const guildTag = r.readBytes(3).toString('ascii').replace(/\0/g, '');
  const guildDisplayName = r.readAsciiNullTerminated();

  while (r.remaining > 0 && r.peek() === 0) r.skip(1);
  const guildTitle = r.readUtf8NullTerminated();

  while (r.remaining > 0 && r.peek() === 0) r.skip(1);
  const description = r.readUtf8NullTerminated();

  while (r.remaining > 0 && r.peek() === 0) r.skip(1);
  const requirements = r.readUtf8NullTerminated();

  const padStart = r.remaining;
  while (r.remaining > 0 && r.peek() === 0) r.skip(1);
  const padding = packet.subarray(packet.length - padStart, packet.length - (r.remaining > 0 ? r.remaining : 0));

  const remaining = r.readBytes(r.remaining);
  const unknownBlock = Buffer.from(remaining);

  let kingdomId = 0;
  let tail = Buffer.alloc(0);
  for (let i = 0; i <= remaining.length - 4; i += 4) {
    if (remaining.readUInt32LE(i) === 1231) {
      kingdomId = 1231;
      tail = Buffer.from(remaining.subarray(i + 4));
      break;
    }
  }

  return {
    guildId, unknownFlag, leaderName, guildKills, unknown0, guildTag, guildDisplayName,
    guildTitle, description, requirements, padding: Buffer.from(padding),
    unknownBlock, kingdomId, tail,
  };
}
