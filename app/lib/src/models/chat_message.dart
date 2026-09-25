/// Mensaje de chat (viene de `chatMessage` / `chatHistory` / `botData`).
class ChatMessage {
  final String id;
  final int msgId;
  final int senderId;
  final int ts;
  final String channel;
  final String channelLabel;
  final String senderName;
  final String senderGuild;
  final String message;
  final bool self;

  const ChatMessage({
    required this.id,
    required this.msgId,
    required this.senderId,
    required this.ts,
    required this.channel,
    required this.channelLabel,
    required this.senderName,
    required this.senderGuild,
    required this.message,
    this.self = false,
  });

  bool get isGuild => channelLabel.toLowerCase().contains('gremio') || channel == 'gremio';

  factory ChatMessage.fromJson(Map<String, dynamic> json, {bool self = false}) {
    final msgId = (json['msgId'] as num?)?.toInt() ?? 0;
    final ts = (json['ts'] as num?)?.toInt() ?? 0;
    return ChatMessage(
      id: json['id']?.toString() ?? 'in-$msgId-$ts',
      msgId: msgId,
      senderId: (json['senderId'] as num?)?.toInt() ?? 0,
      ts: ts,
      channel: json['channel']?.toString() ?? json['channelLabel']?.toString() ?? '',
      channelLabel: json['channelLabel']?.toString() ?? '',
      senderName: json['senderName']?.toString() ?? 'Jugador $msgId',
      senderGuild: json['senderGuild']?.toString() ?? '',
      message: json['message']?.toString() ?? '',
      self: self,
    );
  }
}