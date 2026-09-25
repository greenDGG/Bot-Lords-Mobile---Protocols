import * as dotenv from 'dotenv';
import * as path from 'path';
import * as dns from 'dns';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

dns.setServers(['8.8.8.8', '8.8.4.4']);

import mongoose from 'mongoose';
import { ConfigModel } from '../src/database/schemas/account.schema';

(async () => {
  await mongoose.connect(process.env.MONGO_URI!);
  const r = await ConfigModel.updateMany({}, { $set: { 'supply.targetPlayer': 'ZGDXSmiling' } });
  console.log('Actualizados:', r.modifiedCount);
  await mongoose.disconnect();
})();
