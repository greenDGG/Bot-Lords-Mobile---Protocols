import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/account.dart';
import '../models/log_entry.dart';
import '../models/player_info.dart';
import '../models/resources.dart';
import '../models/shield.dart';
import '../services/socket_service.dart';
import '../services/api_service.dart';

/// Estado global de la app: conexión, cuentas, bots corriendo y snapshots.
class AppState extends ChangeNotifier {
  AppState(this.socket) {
    _registerGlobalListeners();
    socket.onReconnect(sync);
    _shieldTicker = Timer.periodic(const Duration(seconds: 1), (_) => tickShields());
  }

  final SocketService socket;

  bool connected = false;
  bool connecting = false;
  String? serverUrl;

  List<Account> accounts = [];
  Map<int, bool> running = {};
  Map<int, PlayerInfo> players = {};
  Map<int, Shield> shields = {};
  Map<int, Resources> resources = {};
  List<LogEntry> logs = [];

  Set<int> selected = {};
  final Set<int> launching = {};
  String? lastError;

  static const _prefKey = 'server_url';

  /// Normaliza la URL del servidor: garantiza esquema http:// y puerto (default 3100).
  /// Acepta: '192.168.1.5', '192.168.1.5:3100', 'http://192.168.1.5',
  /// 'http:192.168.1.5:3100' (sin dobles barras), con o sin barra final.
  static String normalizeServerUrl(String raw) {
    var url = raw.trim();
    if (url.isEmpty) return '';
    // Quitar esquema previo (con o sin dobles barras) para re-armar limpio
    url = url.replaceFirst(RegExp(r'^https?:/{0,2}', caseSensitive: false), '');
    while (url.endsWith('/')) {
      url = url.substring(0, url.length - 1);
    }
    final parts = url.split(':');
    if (parts.isEmpty || parts[0].isEmpty) return '';
    final host = parts[0];
    final port = parts.length >= 2 ? int.tryParse(parts[1]) : null;
    final p = (port == null || port <= 0 || port > 65535) ? 3100 : port;
    return 'http://$host:$p';
  }

  Future<String?> loadSavedUrl() async {
    final prefs = await SharedPreferences.getInstance();
    serverUrl = normalizeServerUrl(prefs.getString(_prefKey) ?? '');
    return serverUrl!.isEmpty ? null : serverUrl;
  }

  /// Guarda la URL normalizada y conecta el socket con ella.
  Future<void> connectToServer(String rawUrl) async {
    final url = normalizeServerUrl(rawUrl);
    if (url.isEmpty) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefKey, url);
    serverUrl = url;
    notifyListeners();
    socket.connect(url, onConnectionChange: setConnectionState);
  }

  /// Borra la URL guardada y vuelve a la pantalla de setup.
  Future<void> clearServer() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefKey, '');
    serverUrl = null;
    notifyListeners();
  }

  void setConnectionState(bool value) {
    connected = value;
    connecting = false;
    notifyListeners();
  }

  void sync() {
    emit('listAccounts');
    emit('getRunningBots');
  }

  void emit(String event, [Map<String, dynamic>? data]) => socket.emit(event, data ?? const {});

  String? get connectionError => socket.lastConnectionError;

  /// Sondeo de conectividad hacia el backend: DNS → TCP → HTTP.
  /// Devuelve líneas de log para diagnóstico en la UI.
  Future<List<String>> probeBackend() async {
    final url = serverUrl;
    if (url == null || url.isEmpty) return ['Sin URL guardada'];

    Uri uri;
    try {
      uri = Uri.parse(normalizeServerUrl(url));
    } catch (e) {
      return ['URL inválida: $e'];
    }
    final host = uri.host;
    final port = uri.hasPort ? uri.port : 3100;
    final lines = <String>[];
    final sw = Stopwatch()..start();

    lines.add('URL: $url');
    lines.add('Destino: $host:$port');

    // 1) Resolución DNS
    try {
      final addrs = await InternetAddress.lookup(host).timeout(const Duration(seconds: 6));
      lines.add('DNS ok: ${addrs.map((a) => a.address).join(', ')}');
    } catch (e) {
      lines.add('DNS falla: $e');
      return lines;
    }

    // 2) Conexión TCP al puerto
    try {
      final sock = await Socket.connect(host, port, timeout: const Duration(seconds: 6));
      lines.add('TCP ok (${sw.elapsedMilliseconds}ms)');
      sock.destroy();
    } catch (e) {
      lines.add('TCP falla (${sw.elapsedMilliseconds}ms): $e');
      return lines;
    }

    // 3) HTTP al backend (misma IP:puerto que probó TCP, no la URL cruda)
    try {
      final api = ApiService('http://$host:$port');
      final events = await api.fetchEvents();
      lines.add('HTTP /events ok (${sw.elapsedMilliseconds}ms): ${events.length} eventos');
      lines.add('¡El backend responde correctamente!');
    } on TimeoutException {
      lines.add('HTTP timeout (${sw.elapsedMilliseconds}ms): el puerto acepta TCP pero no responde HTTP');
    } on SocketException catch (e) {
      lines.add('HTTP SocketException: $e');
    } on HttpException catch (e) {
      lines.add('HTTP: $e');
    } catch (e) {
      lines.add('HTTP error: $e');
    }
    return lines;
  }

  void startBot(int iggId) => emit('startBot', {'iggId': iggId});

  void stopBot(int iggId) => emit('stopBot', {'iggId': iggId});

  void globalCommand(int proto, String body) => emit('globalCommand', {'proto': proto, 'body': body});

  Future<void> launchSelected() async {
    final ids = selected.toList();
    if (ids.isEmpty) return;
    launching.addAll(ids);
    notifyListeners();
    for (final id in ids) {
      await _awaitBotStart(id);
    }
    launching.clear();
    notifyListeners();
  }

  Future<void> _awaitBotStart(int iggId) async {
    final completer = Completer<void>();
    void done(dynamic data) {
      if (data is Map && (data['iggId'] as num?)?.toInt() == iggId && !completer.isCompleted) {
        completer.complete();
      }
    }

    socket.on('botStarted', done);
    socket.on('connectionFailed', done);
    emit('startBot', {'iggId': iggId});
    await completer.future.timeout(const Duration(seconds: 60), onTimeout: () {});
    socket.off('botStarted', done);
    socket.off('connectionFailed', done);
  }

  void toggleSelected(int iggId, bool checked) {
    final next = Set<int>.from(selected);
    if (checked) {
      next.add(iggId);
    } else {
      next.remove(iggId);
    }
    selected = next;
    notifyListeners();
  }

  void selectAll() {
    if (selected.length == accounts.length && selected.isNotEmpty) {
      selected = {};
    } else {
      selected = {for (final a in accounts) a.id};
    }
    notifyListeners();
  }

  void addLog(int iggId, String msg) {
    logs = [...logs, LogEntry(iggId: iggId, msg: msg, at: DateTime.now())];
    if (logs.length > 200) {
      logs = logs.sublist(logs.length - 200);
    }
    notifyListeners();
  }

  Timer? _shieldTicker;

  /// Decrementa los escudos vivos localmente (1s tick).
  void tickShields() {
    var changed = false;
    final next = <int, Shield>{};
    for (final e in shields.entries) {
      final rem = e.value.remainingMs - 1000;
      next[e.key] = Shield(remainingMs: rem > 0 ? rem : 0, name: e.value.name);
      if (rem != e.value.remainingMs) changed = true;
    }
    if (changed) {
      shields = next;
      notifyListeners();
    }
  }

  void _registerGlobalListeners() {
    socket.on('accounts', (data) {
      accounts = (data as List<dynamic>)
          .map((e) => Account.fromJson(e as Map<String, dynamic>))
          .toList();
      notifyListeners();
    });

    socket.on('runningBots', (data) {
      final map = data as Map<String, dynamic>;
      running = ((map['running'] as Map<String, dynamic>?) ?? {}).map((k, v) => MapEntry(int.parse(k), v == true));

      players = {};
      shields = {};
      resources = {};
      for (final e in ((map['players'] as Map<String, dynamic>?) ?? {}).entries) {
        players[int.parse(e.key)] = PlayerInfo.fromJson(e.value as Map<String, dynamic>);
      }
      for (final e in ((map['shields'] as Map<String, dynamic>?) ?? {}).entries) {
        shields[int.parse(e.key)] = Shield.fromJson(e.value as Map<String, dynamic>);
      }
      for (final e in ((map['resources'] as Map<String, dynamic>?) ?? {}).entries) {
        resources[int.parse(e.key)] = Resources.fromJson(e.value as Map<String, dynamic>);
      }
      notifyListeners();
    });

    socket.on('log', (data) {
      final m = data as Map<String, dynamic>;
      addLog((m['iggId'] as num?)?.toInt() ?? 0, m['msg']?.toString() ?? '');
    });

    socket.on('statusChanged', (data) {
      final m = data as Map<String, dynamic>;
      final id = (m['iggId'] as num).toInt();
      running = {...running, id: m['online'] == true};
      notifyListeners();
    });

    socket.on('botStarted', (data) {
      final m = data as Map<String, dynamic>;
      running = {...running, (m['iggId'] as num).toInt(): true};
      notifyListeners();
    });

    socket.on('botStopped', (data) {
      final m = data as Map<String, dynamic>;
      running = {...running, (m['iggId'] as num).toInt(): false};
      notifyListeners();
    });

    socket.on('connectionFailed', (data) {
      final m = data as Map<String, dynamic>;
      final id = (m['iggId'] as num).toInt();
      running = {...running, id: false};
      lastError = m['message']?.toString() ?? 'No se pudo conectar la cuenta';
      addLog(id, '[-] Error de conexión: ${m['message'] ?? 'desconocido'}');
      notifyListeners();
    });

    socket.on('playerInfo', (data) {
      final m = data as Map<String, dynamic>;
      final id = (m['iggId'] as num).toInt();
      players = {...players, id: PlayerInfo.fromJson(m['info'] as Map<String, dynamic>)};
      notifyListeners();
    });

    socket.on('shield', (data) {
      final m = data as Map<String, dynamic>;
      final id = (m['iggId'] as num).toInt();
      shields = {...shields, id: Shield(remainingMs: (m['remaining'] as num?)?.toInt() ?? 0, name: m['name']?.toString() ?? '')};
      notifyListeners();
    });

    socket.on('resources', (data) {
      final m = data as Map<String, dynamic>;
      final id = (m['iggId'] as num).toInt();
      resources = {...resources, id: Resources.fromJson(m['resources'] as Map<String, dynamic>)};
      notifyListeners();
    });

    socket.on('error', (data) {
      if (data is Map && data['message'] != null) {
        lastError = data['message'].toString();
        notifyListeners();
      }
    });
  }

  @override
  void dispose() {
    _shieldTicker?.cancel();
    socket.dispose();
    super.dispose();
  }
}