/**
 * Proto 3610 parser.
 *
 * Structure:
 *   Header (14B): eventType(u16) + missionId(12 bytes)
 *   Level 1 (10B): gems_reward(u16) + separator(u16) + gems_value(u32) + sinValorar(u8) + end(u8)
 *   Level 2 (10B): same as level 1
 *   Level 3 (10B): same as level 1
 *   Counts (4B):   count1(u8) + count2(u8) + count3(u8) + separator(u8)
 *   Rewards: count1*4B + count2*4B + count3*4B
 *
 * Uso: npx ts-node scripts/test-parse-3610.ts <hex>
 */

function parse3610(hex: string) {
  const buf = Buffer.from(hex.replace(/\s/g, ''), 'hex');
  let off = 0;

  // Header (14 bytes)
  const eventType = buf.readUInt16LE(off); off += 2;
  const missionId = buf.readUInt32LE(off); off += 4;
  off += 8; // rest of mission ID (12 bytes total)
  console.log(`Tipo de evento: ${eventType}`);
  console.log(`Mission ID: 0x${missionId.toString(16).padStart(8, '0')}`);

  // Level 1 (10 bytes)
  const gemsReward1 = buf.readUInt16LE(off); off += 2;
  off += 2; // separator
  const gemsValue1 = buf.readUInt32LE(off); off += 4;
  const sinValorar1 = buf[off++];
  off++; // end byte
  console.log(`\nNivel 1: gems_entrega=${gemsReward1}  valor_gemas=${gemsValue1}  sinValorar=${sinValorar1}`);

  // Level 2 (10 bytes)
  const gemsReward2 = buf.readUInt16LE(off); off += 2;
  off += 2; // separator
  const gemsValue2 = buf.readUInt32LE(off); off += 4;
  const sinValorar2 = buf[off++];
  off++; // end byte
  console.log(`Nivel 2: gems_entrega=${gemsReward2}  valor_gemas=${gemsValue2}  sinValorar=${sinValorar2}`);

  // Level 3 (10 bytes)
  const gemsReward3 = buf.readUInt16LE(off); off += 2;
  off += 2; // separator
  const gemsValue3 = buf.readUInt32LE(off); off += 4;
  const sinValorar3 = buf[off++];
  off++; // end byte
  console.log(`Nivel 3: gems_entrega=${gemsReward3}  valor_gemas=${gemsValue3}  sinValorar=${sinValorar3}`);

  // Counts (4 bytes)
  const c1 = buf[off++];
  const c2 = buf[off++];
  const c3 = buf[off++];
  off++; // separator
  console.log(`\nRegistros: N1=${c1} N2=${c2} N3=${c3} total=${c1 + c2 + c3}`);

  // Rewards
  const counts = [c1, c2, c3];
  const total = c1 + c2 + c3;
  console.log(`\nRecompensas (offset ${off}):`);

  let level = 0;
  let consumed = 0;
  for (let i = 0; i < total && off + 3 <= buf.length; i++) {
    const itemId = buf.readUInt16LE(off);
    const amount = buf[off + 2];
    off += 4;
    console.log(`  #${String(i + 1).padStart(2)}: N${level + 1}  0x${itemId.toString(16).padStart(4, '0')} (${itemId})  x${amount}`);
    consumed++;
    if (level < 3 && consumed >= counts[level]) { level++; consumed = 0; }
  }

  console.log(`\nValor gemas total: ${gemsValue1 + gemsValue2 + gemsValue3}`);
}

const hex = process.argv[2];
if (!hex) { console.log('Uso: npx ts-node scripts/test-parse-3610.ts <hex>'); process.exit(1); }
parse3610(hex);
