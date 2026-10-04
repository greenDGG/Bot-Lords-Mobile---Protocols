/**
 * Test del parser de chat 3003 contra muestras REALES de logs.
 *
 * Verifica para cada cuerpo de 3003 bajo logs/:
 *   - todos los mensajes quedan alineados: talkTime dentro de un rango de
 *     unix plausible (si el cálculo de tamaño falla, talkTime es basura)
 *   - num8 = 109 (emoticono) tiene msgLen = 4 y su [id][idx] coincide con
 *     EMOJI.txt del cliente y con data/emojis.json
 *   - num8 = 0 (texto) decodifica UTF-8 sin bytes de relleno raros
 *
 * Uso: npx ts-node scripts/test-parse-chat.ts [dir logs] [dir GameAssets]
 */
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { parseChatMessages, ChatMessage } from '../src/bot/models/chat.types';
import { EMOJI_BY_ID } from '../src/bot/data/emojis-db';

function walk(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.log')) out.push(p);
  }
  return out;
}

const RECV = /Proto=3003 Len=\d+ header=\S+ body=([0-9a-fA-F]+)/;

/** id -> idx de EMOJI.txt del cliente (si conseguimos leerlo). */
function loadClientEmojis(gameassets: string): Map<number, number> {
  const map = new Map<number, number>();
  try {
    const buf = fs.readFileSync(path.join(gameassets, 'EMOJI.txt'));
    const count = buf.readUInt16LE(2);
    const rec = (buf.length - 4) / count;
    for (let i = 0; i < count; i++) {
      const off = 4 + i * rec;
      map.set(buf.readUInt16LE(off), buf.readUInt32LE(off + 4));
    }
  } catch {}
  return map;
}

function main(): void {
  void run();
}

async function run(): Promise<void> {
  const root = process.argv[2] || path.join(__dirname, '..', '..', 'logs');
  const ga = process.argv[3] || 'C:\\Users\\green\\Downloads\\LordsBot-Release\\GameAssets';
  const client = loadClientEmojis(ga);

  // sólo los archivos más recientes: los logs suman millones de líneas
  const files = walk(root)
    .map(f => ({ f, m: fs.statSync(f).mtimeMs }))
    .sort((a, b) => b.m - a.m)
    .slice(0, 20)
    .map(x => x.f);

  let packets = 0;
  let msgs = 0;
  let badTime = 0;
  let emojis = 0;
  let emojiBadLen = 0;
  let emojiNotInDb = 0;
  let emojiIdxMismatch = 0;
  let emojiUnknownClient = 0;
  let emojiIdxClientMismatch = 0;
  let textMsgs = 0;
  let textWithNul = 0;
  const byNum8 = new Map<number, number>();
  const sampleEmoji: ChatMessage[] = [];

  for (const file of files) {
    const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf-8'), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.includes('Proto=3003')) continue;
      const m = RECV.exec(line);
      if (!m || m[1].length % 2 !== 0) continue;
      let body: Buffer;
      try {
        body = Buffer.from(m[1], 'hex');
      } catch {
        continue;
      }
      if (body.length < 54) continue;
      packets++;

      for (const msg of parseChatMessages(body)) {
        msgs++;
        byNum8.set(msg.num8, (byNum8.get(msg.num8) || 0) + 1);
        if (msg.ts < 1_400_000_000 || msg.ts > 2_100_000_000) badTime++;

        if (msg.num8 === 109) {
          emojis++;
          if (msg.emojiId === undefined || msg.emojiIdx === undefined) {
            emojiBadLen++;
            continue;
          }
          const db = EMOJI_BY_ID[msg.emojiId];
          if (!db) emojiNotInDb++;
          else if (db.idx !== msg.emojiIdx) emojiIdxMismatch++;
          if (client.size > 0) {
            const idx = client.get(msg.emojiId);
            if (idx === undefined) emojiUnknownClient++;
            else if (idx !== msg.emojiIdx) emojiIdxClientMismatch++;
          }
          if (sampleEmoji.length < 5) sampleEmoji.push(msg);
        } else if (msg.num8 === 0) {
          textMsgs++;
          if (msg.message.includes('\u0000')) textWithNul++;
        }
      }
    }
  }

  console.log(`archivos .log: ${files.length}  cuerpos 3003: ${packets}  mensajes: ${msgs}`);
  console.log(`num8: ${[...byNum8.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  console.log(`talkTime fuera de rango (desalineación): ${badTime}`);
  console.log(`textos: ${textMsgs}  con NUL (offset raro): ${textWithNul}`);
  console.log(`emoticonos: ${emojis}  sin payload de 4B: ${emojiBadLen}`);
  console.log(`  id fuera de emojis.json (básicos sin nombre): ${emojiNotInDb}`);
  console.log(`  idx != emojis.json: ${emojiIdxMismatch}`);
  if (client.size > 0) {
    console.log(`  id fuera de EMOJI.txt: ${emojiUnknownClient}  idx != EMOJI.txt: ${emojiIdxClientMismatch}`);
  } else {
    console.log('  (EMOJI.txt del cliente no disponible: se omite la verificación cruzada)');
  }
  for (const m of sampleEmoji) {
    console.log(`  ej: id=${m.emojiId} idx=${m.emojiIdx} -> ${m.message}`);
  }

  const fail = badTime > 0 || emojiBadLen > 0 || emojiIdxMismatch > 0
    || emojiUnknownClient > 0 || emojiIdxClientMismatch > 0 || textWithNul > 0;
  if (msgs === 0) {
    console.error('FALLO: no se encontró ningún mensaje 3003');
    process.exit(1);
  }
  console.log(fail ? 'FALLO' : 'OK');
  process.exit(fail ? 1 : 0);
}

main();
