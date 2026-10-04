/**
 * Paquete de chat entrante (proto 3003, MSG_CHAT).
 *
 * Estructura real (referencia: halloweeks/lords-mobile-bot RecvChatMessage,
 * verificada contra capturas con historial y mensajes en vivo). Es una lista
 * de mensajes.
 *
 * Body (sin header de 4 bytes):
 *   [0]      b2 (0 o 1 = trae mensajes)
 *   [1]      kind de la vista (0xFF = mundo/todos, 0x00 = gremio)
 *   [2-3]    count (u16 LE, cantidad de mensajes)
 *
 * Por cada mensaje (base = 4):
 *   [+0..7]    talkTime (u64 LE, unix segundos del servidor)
 *   [+8..15]   playID (u64 LE)
 *   [+16..23]  talkID (u64 LE, id del mensaje)
 *   [+24]      canal (0 = mundo/global, 1 = gremio)
 *   [+25]      num8 (0 = texto, 109 = emoticono, resto = sistema)
 *   [+26..27]  picID (u16 LE)
 *   [+28..40]  playerName (13B null-terminated)
 *   [+41]      vipRank
 *   [+42..44]  guildTag (3B)
 *   [+45]      specialBlockId
 *   [+46]      titleId
 *   [+47]      bHaveArabic
 *   [+48..49]  msgLen (u16 LE) — vale para TODOS los tipos
 *   [+50..]    payload de msgLen bytes:
 *              num8 = 0   → texto UTF-8
 *              num8 = 109 → [u16 emojiId][u16 idx] (ver data/emojis-db.ts)
 *              otro       → payload de sistema (no se interpreta)
 *
 * Tamaño del mensaje: 50 + msgLen (si msgLen es plausible); si no, 54.
 * Medido sobre 564.140 mensajes de log: la regla "54 fijos para num8 != 0"
 * desalineaba 10.433 mensajes, ésta 0.
 */

import { emojiName } from '../data/emojis-db';

export interface ChatMessage {
  msgId: number;
  senderId: number;
  ts: number;
  channel: number;
  channelLabel: string;
  senderName: string;
  senderGuild: string;
  num8: number;
  message: string;
  /** sólo num8 = 109: id del emoticono (EMOJI.txt) */
  emojiId?: number;
  /** sólo num8 = 109: orden del emoji en su pagina */
  emojiIdx?: number;
  rawHex: string;
}

/** msgLen máximo aceptado para derivar el tamaño (ver nota del módulo). */
const MAX_MSG_LEN = 400;

function readCStr(buf: Buffer, offset: number, maxLen: number): string {
  const end = buf.indexOf(0, offset);
  const limit = end >= 0 ? Math.min(end, offset + maxLen) : offset + maxLen;
  return buf.toString('utf8', offset, Math.min(limit, buf.length)).trim();
}

const CHANNEL_LABELS: Record<number, string> = {
  0: 'global',
  1: 'gremio',
};

export function parseChatMessage(body: Buffer): ChatMessage | null {
  return parseChatMessages(body)[0] ?? null;
}

export function parseChatMessages(body: Buffer): ChatMessage[] {
  const out: ChatMessage[] = [];
  if (body.length < 4) return out;
  const count = body.readUInt16LE(2);
  if (count === 0 || count > 200) return out;

  let offset = 4;
  for (let i = 0; i < count; i++) {
    if (body.length < offset + 28) break;
    const msg = body.subarray(offset);

    const talkTime = Number(msg.readBigUInt64LE(0));
    const playID = Number(msg.readBigUInt64LE(8));
    const talkID = Number(msg.readBigUInt64LE(16));
    const channel = msg[24];
    const num8 = msg[25];
    const senderName = readCStr(msg, 28, 13) || `Jugador ${playID}`;
    const senderGuild = readCStr(msg, 42, 3);

    let message = '';
    let emojiId: number | undefined;
    let emojiIdx: number | undefined;
    const mlen = msg.length >= 50 ? msg.readUInt16LE(48) : 0;
    let size = 54;
    if (mlen > 0 && mlen <= MAX_MSG_LEN && offset + 50 + mlen <= body.length) {
      size = 50 + mlen;
      if (num8 === 109 && mlen === 4) {
        emojiId = body.readUInt16LE(offset + 50);
        emojiIdx = body.readUInt16LE(offset + 52);
        message = `[Emoticono] ${emojiName(emojiId)}`;
      } else if (num8 === 0) {
        message = body.subarray(offset + 50, offset + 50 + mlen).toString('utf8');
      }
    }

    out.push({
      msgId: talkID,
      senderId: playID,
      ts: talkTime,
      channel,
      channelLabel: CHANNEL_LABELS[channel] ?? `canal ${channel}`,
      senderName,
      senderGuild,
      num8,
      message,
      emojiId,
      emojiIdx,
      rawHex: msg.subarray(0, 50).toString('hex'),
    });

    // Mensaje truncado (paquete en vivo): no se puede avanzar de forma segura.
    if (body.length < offset + 50) break;
    offset += size;
  }

  return out;
}
