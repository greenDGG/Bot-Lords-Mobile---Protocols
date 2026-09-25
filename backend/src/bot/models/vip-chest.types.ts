export interface VipChestMemory {
  mask: number;
  lastClaimTimestamp: number;
  nextClaim: number;
  nextIndex: number;
}

export function parseVipChest(body: Buffer): VipChestMemory | null {
  if (body.length < 6) return null;
  const mask = body.readUInt16LE(0);
  const lastClaimTimestamp = body.readUInt32LE(2);
  const nextClaim = lastClaimTimestamp + 3600;
  let nextIndex = -1;
  for (let i = 0; i < 10; i++) {
    if (!(mask & (1 << i))) {
      nextIndex = i;
      break;
    }
  }
  return { mask, lastClaimTimestamp, nextClaim, nextIndex };
}

export function isVipChestClaimed(mask: number, index: number): boolean {
  return (mask & (1 << index)) !== 0;
}

export function getVipChestState(mask: number): boolean[] {
  const state: boolean[] = [];
  for (let i = 0; i < 10; i++) {
    state.push((mask & (1 << i)) !== 0);
  }
  return state;
}
