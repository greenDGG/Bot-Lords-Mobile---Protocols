import { getMapWindow, requestMapDataPackets } from '../src/bot/commands/map.commands';

const x = parseInt(process.argv[2]);
const y = parseInt(process.argv[3]);

if (isNaN(x) || isNaN(y)) {
  console.log('Uso: npx ts-node scripts/test-proto.ts <X> <Y>');
  console.log('Ejemplo: npx ts-node scripts/test-proto.ts 100 100');
  process.exit(1);
}

const { gridX, gridY, base, cells } = getMapWindow(x, y);
const packets = requestMapDataPackets(x, y);

console.log(`X=${x} Y=${y}`);
console.log(`gridX = ${gridX}`);
console.log(`gridY = ${gridY}`);
console.log(`base  = ${base}`);
console.log(`cells = [${cells.join(', ')}]`);
packets.forEach((p, i) => console.log(`2201[${i}] count=${p[0]} HEX = ${p.toString('hex')}`));
