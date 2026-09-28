import { decodeCoordId } from '../src/models/map-coords';
const samples: Array<[string, string]> = [
  ['accel coord9', '360200'],
  ['accel coord12', '110200'],
  ['otro coord9', '37027b'],
  ['otro coord12', 'c60100'],
];
for (const [label, h] of samples) {
  const b = Buffer.from(h, 'hex');
  const id = (b[0]! << 16) | (b[1]! << 8) | b[2]!;
  console.log(label, h, JSON.stringify(decodeCoordId(id)));
}
