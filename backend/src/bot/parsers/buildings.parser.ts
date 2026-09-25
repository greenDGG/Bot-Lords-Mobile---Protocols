import { BuildingId, BuildingState, ConstructionData, ConstructionEntry } from '../models/buildings.types';

export function parse2001(body: Buffer): BuildingState {
  const state = new BuildingState();
  if (body.length < 1) return state;
  const count = body[0];
  for (let i = 0; i < count; i++) {
    const offset = 1 + i * 5;
    if (offset + 5 > body.length) break;
    const position = body.readUInt16LE(offset);
    const id = body.readUInt16LE(offset + 2) as BuildingId;
    const level = body[offset + 4];
    state.buildings.push({ position, id, level });
  }
  return state;
}

const EntrySize = 18;

export function parse2002(body: Buffer): ConstructionData | null {
  if (body.length < 18) return null;
  let off = 0;
  const list: ConstructionEntry[] = [];
  while (off + EntrySize <= body.length) {
    if (body[off] === 0) {
      list.push({ active: false, position: 0, id: 0, level: 0, timestamp: 0, remainingSeconds: 0 });
    } else {
      list.push({
        active: true,
        position: body.readUInt16LE(off + 1),
        id: body.readUInt16LE(off + 3),
        level: body[off + 5],
        timestamp: body.readUInt32LE(off + 6),
        remainingSeconds: body.readInt32LE(off + 14),
      });
    }
    off += EntrySize;
  }
  let globalTimestamp = 0;
  if (off + 4 <= body.length) globalTimestamp = body.readUInt32LE(off);
  return { constructions: list, globalTimestamp };
}
