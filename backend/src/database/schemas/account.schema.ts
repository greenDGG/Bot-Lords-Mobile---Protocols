import { Schema, Document, model } from 'mongoose';
import type { SupplyConfig } from '../../models/bot-config';

// ── Token ──
export interface IToken extends Document {
  iggId: number;
  proxy: string;
  accessToken: string;
  ssoToken: string;
  raw: any;
}

const TokenSchema = new Schema<IToken>({
  iggId: { type: Number, required: true, unique: true, index: true },
  proxy: { type: String, default: '' },
  accessToken: { type: String, default: '' },
  ssoToken: { type: String, default: '' },
  raw: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

export const TokenModel = model<IToken>('Token', TokenSchema);

// ── Config ──
export interface IConfig extends Document {
  iggId: number;
  autoStart: boolean;
  reconnectTime: number;
  sendHelp: boolean;
  warMode: boolean;
  costumeWar: number;
  costumeNormal: number;
  proxy: string;
  train: any;
  shield: any;
  giftDaily: any;
  mysteryBox: any;
  ship: any;
  forgeGift: any;
  chestVip: any;
  artifactFair: any;
  refineMana: any;
  openGuildChest: any;
  eternalTreasure: any;
  treasureChamber: any;
  adminQuest: any;
  guildQuest: any;
  resourceLimit: any;
  supply: SupplyConfig;
  events: any;
  coliseum: any;
  sweep: any;
  missions: any;
  hunt: any;
  luckyCards: any;
}

const ConfigSchema = new Schema<IConfig>({
  iggId: { type: Number, required: true, unique: true, index: true },
  autoStart: { type: Boolean, default: true },
  reconnectTime: { type: Number, default: 30 },
  sendHelp: { type: Boolean, default: true },
  warMode: { type: Boolean, default: false },
  costumeWar: { type: Number, default: 1 },
  costumeNormal: { type: Number, default: 0 },
  proxy: { type: String, default: '' },
  train: { type: Schema.Types.Mixed, default: {} },
  shield: { type: Schema.Types.Mixed, default: {} },
  giftDaily: { type: Schema.Types.Mixed, default: {} },
  mysteryBox: { type: Schema.Types.Mixed, default: {} },
  ship: { type: Schema.Types.Mixed, default: {} },
  forgeGift: { type: Schema.Types.Mixed, default: {} },
  chestVip: { type: Schema.Types.Mixed, default: {} },
  artifactFair: { type: Schema.Types.Mixed, default: {} },
  refineMana: { type: Schema.Types.Mixed, default: {} },
  openGuildChest: { type: Schema.Types.Mixed, default: {} },
  eternalTreasure: { type: Schema.Types.Mixed, default: {} },
  treasureChamber: { type: Schema.Types.Mixed, default: {} },
  adminQuest: { type: Schema.Types.Mixed, default: {} },
  guildQuest: { type: Schema.Types.Mixed, default: {} },
  resourceLimit: { type: Schema.Types.Mixed, default: {} },
  supply: { type: Schema.Types.Mixed, default: {} },
  events: { type: Schema.Types.Mixed, default: {} },
  coliseum: { type: Schema.Types.Mixed, default: {} },
  sweep: { type: Schema.Types.Mixed, default: { enable: false, payload: '0202010001' } },
  missions: { type: Schema.Types.Mixed, default: { autoEliminate: false, wantedMissionIds: [] } },
  hunt: { type: Schema.Types.Mixed, default: {} },
  luckyCards: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

export const ConfigModel = model<IConfig>('Config', ConfigSchema);
