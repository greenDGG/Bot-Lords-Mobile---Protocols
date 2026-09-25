export interface CargoShipOffer {
  categoryId: number;
  objectId: number;
  quantity: number;
  costResource: number;
  price: number;
  stars: number;
}

export interface CargoShipData {
  timestamp: Date;
  offers: CargoShipOffer[];
  unknownTail: Buffer;
}

const TIMESTAMP_SIZE = 4;
const HEADER_RESERVED = 6;
const SLOT_COUNT = 4;
const SLOT_SIZE = 10;
const TAIL_SIZE = 4;

export function parseCargoShip(payload: Buffer): CargoShipData {
  if (payload.length < TIMESTAMP_SIZE + HEADER_RESERVED + SLOT_COUNT * SLOT_SIZE + TAIL_SIZE) {
    return { timestamp: new Date(0), offers: [], unknownTail: Buffer.alloc(0) };
  }

  let off = 0;
  const ts = payload.readUInt32LE(off);
  off += TIMESTAMP_SIZE + HEADER_RESERVED;

  const offers: CargoShipOffer[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    offers.push({
      categoryId: payload[off],
      objectId: payload[off + 1],
      quantity: payload.readUInt16LE(off + 2),
      costResource: payload[off + 4],
      price: payload.readUInt32LE(off + 5),
      stars: payload[off + 9],
    });
    off += SLOT_SIZE;
  }

  const tail = Buffer.from(payload.subarray(off, off + TAIL_SIZE));
  return { timestamp: new Date(ts * 1000), offers, unknownTail: tail };
}
