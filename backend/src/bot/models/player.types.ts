export interface PlayerInfo {
  header: number;
  playerId: number;
  playerName: string;
  level: number;
  unknown1: number;
  res: number;
  timestamp1: Date;
  timestamp2: Date;
  timestamp3: Date;
  fixedFlag: number;
  flag2: number;
  gems: number;
  unknownBlock1: Buffer;
  castleX: number;
  castleY: number;
  power: number;
  kills: number;
  vipExp: number;
  unknownBlock2: Buffer;
  energy: number;
  tail: Buffer;
}

export enum BuffCategory { Shield, Fury }

export interface BuffDefinition {
  id: number;
  name: string;
  category: BuffCategory;
  durationMs: number;
}

export class BuffInstance {
  def: BuffDefinition;
  start: Date;
  expires: Date;

  constructor(def: BuffDefinition, start: Date, durationMs: number) {
    this.def = def;
    this.start = start;
    this.expires = new Date(start.getTime() + durationMs);
  }

  get remaining(): number {
    const rem = this.expires.getTime() - Date.now();
    return rem > 0 ? rem : 0;
  }
}

export interface PlayerLocationResult {
  sameRealm: boolean;
  coordBytes: [number, number, number];
  x: number;
  y: number;
}
