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
 *   [+25]      num8 (0 = tiene texto, 109 = mensaje de sistema/reino)
 *   [+26..27]  picID (u16 LE)
 *   [+28..40]  playerName (13B null-terminated)
 *   [+41]      vipRank
 *   [+42..44]  guildTag (3B)
 *   [+45]      specialBlockId
 *   [+46]      titleId
 *   [+47]      bHaveArabic
 *   [+48..49]  msgLen (u16 LE)
 *   [+50..]    texto (solo si num8 == 0)
 *
 * Tamaño del mensaje: si num8 == 0 -> 50 + msgLen; si no (sistema) -> 54 fijo.
 */

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
  rawHex: string;
}

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
    let size = 54;
    if (num8 === 0 && msg.length >= 50) {
      const mlen = msg.readUInt16LE(48);
      if (mlen > 0 && mlen <= 200 && offset + 50 + mlen <= body.length) {
        message = body.subarray(offset + 50, offset + 50 + mlen).toString('utf8');
      }
      size = 50 + mlen;
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
      rawHex: msg.subarray(0, 50).toString('hex'),
    });

    // Mensaje truncado (paquete en vivo): no se puede avanzar de forma segura.
    if (body.length < offset + 50) break;
    offset += size;
  }

  return out;
}
