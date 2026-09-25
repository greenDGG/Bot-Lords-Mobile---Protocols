import 'package:flutter/material.dart';
import '../models/chat_message.dart';
import '../theme/app_theme.dart';
import '../utils/format.dart';

class ChatView extends StatefulWidget {
  const ChatView({super.key, required this.messages, required this.onSend});
  final List<ChatMessage> messages;
  final ValueChanged<String> onSend;

  @override
  State<ChatView> createState() => _ChatViewState();
}

class _ChatViewState extends State<ChatView> {
  final _controller = TextEditingController();
  final _scroll = ScrollController();

  @override
  void dispose() {
    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _send() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    widget.onSend(text);
    _controller.clear();
  }

  @override
  Widget build(BuildContext context) {
    // Autoscroll al fondo solo si ya estás cerca del fondo (evita saltos al leer)
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        final pos = _scroll.position;
        if (pos.pixels >= pos.maxScrollExtent - 80) {
          _scroll.jumpTo(pos.maxScrollExtent);
        }
      }
    });

    return Column(
      children: [
        Expanded(
          child: widget.messages.isEmpty
              ? const Center(
                  child: Text('Sin mensajes todavía...', style: TextStyle(color: AppColors.textSecondary)),
                )
              : ListView.builder(
                  controller: _scroll,
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  itemCount: widget.messages.length,
                  itemBuilder: (context, i) => _MessageTile(msg: widget.messages[i]),
                ),
        ),
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: AppColors.surface,
            border: Border(top: BorderSide(color: AppColors.border)),
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  onSubmitted: (_) => _send(),
                  decoration: const InputDecoration(hintText: 'Mensaje...', isDense: true),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: _send,
                style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12)),
                child: const Text('Enviar'),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _MessageTile extends StatelessWidget {
  const _MessageTile({required this.msg});
  final ChatMessage msg;

  @override
  Widget build(BuildContext context) {
    final isGuild = msg.isGuild;
    final color = msg.self ? AppColors.primary : (isGuild ? AppColors.info : AppColors.warning);

    return Align(
      alignment: msg.self ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (!msg.self)
                  Container(
                    margin: const EdgeInsets.only(right: 6),
                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      msg.channelLabel.isEmpty ? (isGuild ? 'Gremio' : 'Global') : msg.channelLabel,
                      style: TextStyle(fontSize: 9, color: color, fontWeight: FontWeight.w700),
                    ),
                  ),
                Flexible(
                  child: Text(
                    msg.senderName,
                    style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w700),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (msg.senderGuild.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(left: 5),
                    child: Text('[$msg.senderGuild]', style: const TextStyle(fontSize: 10, color: AppColors.purple)),
                  ),
                const Spacer(),
                Text(Fmt.ts(msg.ts), style: const TextStyle(fontSize: 9, color: AppColors.textSecondary)),
              ],
            ),
            if (msg.message.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 3),
                child: Text(msg.message, style: const TextStyle(fontSize: 13, height: 1.3)),
              ),
          ],
        ),
      ),
    );
  }
}