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
  /**
   * u32 en el offset absoluto 210 (primeros 4 bytes de `unknownBlock2`):
   * fecha de creación de la cuenta, redondeada a la hora. Su hora del día
   * (UTC) es el reset diario de la cuenta (docs/protocols/1008.md).
   */
  accountCreatedAt: Date;
  unknownBlock2: Buffer;
  energy: number;
  tail: Buffer;
}

export enum BuffCategory { Shield, Fury, AntiScout, ArmyAtk, ArmyDef, ArmySize, Gather, Train, March, Other }

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
