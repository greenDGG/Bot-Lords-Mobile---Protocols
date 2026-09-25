import { BuffCategory, BuffInstance } from '../models/player.types';
import { getBuffDef } from '../parsers/player.parser';

export class BuffManager {
  private active = new Map<number, BuffInstance>();

  get shield(): BuffInstance | undefined {
    for (const b of this.active.values()) {
      if (b.def.category === BuffCategory.Shield) return b;
    }
    return undefined;
  }

  get fury(): BuffInstance | undefined {
    for (const b of this.active.values()) {
      if (b.def.category === BuffCategory.Fury) return b;
    }
    return undefined;
  }

  onBuffChanged?: () => void;

  handlePacket(data: Buffer): void {
    if (!data || data.length < 4) return;
    try {
      const count = data[0];
      const offset = 3;
      const entrySize = 14;
      let changed = false;

      for (let i = 0; i < count && offset + i * entrySize + entrySize <= data.length; i++) {
        const entryOff = offset + i * entrySize;
        const buffId = data.readUInt16LE(entryOff);
        const known = getBuffDef(buffId);
        if (!known) continue;
        const startTs = Number(data.readBigInt64LE(entryOff + 2));
        const durSec = data.readInt32LE(entryOff + 10);
        const instance = new BuffInstance(known, new Date(startTs * 1000), durSec * 1000);
        this.active.set(buffId, instance);
        changed = true;
      }

      if (changed) this.onBuffChanged?.();
    } catch {}
  }

  cleanupExpired(): boolean {
    const now = Date.now();
    let changed = false;
    for (const [id, buff] of this.active) {
      if (buff.expires.getTime() <= now) {
        this.active.delete(id);
        changed = true;
      }
    }
    if (changed) this.onBuffChanged?.();
    return changed;
  }

  expire(buffId: number): void {
    if (this.active.delete(buffId)) this.onBuffChanged?.();
  }

  clear(): void {
    if (this.active.size === 0) return;
    this.active.clear();
    this.onBuffChanged?.();
  }

  setShield(shield: BuffInstance): void {
    for (const [id, buff] of this.active) {
      if (buff.def.category === BuffCategory.Shield) this.active.delete(id);
    }
    this.active.set(shield.def.id, shield);
    this.onBuffChanged?.();
  }

  setFury(start: Date, durationMs: number): void {
    for (const [id, buff] of this.active) {
      if (buff.def.category === BuffCategory.Fury) this.active.delete(id);
    }
    const furyDef = { id: 0x050A, name: 'Furia', category: BuffCategory.Fury, durationMs };
    this.active.set(furyDef.id, new BuffInstance(furyDef, start, durationMs));
    this.onBuffChanged?.();
  }
}
