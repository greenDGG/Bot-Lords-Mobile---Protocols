import 'package:flutter/foundation.dart';
import 'dart:async';
import '../models/bot_config.dart';
import '../models/chat_message.dart';
import '../models/coliseum.dart';
import '../models/player_info.dart';
import '../models/resources.dart';
import '../models/shield.dart';
import '../models/war_event.dart';
import '../services/socket_service.dart';

/// Estado en vivo de una cuenta (una instancia por pantalla de detalle).
class BotDetailState extends ChangeNotifier {
  BotDetailState(this.socket, this.iggId) {
    _register();
    sync();
    _shieldTicker = Timer.periodic(const Duration(seconds: 1), (_) => tickShield());
  }

  final SocketService socket;
  final int iggId;

  bool get connected => socket.connected;
  bool launched = false;
  bool online = false;
  bool loading = true;

  PlayerInfo? playerInfo;
  Resources? resources;
  Shield? shield;
  BotConfig? botConfig;
  bool configLoading = true;
  String? configError;

  List<ChatMessage> chatMessages = [];
  List<String> logs = [];
  List<WarEvent> wars = [];
  List<IncomingMarch> marches = [];

  ColiseumState? coliseum;

  // Cofres: progreso por itemId
  final Map<int, ({int opened, int total, bool done})> chestProgress = {};
  String? chestError;
  String? lastError;
  int warNotification = 0;

  void sync() {
    emit('getBotData', {'iggId': iggId});
    emit('getConfigOffline', {'iggId': iggId});
  }

  Timer? _shieldTicker;

  /// Decrementa el escudo localmente (1s tick) para que la cuenta vaya en vivo.
  void tickShield() {
    final s = shield;
    if (s == null || s.remainingMs <= 0) return;
    final rem = s.remainingMs - 1000;
    shield = Shield(remainingMs: rem > 0 ? rem : 0, name: s.name);
    notifyListeners();
  }

  void emit(String event, [Map<String, dynamic>? data]) => socket.emit(event, data ?? const {});

  // ── Acciones ──
  void sendChat(String text) {
    if (text.trim().isEmpty) return;
    chatMessages = [...chatMessages, ChatMessage(
      id: 'self-${DateTime.now().microsecondsSinceEpoch}',
      msgId: 0,
      senderId: 0,
      ts: DateTime.now().millisecondsSinceEpoch ~/ 1000,
      channel: 'saliente',
      channelLabel: 'saliente',
      senderName: 'Yo',
      senderGuild: '',
      message: text.trim(),
      self: true,
    )];
    emit('sendCommand', {'iggId': iggId, 'command': 'chat ${text.trim()}'});
    notifyListeners();
  }

  void sendCommand(String cmd) => emit('sendCommand', {'iggId': iggId, 'command': cmd});

  void renewShield() => emit('sendCommand', {'iggId': iggId, 'command': 'shield'});

  void saveConfig(BotConfig config) {
    emit('saveConfig', {'iggId': iggId, 'config': config.toJson()});
  }

  void openWarView() {
    warNotification = 0;
    emit('setWarViewing', {'iggId': iggId, 'viewing': true});
    emit('requestWarData', {'iggId': iggId});
  }

  void closeWarView() => emit('setWarViewing', {'iggId': iggId, 'viewing': false});

  void requestMapData({int? x, int? y}) {
    emit('requestMapData', {'iggId': iggId, if (x != null) 'x': x, if (y != null) 'y': y});
  }

  void buyFruit() => emit('buyFruit', {'iggId': iggId});

  void useFruit() => emit('useFruit', {'iggId': iggId});

  // ── Cofres ──
  void openChest(int itemId, int quantity) {
    emit('openChest', {'iggId': iggId, 'itemId': itemId, 'quantity': quantity});
  }

  // ── Listeners ──
  final _handlers = <String, void Function(dynamic)>{};

  void _listen(String event, void Function(dynamic) handler) {
    _handlers[event] = handler;
    socket.on(event, handler);
  }

  void _register() {
    _listen('botData', (data) {
      if ((data['iggId'] as num?)?.toInt() != iggId) return;
      _applyBotData(data);
    });

    _listen('playerInfo', (data) {
      if ((data['iggId'] as num?)?.toInt() != iggId) return;
      playerInfo = PlayerInfo.fromJson(data['info'] as Map<String, dynamic>);
      notifyListeners();
    });

    _listen('resources', (data) {
      if ((data['iggId'] as num?)?.toInt() != iggId) return;
      resources = Resources.fromJson(data['resources'] as Map<String, dynamic>);
      notifyListeners();
    });

    _listen('shield', (data) {
      if ((data['iggId'] as num?)?.toInt() != iggId) return;
      shield = Shield(remainingMs: (data['remaining'] as num?)?.toInt() ?? 0, name: data['name']?.toString() ?? '');
      notifyListeners();
    });

    _listen('statusChanged', (data) {
      if ((data['iggId'] as num?)?.toInt() != iggId) return;
      online = data['online'] == true;
      notifyListeners();
    });

    _listen('log', (data) {
      if ((data['iggId'] as num?)?.toInt() != iggId) return;
      logs = [...logs, data['msg']?.toString() ?? ''];
      if (logs.length > 300) logs = logs.sublist(logs.length - 300);
      notifyListeners();
    });

    _listen('chatMessage', (data) {
      if ((data['iggId'] as num?)?.toInt() != iggId) return;
      final m = ChatMessage.fromJson(data['message'] as Map<String, dynamic>);
      if (!chatMessages.any((e) => e.id == m.id)) {
        chatMessages = [...chatMessages, m];
        if (chatMessages.length > 200) chatMessages = chatMessages.sublist(chatMessages.length - 200);
        notifyListeners();
      }
    });

    _listen('chatHistory', (data) {
      if ((data['iggId'] as num?)?.toInt() != iggId) return;
      chatMessages = (data['messages'] as List<dynamic>? ?? [])
          .map((e) => ChatMessage.fromJson(e as Map<String, dynamic>))
          .toList();
      notifyListeners();
    });

    _listen('configData', (data) {
      if ((data['iggId'] as num?)?.toInt() != iggId) return;
      configLoading = false;
      if (data['online'] == true) return; // la config real llega por botData
      final cfg = data['config'];
      if (cfg is Map<String, dynamic>) {
        botConfig = BotConfig.fromJson(cfg);
      } else {
        configError = 'No se encontró configuración';
      }
      notifyListeners();
    });

    _listen('configUpdated', (data) {
      if ((data['iggId'] as num?)?.toInt() != iggId) return;
      final cfg = data['config'];
      if (cfg is Map<String, dynamic>) {
        botConfig = BotConfig.fromJson(cfg);
      }
      notifyListeners();
    });

    _listen('wars', (data) {
      if ((data['iggId'] as num?)?.toInt() != iggId) return;
      wars = (data['wars'] as List<dynamic>? ?? [])
          .map((e) => WarEvent.fromJson(e as Map<String, dynamic>))
          .where((w) => w.active)
          .toList();
      notifyListeners();
    });

    _listen('warNotification', (data) {
      if ((data['iggId'] as num?)?.toInt() != iggId) return;
      warNotification = (data['count'] as num?)?.toInt() ?? 0;
      notifyListeners();
    });

    _listen('incomingMarches', (data) {
      if ((data['iggId'] as num?)?.toInt() != iggId) return;
      marches = (data['marches'] as List<dynamic>? ?? [])
          .map((e) => IncomingMarch.fromJson(e as Map<String, dynamic>))
          .toList();
      notifyListeners();
    });

    _listen('coliseum', (data) {
      if ((data['iggId'] as num?)?.toInt() != iggId) return;
      final state = data['state'];
      coliseum = state is Map<String, dynamic> ? ColiseumState.fromJson(state) : null;
      notifyListeners();
    });

    _listen('chestProgress', (data) {
      if ((data['iggId'] as num?)?.toInt() != iggId) return;
      final itemId = (data['itemId'] as num?)?.toInt() ?? 0;
      final opened = (data['opened'] as num?)?.toInt() ?? 0;
      final total = (data['total'] as num?)?.toInt() ?? 0;
      chestProgress[itemId] = (opened: opened, total: total, done: data['done'] == true);
      notifyListeners();
    });
  }

  void _applyBotData(Map<String, dynamic> data) {
    loading = false;
    online = data['online'] == true;
    launched = data['launched'] == true;
    if (data['playerInfo'] != null) playerInfo = PlayerInfo.fromJson(data['playerInfo'] as Map<String, dynamic>);
    if (data['resources'] != null) resources = Resources.fromJson(data['resources'] as Map<String, dynamic>);
    if (data['shield'] != null) shield = Shield.fromJson(data['shield'] as Map<String, dynamic>);
    if (data['config'] != null) {
      botConfig = BotConfig.fromJson(data['config'] as Map<String, dynamic>);
      configLoading = false;
    }
    if (data['chatMessages'] != null) {
      chatMessages = (data['chatMessages'] as List<dynamic>)
          .map((e) => ChatMessage.fromJson(e as Map<String, dynamic>))
          .toList();
    }
    if (data['logs'] != null) {
      logs = (data['logs'] as List<dynamic>).map((e) => e.toString()).toList();
    }
    if (data['wars'] != null) {
      wars = (data['wars'] as List<dynamic>)
          .map((e) => WarEvent.fromJson(e as Map<String, dynamic>))
          .where((w) => w.active)
          .toList();
    }
    if (data['incomingMarches'] != null) {
      marches = (data['incomingMarches'] as List<dynamic>)
          .map((e) => IncomingMarch.fromJson(e as Map<String, dynamic>))
          .toList();
    }
    if (data['coliseum'] != null) {
      coliseum = ColiseumState.fromJson(data['coliseum'] as Map<String, dynamic>);
    }
    notifyListeners();
  }

  @override
  void dispose() {
    _shieldTicker?.cancel();
    for (final entry in _handlers.entries) {
      socket.off(entry.key, entry.value);
    }
    _handlers.clear();
    closeWarView();
    super.dispose();
  }
}