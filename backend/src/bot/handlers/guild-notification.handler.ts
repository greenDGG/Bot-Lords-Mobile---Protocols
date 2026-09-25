import type { BotInstance } from '../core/bot-instance';

const GUILD_JOIN_STATUS: Record<number, string> = {
  0x00: 'aceptada',
  0x01: 'llegada/pendiente',
  0x02: 'rechazada/cancelada',
};

export function handleGuildNotification(bot: BotInstance, body: Buffer): void {
  if (body.length < 2) return;

  const notifType = body[0];
  const status = body[1];

  if (notifType === 0x0a) {
    const statusText = GUILD_JOIN_STATUS[status] ?? `desconocido (${status})`;
    bot.bot.log(`[GREMIO] Solicitud de unión al gremio: ${statusText}`);

    if (status === 0x01) {
      bot.bot.log('[GREMIO] Solicitud pendiente, solicitando lista de aplicaciones (2825)...');
      bot.bot.sendCommandPacket(2825, Buffer.from([0x00]), true);
    }

    bot.emit('guildNotification', { type: notifType, status });
  } else {
    bot.bot.log(`[GREMIO] Notificación desconocida: type=0x${notifType.toString(16)} status=0x${status.toString(16)}`);
  }
}
