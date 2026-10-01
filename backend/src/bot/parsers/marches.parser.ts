import { decodeCoordBytes } from '../../models/map-coords';
import { TroopTier } from '../../models/troop-state';
import { MarchTroopEntry, OwnMarch, OwnMarchesData, OwnMarchStatus } from '../models/march.types';

/** 1B índice + 149B cuerpo. */
const ENTRY_SIZE = 150;

const OFFSET_STATE = 0;
const OFFSET_HEROES = 1; // 5×u16
const OFFSET_TROOPS = 11; // 16×u32, orden 2401 (type*4 + tier-1)
const OFFSET_COORD = 75;
const OFFSET_FIELD106 = 106;
const OFFSET_NAME_FROM = 104;
const OFFSET_NAME_TO = 126;
const OFFSET_TS = 126;
const OFFSET_DURATION = 134;
const HERO_SLOTS = 5;
const TROOP_SLOTS = 16; // Inf/Rng/Cav/Sie × T1..T4 (los T5 del 2401 no viajan)

function statusFromByte(b: number): OwnMarchStatus {
  if (b === 6) return 'flying';
  if (b === 1) return 'arrived';
  return 'unknown';
}

/**
 * Nombre ASCII dentro de [104..126): primera run de ≥3 chars imprimibles
 * terminada en null. El campo arranca @114 en vuelo y @113 al llegar
 * (desfase de 1 byte no resuelto), por eso se busca en vez de leer fijo.
 */
function readName(corp: Buffer): string {
  for (let i = OFFSET_NAME_FROM; i + 3 <= OFFSET_NAME_TO; i++) {
    const c = corp[i]!;
    if (c < 33 || c > 126) continue;
    let end = i;
    while (end < OFFSET_NAME_TO && corp[end]! >= 32 && corp[end]! <= 126) end++;
    if (end - i >= 3 && end < OFFSET_NAME_TO && corp[end] === 0) {
      return corp.subarray(i, end).toString('ascii');
    }
  }
  return '';
}

/**
 * 2414 — lista de marchas propias del castillo. Llega S→C solo, sin request.
 *
 * Body: [0] u8 límite, [1] u8 count, luego count × entry (150B).
 * Cuerpo de cada entry (offsets relativos al cuerpo, sin el byte índice):
 *   @0        u8       estado (06 = en vuelo, 01 = llegó — abierta)
 *   @1..10    5×u16    IDs de héroes (0 = slot libre)
 *   @11..74   16×u32   conteo de tropas por slot — orden 2401:
 *                      idx = type*4 + (tier-1) → Inf T1..T4, Rng T1..T4,
 *                      Cav T1..T4, Sie T1..T4 (T5 no viajan en 2414)
 *   @75..77   3B       coordenada de destino (codificación 2201)
 *   @106..107 u16      sin decifrar (0 en vuelo / 7689 al llegar)
 *   @104..125 ASCII    nombre null-padded (¿destino?)
 *   @126..133 u64      epoch s inicio (0 si llegó)
 *   @134..137 u32      duración s (0 si llegó)
 *
 * Ancla de la composición: en las capturas de docs/teories/marchs.md
 * ("2 de t3 infantería") el slot idx2 = 2 exactamente (Inf T3 = 2).
 */
export function parse2414(body: Buffer): OwnMarchesData | null {
  if (body.length < 2) return null;
  const limit = body[0]!;
  const count = body[1]!;
  if (body.length < 2 + count * ENTRY_SIZE) return null;

  const entries: OwnMarch[] = [];
  let off = 2;
  for (let i = 0; i < count; i++) {
    const index = body[off]!;
    const corp = body.subarray(off + 1, off + ENTRY_SIZE);
    const state = corp[OFFSET_STATE]!;
    const heroIds: number[] = [];
    for (let h = 0; h < HERO_SLOTS; h++) {
      const id = corp.readUInt16LE(OFFSET_HEROES + h * 2);
      if (id !== 0) heroIds.push(id);
    }
    const troops: MarchTroopEntry[] = [];
    for (let slot = 0; slot < TROOP_SLOTS; slot++) {
      const c = corp.readUInt32LE(OFFSET_TROOPS + slot * 4);
      if (c !== 0) {
        troops.push({
          type: Math.floor(slot / 4) as MarchTroopEntry['type'],
          tier: ((slot % 4) + 1) as TroopTier,
          count: c,
        });
      }
    }
    const [b0, b1, b2] = [corp[OFFSET_COORD]!, corp[OFFSET_COORD + 1]!, corp[OFFSET_COORD + 2]!];
    const dest = decodeCoordBytes([b0, b1, b2]);
    entries.push({
      index,
      state,
      status: statusFromByte(state),
      heroIds,
      troops,
      destCoordBytes: [b0, b1, b2],
      destX: dest.x,
      destY: dest.y,
      name: readName(corp),
      startAt: Number(corp.readBigUInt64LE(OFFSET_TS)),
      durationSec: corp.readUInt32LE(OFFSET_DURATION),
      unknown106: corp.readUInt16LE(OFFSET_FIELD106),
    });
    off += ENTRY_SIZE;
  }

  return { limit, count, entries };
}
