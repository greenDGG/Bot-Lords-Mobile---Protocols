import { EventEmitter } from 'events';

/**
 * Coordinador de caza compartido entre TODAS las BotInstance del proceso.
 *
 * El 2488 no tiene proto de "unirse a un ataque": la coordinación es puramente
 * lógica del lado del bot. Cada tile con un monstruo en caza es un "squad"
 * (un `HuntSquad`), y el número de bots que deben golpearlo por vuelta se
 * calcula con el HP real (0-100, siempre lo del servidor vía 2201/2220) y el
 * daño medio observado en los 2220 de HP:
 *
 *   needed = ceil(hpRestante * 1.05 / dañoMedio)   [1 .. policy.max]
 *
 * Sin datos de daño se asume 1 golpe (manda 1 bot y aprende). Un bot que ya
 * está cubierto por otros (`active >= needed`) queda "surplus": se libera y
 * va a por otro bicho en vez de gastar energía de más.
 */

/** Política tomada de config.hunt.squad */
export interface SquadPolicy {
  /** false → exclusión estricta: 1 solo bot por bicho, nunca se unen otros */
  enable: boolean;
  /** máximo de bots que pueden golpear el mismo bicho */
  max: number;
}

export interface SquadMember {
  iggId: number;
  joinedAt: number;
  /** hasta cuándo este bot está ocupado (golpe en vuelta + espera de vuelta) */
  busyUntil: number;
  lastHitAt: number;
  /** actividad reciente; un miembro viejo se prunea solo */
  updatedAt: number;
}

export interface HuntSquad {
  tileId: number;
  x: number;
  y: number;
  level: number;
  /** HP en % (0-100) reportado por el servidor */
  hp: number;
  hpAt: number;
  hpSource: 'claim' | '2201' | '2220';
  startedAt: number;
  /** última política vista de config.hunt.squad (la refresca el bot que habla) */
  policy: SquadPolicy;
  members: Map<number, SquadMember>;
}

export interface HitGate {
  ok: boolean;
  reason?: 'dead' | 'surplus';
  /** golpes que faltan para matar al bicho */
  needed: number;
  /** miembros ocupados (golpe en vuelta/espera) que no soy yo */
  active: number;
  hp: number;
  /** daño medio en % por golpe; 0 = sin datos todavía */
  avgDamage: number;
}

export interface SquadView {
  tileId: number;
  x: number;
  y: number;
  level: number;
  hp: number;
  needed: number;
  active: number;
  members: number[];
  startedAt: number;
}

const STALE_MEMBER_MS = 10 * 60_000;
const DAMAGE_SAMPLE = 10;
const HISTORY_LIMIT = 60;

class HuntCoordinator extends EventEmitter {
  private squads = new Map<number, HuntSquad>();
  /** daño observado por bot y nivel (`iggId:level`) en % de HP */
  private damageByBot = new Map<string, number[]>();
  /** daño observado por nivel, de cualquier bot */
  private damageByLevel = new Map<number, number[]>();

  // ── consulta ────────────────────────────────────────────────────────────

  peek(tileId: number): HuntSquad | null {
    const sq = this.squads.get(tileId);
    if (!sq) return null;
    this.prune(sq);
    if (sq.members.size === 0) {
      this.squads.delete(tileId);
      return null;
    }
    return sq;
  }

  /** ¿Puede este bot tomar/reclamar el tile (crear o unirse al squad)? */
  canClaim(iggId: number, tileId: number, policy: SquadPolicy): { ok: boolean; message?: string } {
    const sq = this.peek(tileId);
    if (!sq) return { ok: true };
    sq.policy = policy;
    if (sq.members.has(iggId)) return { ok: true };
    if (sq.members.size >= this.needed(sq)) {
      return { ok: false, message: `Otro bot ya está cazando ese bicho (HP ${sq.hp.toFixed(0)}%)` };
    }
    return { ok: true };
  }

  /** ¿Hay lugar para un bot más en el squad del tile? (para elegir candidatos) */
  hasRoom(tileId: number, policy: SquadPolicy): boolean {
    const sq = this.peek(tileId);
    if (!sq) return true;
    if (sq.members.size === 0) return true;
    sq.policy = policy;
    return sq.members.size < this.needed(sq);
  }

  /**
   * Decisión de golpe. `ok:false` con reason 'surplus' → este bot no hace
   * falta (otros ya cubren los golpes que faltan): libere y vaya a otro bicho.
   * 'dead' → el HP compartido ya llegó a 0.
   */
  canHit(iggId: number, tileId: number, policy: SquadPolicy): HitGate {
    const sq = this.squads.get(tileId);
    if (!sq) return { ok: true, needed: 0, active: 0, hp: 0, avgDamage: 0 };
    this.prune(sq);
    sq.policy = policy;
    const now = Date.now();
    const me = sq.members.get(iggId);
    if (me) me.updatedAt = now;
    const needed = this.needed(sq);
    const avgDamage = this.avgDamage(sq);
    if (sq.hp <= 0) return { ok: false, reason: 'dead', needed, active: 0, hp: sq.hp, avgDamage };
    let active = 0;
    for (const m of sq.members.values()) {
      if (m.iggId === iggId) continue;
      if (m.busyUntil > now) active++;
    }
    if (active >= needed) return { ok: false, reason: 'surplus', needed, active, hp: sq.hp, avgDamage };
    return { ok: true, needed, active, hp: sq.hp, avgDamage };
  }

  /** Vista para la UI (una línea por bicho en caza). */
  snapshot(): SquadView[] {
    const now = Date.now();
    const out: SquadView[] = [];
    for (const sq of [...this.squads.values()]) {
      this.prune(sq);
      if (sq.members.size === 0) {
        this.squads.delete(sq.tileId);
        continue;
      }
      out.push({
        tileId: sq.tileId,
        x: sq.x,
        y: sq.y,
        level: sq.level,
        hp: sq.hp,
        needed: this.needed(sq),
        active: [...sq.members.values()].filter(m => m.busyUntil > now).length,
        members: [...sq.members.keys()].sort((a, b) => a - b),
        startedAt: sq.startedAt,
      });
    }
    return out.sort((a, b) => a.x - b.x || a.y - b.y);
  }

  // ── mutación ────────────────────────────────────────────────────────────

  claim(
    iggId: number,
    tile: { id: number; x: number; y: number; level: number; hp: number },
    policy: SquadPolicy,
  ): { ok: boolean; message?: string } {
    const gate = this.canClaim(iggId, tile.id, policy);
    if (!gate.ok) return gate;
    const now = Date.now();
    let sq = this.squads.get(tile.id);
    if (!sq) {
      sq = {
        tileId: tile.id,
        x: tile.x,
        y: tile.y,
        level: tile.level,
        hp: tile.hp,
        hpAt: now,
        hpSource: 'claim',
        startedAt: now,
        policy,
        members: new Map(),
      };
      this.squads.set(tile.id, sq);
    } else {
      sq.level = tile.level;
      sq.policy = policy;
    }
    const prev = sq.members.get(iggId);
    sq.members.set(iggId, {
      iggId,
      joinedAt: prev?.joinedAt ?? now,
      busyUntil: prev?.busyUntil ?? 0,
      lastHitAt: prev?.lastHitAt ?? 0,
      updatedAt: now,
    });
    if (tile.hp > 0 && tile.hp <= 100) {
      sq.hp = tile.hp;
      sq.hpAt = now;
      sq.hpSource = 'claim';
    }
    this.emitChanged();
    return { ok: true };
  }

  /** Sale el bot de todos los squads (kill, stop, surplus, desconexión). */
  release(iggId: number): void {
    let changed = false;
    for (const sq of [...this.squads.values()]) {
      if (sq.members.delete(iggId)) changed = true;
      if (sq.members.size === 0) this.squads.delete(sq.tileId);
    }
    if (changed) this.emitChanged();
  }

  /** El bot acaba de mandar un 2488 / está esperando su vuelta: está ocupado. */
  markBusy(iggId: number, tileId: number, busyUntil: number): void {
    const m = this.squads.get(tileId)?.members.get(iggId);
    if (!m) return;
    m.busyUntil = busyUntil;
    m.updatedAt = Date.now();
    this.emitChanged();
  }

  /** HP leído en un 2201/2220 (cualquier origen) → lo ve todo el squad. */
  updateHp(tileId: number, hp: number, source: '2201' | '2220'): void {
    const sq = this.squads.get(tileId);
    if (!sq) return;
    const v = Math.max(0, Math.min(100, hp));
    if (v === sq.hp && source === '2201') return;
    sq.hp = v;
    sq.hpAt = Date.now();
    sq.hpSource = source;
    this.emitChanged();
  }

  /** Golpe confirmado por el 2220: HP nuevo + daño observado por el squad. */
  reportHit(iggId: number, tileId: number, hpBefore: number, hpAfter: number): void {
    const sq = this.squads.get(tileId);
    if (!sq) return;
    const now = Date.now();
    const before = Math.max(0, Math.min(100, hpBefore));
    const after = Math.max(0, Math.min(100, hpAfter));
    const damage = before - after;
    if (damage > 0) {
      const key = `${iggId}:${sq.level}`;
      push(this.damageByBot, key, damage);
      push(this.damageByLevel, sq.level, damage);
      const me = sq.members.get(iggId);
      if (me) {
        me.lastHitAt = now;
        me.updatedAt = now;
      }
    }
    sq.hp = after;
    sq.hpAt = now;
    sq.hpSource = '2220';
    this.emitChanged();
  }

  // ── internos ────────────────────────────────────────────────────────────

  /** Solo para tests: limpia squads e históricos de daño. */
  reset(): void {
    this.squads.clear();
    this.damageByBot.clear();
    this.damageByLevel.clear();
  }

  /** Golpes necesarios para matar al bicho (0-100 / daño medio por golpe). */
  private needed(sq: HuntSquad): number {
    if (sq.hp <= 0) return 0;
    if (!sq.policy.enable) return 1;
    const avg = this.avgDamage(sq);
    if (avg <= 0) return 1;
    return Math.max(1, Math.min(sq.policy.max, Math.ceil((sq.hp * 1.05) / avg)));
  }

  /**
   * Daño medio (% de HP por golpe): primero los miembros del squad (su nivel),
   * luego el histórico global del nivel, 0 si todavía nadie golpeó.
   */
  private avgDamage(sq: HuntSquad): number {
    const samples: number[] = [];
    for (const m of sq.members.values()) {
      const arr = this.damageByBot.get(`${m.iggId}:${sq.level}`);
      if (arr?.length) samples.push(...arr.slice(-DAMAGE_SAMPLE));
    }
    if (samples.length === 0) {
      const lvl = this.damageByLevel.get(sq.level);
      if (lvl?.length) samples.push(...lvl.slice(-DAMAGE_SAMPLE));
    }
    if (samples.length === 0) return 0;
    return samples.reduce((a, b) => a + b, 0) / samples.length;
  }

  private prune(sq: HuntSquad): void {
    const now = Date.now();
    for (const m of [...sq.members.values()]) {
      if (now - m.updatedAt > STALE_MEMBER_MS) sq.members.delete(m.iggId);
    }
    if (sq.members.size === 0) this.squads.delete(sq.tileId);
  }

  private emitChanged(): void {
    this.emit('changed');
  }
}

function push(map: Map<string | number, number[]>, key: string | number, value: number): void {
  const arr = map.get(key) ?? [];
  arr.push(value);
  if (arr.length > HISTORY_LIMIT) arr.splice(0, arr.length - HISTORY_LIMIT);
  map.set(key, arr);
}

export const huntCoordinator = new HuntCoordinator();
