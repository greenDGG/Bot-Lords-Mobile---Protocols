export interface GuildApplication {
  userId: number;
  userIdHex: string;
  unknown1: number;
  unknown1Hex: string;
  name: string;
  nameRaw: string;
  power: number;
  powerHex: string;
  troopsKilled: number;
  troopsKilledHex: string;
}

export interface GuildApplicationsData {
  version: number;
  applications: GuildApplication[];
  fetchedAt: number;
}
