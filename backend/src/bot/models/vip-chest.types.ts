export interface VipChestMemory {
  mask: number;
  lastClaimTimestamp: number;
  nextClaim: number;
  nextIndex: number;
}

export const VIP_CHEST_SLOTS = 10;
export const VIP_CHEST_COOLDOWN = 3600;

function findFreeSlot(mask: number): number {
  for (let i = 0; i < VIP_CHEST_SLOTS; i++) {
    if (!(mask & (1 << i))) return i;
  }
  return -1;
}

export function isVipChestRejected(body: Buffer): boolean {
  return body.length >= 6 && body[0] !== 0;
}

export function parseVipChest(body: Buffer): VipChestMemory | null {
  if (body.length < 6) return null;
  if (body[0] !== 0) return null;
  const mask = body.readUInt16BE(0);
  const lastClaimTimestamp = body.readUInt32LE(2);
  const nextClaim = lastClaimTimestamp + VIP_CHEST_COOLDOWN;
  return { mask, lastClaimTimestamp, nextClaim, nextIndex: findFreeSlot(mask) };
}

export function isVipChestClaimed(mask: number, index: number): boolean {
  return (mask & (1 << index)) !== 0;
}

export function getVipChestState(mask: number): boolean[] {
  const state: boolean[] = [];
  for (let i = 0; i < VIP_CHEST_SLOTS; i++) {
    state.push((mask & (1 << i)) !== 0);
  }
  return state;
}
