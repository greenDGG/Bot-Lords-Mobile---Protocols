import { BotEngine } from '../engine/bot-engine';
import { WarEvent } from '../models/war.types';
import { MessagePacket } from '../network/message-packet';
import { send2476 } from '../commands/war.commands';
import { decodeCoordBytes } from '../../models/map-coords';

export class WarDetector {
  private activeWars: WarEvent[] = [];
  private last2476 = 0;
  private readonly cooldown = 5000;
  private viewing = false;
  private notifyCount = 0;

  onWarsUpdated?: (wars: WarEvent[]) => void;
  onNotification?: (count: number) => void;

  constructor(private bot: BotEngine, private iggId: number) {
    bot.on('packet', (mp: MessagePacket) => this.handlePacket(mp));
  }

  get activeWarsList(): WarEvent[] {
    return [...this.activeWars];
  }

  get notificationCount(): number {
    return this.notifyCount;
  }

  setViewing(v: boolean): void {
    this.viewing = v;
    if (v) {
      this.notifyCount = 0;
      this.requestData();
    }
  }

  clearNotification(): void {
    this.notifyCount = 0;
  }

  requestData(): void {
    const now = Date.now();
    if (now - this.last2476 < this.cooldown) return;
    this.last2476 = now;
    this.bot.enqueueCommand(async () => {
      this.bot.log('[AGRU] Solicitando 2476...');
      send2476(this.bot);
    });
  }

  canSend2476(): boolean {
    const now = Date.now();
    if (now - this.last2476 < this.cooldown) return false;
    this.last2476 = now;
    return true;
  }

  private handlePacket(mp: MessagePacket): void {
    const body = mp.data.length > 4 ? mp.data.subarray(4) : mp.data;
    const proto = mp.protocolId;

    if (proto === 2477) {
      const isStart = body.length > 0 && body[0] === 0x01;
      if (!isStart) {
        this.notifyCount = Math.max(0, this.notifyCount - 1);
        this.bot.log(`[AGRU] 2477 fin (pendiente #${this.notifyCount})`);
        this.onNotification?.(this.notifyCount);
      } else if (!this.viewing) {
        this.notifyCount++;
        this.bot.log(`[AGRU] 2477 inicio (pendiente #${this.notifyCount})`);
        this.onNotification?.(this.notifyCount);
      }
    } else if (proto === 2485) {
      // 2485 = update notification, server pushes 2478 automatically when in UI
    } else if (proto === 2478 && body.length >= 12) {
      this.bot.log(`[AGRU] 2478 raw (${body.length}b): ${body.toString('hex')}`);
      this.handle2478(body);
    } else if (proto === 6611 && body.length >= 12) {
      this.handle6611(body);
    } else if (proto === 7315 && body.length >= 10) {
      this.bot.log(`[AGRU] 7315 raw (${body.length}b): ${body.toString('hex')}`);
      this.handle7315(body);
    }
  }

  private handle2478(payload: Buffer): void {
    let off = 6;
    if (off >= payload.length) return;

    const parsed: WarEvent[] = [];

    while (off + 58 <= payload.length) {
      const ts = payload.readUInt32LE(off); off += 4;
      off += 4; // padding
      const timeRem = payload.readUInt16LE(off); off += 2;
      off += 2; // padding

      // PointCode 3 bytes → decoded coordinates
      const coord = decodeCoordBytes([payload[off], payload[off + 1], payload[off + 2]]);
      off += 3;

      off += 2; // AllyHead

      // AllyName 13 bytes fixed
      const rawName1 = payload.toString('ascii', off, off + 13);
      const rallyLeader = rawName1.replace(/\0+$/, '');
      off += 13;

      // RallyType: 00=unirse a agrupación, 01=ayudar al aliado (reforzar)
      const rallyType = payload[off];
      off += 15; // between fields (RallyType + AllyVIP, AllyRank, troops, kingdom, etc.)

      // EnemyName 13 bytes fixed
      const rawName2 = payload.toString('ascii', off, off + 13);
      const enemyName = rawName2.replace(/\0+$/, '');
      off += 13;

      if (!rallyLeader && coord.x === 0 && coord.y === 0 && timeRem === 0) break;

      const rallyTypeStr = rallyType === 0x01 ? 'refuerzo' : 'agrupacion';
      parsed.push({
        iggId: this.iggId,
        active: true,
        detectedAt: new Date(),
        warTimestamp: new Date(ts * 1000),
        timeRemainingSec: timeRem,
        coordX: coord.x,
        coordY: coord.y,
        rallyLeader,
        enemyName,
        rallyType,
        index: 0,
        type: 'castle',
      });
    }

    const currentIds = new Set(parsed.map(w => `${w.coordX},${w.coordY}|${w.rallyLeader}`));
    for (const prev of this.activeWars) {
      const key = `${prev.coordX},${prev.coordY}|${prev.rallyLeader}`;
      if (!currentIds.has(key)) {
        prev.active = false;
        this.bot.log(`[AGRU] Guerra terminada: ${prev.rallyLeader}`);
      }
    }

    this.activeWars = this.activeWars.filter(w => w.active || w.timeRemainingSec > 0);
    for (const w of parsed) {
      const existing = this.activeWars.find(x => x.coordX === w.coordX && x.coordY === w.coordY);
      if (existing) {
        existing.timeRemainingSec = w.timeRemainingSec;
        existing.warTimestamp = w.warTimestamp;
        existing.rallyLeader = w.rallyLeader;
        existing.enemyName = w.enemyName;
      } else {
        this.activeWars.push(w);
      }
    }

    const sorted = this.activeWars.filter(w => w.active).sort((a, b) => a.timeRemainingSec - b.timeRemainingSec);
    for (let i = 0; i < sorted.length; i++) sorted[i].index = i;

    this.bot.log(`[AGRU] 2478 parseado: ${parsed.length} grupos (${parsed.filter(w => w.rallyType === 1).length} refuerzos, ${parsed.filter(w => w.rallyType === 0).length} agrupaciones), ${this.activeWars.filter(w => w.active).length} activos`);
    this.onWarsUpdated?.(this.activeWars);
  }

  private handle6611(payload: Buffer): void {
    let off = 6;
    if (off >= payload.length) return;

    const parsed: WarEvent[] = [];
    while (off + 12 <= payload.length) {
      const ts = payload.readUInt32LE(off); off += 4;
      off += 4;
      const timeRem = payload.readInt32LE(off); off += 4;
      const cx = payload.readUInt16LE(off); off += 2;
      const cy = payload.readUInt16LE(off); off += 2;
      off += 1;
      const nameStart = off;
      while (off < payload.length && payload[off] !== 0) off++;
      const rallyLeader = off > nameStart ? payload.toString('ascii', nameStart, off) : '';
      if (off < payload.length) off++;
      while (off < payload.length && payload[off] === 0) off++;

      if (!rallyLeader && cx === 0 && cy === 0 && timeRem === 0) break;

      parsed.push({
        iggId: this.iggId,
        active: true,
        detectedAt: new Date(),
        warTimestamp: new Date(ts * 1000),
        timeRemainingSec: timeRem,
        coordX: cx,
        coordY: cy,
        rallyLeader,
        enemyName: '',
        rallyType: 0,
        index: 0,
        type: 'tower',
      });
    }

    this.activeWars = this.activeWars.filter(w => w.type !== 'tower');
    for (const w of parsed) {
      const existing = this.activeWars.find(x => x.coordX === w.coordX && x.coordY === w.coordY && x.type === w.type);
      if (existing) {
        existing.timeRemainingSec = w.timeRemainingSec;
        existing.warTimestamp = w.warTimestamp;
        existing.rallyLeader = w.rallyLeader;
      } else {
        this.activeWars.push(w);
      }
    }

    const sorted = this.activeWars.filter(w => w.active).sort((a, b) => a.timeRemainingSec - b.timeRemainingSec);
    for (let i = 0; i < sorted.length; i++) sorted[i].index = i;

    this.bot.log(`[AGRU] 6611 parseado: ${parsed.length} torres`);
    this.onWarsUpdated?.(this.activeWars);
  }

  private handle7315(payload: Buffer): void {
    let off = 0;
    if (off >= payload.length) return;

    const parsed: WarEvent[] = [];

    while (off + 35 <= payload.length) {
      const startOff = off;
      const pad1 = payload.readUInt32LE(off); off += 4;
      const sep1 = payload[off]; off += 1;
      const ts = payload.readUInt32LE(off); off += 4;
      const pad2 = payload.readUInt32LE(off); off += 4;
      const timeRem = payload.readUInt16LE(off); off += 2;
      const pad3 = payload.readUInt16LE(off); off += 2;
      const iconType = payload.readUInt16LE(off); off += 2;
      const iconId = payload.readUInt16LE(off); off += 2;

      // Fixed 13-byte null-padded name
      const rawName = payload.toString('ascii', off, off + 13);
      const rallyLeader = rawName.replace(/\0+$/, '');
      off += 13;
      const sep2 = payload[off]; off += 1;

      let subType = 0;
      let troopsCurrent = 0;
      let troopsMax = 0;
      let kingdom = 0;
      let loc0 = 0;
      let loc1 = 0;
      let loc2 = 0;
      let level = 0;

      if (off + 2 <= payload.length) { subType = payload.readUInt16LE(off); off += 2; }
      if (off + 4 <= payload.length) { troopsCurrent = payload.readUInt32LE(off); off += 4; }
      if (off + 4 <= payload.length) { troopsMax = payload.readUInt32LE(off); off += 4; }
      if (off + 2 <= payload.length) { kingdom = payload.readUInt16LE(off); off += 2; }
      if (off < payload.length) { loc0 = payload[off]; off += 1; }
      if (off < payload.length) { loc1 = payload[off]; off += 1; }
      if (off < payload.length) { loc2 = payload[off]; off += 1; }
      if (off < payload.length) { level = payload[off]; off += 1; }
      off += 2;

      if (!rallyLeader && timeRem === 0 && ts === 0) break;

      parsed.push({
        iggId: this.iggId,
        active: true,
        detectedAt: new Date(),
        warTimestamp: new Date(ts * 1000),
        timeRemainingSec: timeRem,
        coordX: loc0 | (loc1 << 8),
        coordY: loc2,
        rallyLeader,
        enemyName: '',
        rallyType: 0,
        index: 0,
        type: 'fortress',
      });
    }

    this.activeWars = this.activeWars.filter(w => w.type !== 'fortress');
    for (const w of parsed) {
      const existing = this.activeWars.find(x => x.coordX === w.coordX && x.coordY === w.coordY && x.type === w.type);
      if (existing) {
        existing.timeRemainingSec = w.timeRemainingSec;
        existing.warTimestamp = w.warTimestamp;
        existing.rallyLeader = w.rallyLeader;
      } else {
        this.activeWars.push(w);
      }
    }

    const sorted = this.activeWars.filter(w => w.active).sort((a, b) => a.timeRemainingSec - b.timeRemainingSec);
    for (let i = 0; i < sorted.length; i++) sorted[i].index = i;

    this.bot.log(`[AGRU] 7315 parseado: ${parsed.length} fortalezas`);
    this.onWarsUpdated?.(this.activeWars);
  }
}
