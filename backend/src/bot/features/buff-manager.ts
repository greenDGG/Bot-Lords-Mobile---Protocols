import { BuffCategory, BuffInstance } from '../models/player.types';
import { parseBuffs } from '../parsers/player.parser';

/**
 * Estado de los buffs activos del jugador.
 *
 * La fuente de verdad es el proto 1111, que llega como **snapshot completo**
 * (periódicamente y en cada cambio): `handlePacket` reemplaza toda la lista,
 * así que un body con `count = 0` limpia el estado y un paquete mal formado
 * (devuelve `null` el parser) no toca nada.
 */
export class BuffManager {
  private active = new Map<number, BuffInstance>();

  /** Todos los buffs vivos, indexados internamente por itemId. */
  get all(): BuffInstance[] {
    const now = Date.now();
    return [...this.active.values()].filter((b) => b.expires.getTime() > now);
  }

  get shield(): BuffInstance | undefined {
    for (const b of this.active.values()) {
      if (b.def.category === BuffCategory.Shield && b.remaining > 0) return b;
    }
    return undefined;
  }

  get fury(): BuffInstance | undefined {
    for (const b of this.active.values()) {
      if (b.def.category === BuffCategory.Fury && b.remaining > 0) return b;
    }
    return undefined;
  }

  onBuffChanged?: () => void;

  handlePacket(data: Buffer): void {
    const list = parseBuffs(data);
    if (!list) return;

    const next = new Map<number, BuffInstance>();
    for (const b of list) next.set(b.def.id, b);

    if (!this.sameAs(next)) {
      this.active = next;
      this.onBuffChanged?.();
    }
  }

  private sameAs(next: Map<number, BuffInstance>): boolean {
    if (next.size !== this.active.size) return false;
    for (const [id, b] of next) {
      const cur = this.active.get(id);
      if (!cur) return false;
      if (cur.start.getTime() !== b.start.getTime()) return false;
      if (cur.expires.getTime() !== b.expires.getTime()) return false;
    }
    return true;
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
