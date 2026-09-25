import type { BotInstance } from '../core/bot-instance';
import { parseChatMessages } from '../models/chat.types';

export function handleChatMessages(bot: BotInstance, body: Buffer): void {
  try {
    const messages = parseChatMessages(body);
    if (messages.length === 0) return;

    if (messages.length > 1) {
      bot.chatMessages = messages.slice(-200);
      bot.emit('chatHistoryLoaded', bot.chatMessages.slice());
      return;
    }

    const msg = messages[0];
    if (bot.chatMessages.some(m => m.msgId === msg.msgId)) return;
    bot.chatMessages.push(msg);
    if (bot.chatMessages.length > 200) bot.chatMessages.shift();
    bot.emit('chatMessage', msg);
  } catch {}
}
