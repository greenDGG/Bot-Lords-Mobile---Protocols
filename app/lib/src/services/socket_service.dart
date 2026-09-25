import 'package:socket_io_client/socket_io_client.dart' as io;
import 'dart:async';

/// Wrapper tipado sobre socket.io-client con reconexión automática.
///
/// Los listeners que se registran con [on] persisten: se guardan en un buffer
/// interno y se adjuntan al socket cuando se crea (ej. si se registran antes
/// de [connect]). Al reconectar se ejecutan los callbacks de [onReconnect]
/// para volver a sincronizar el estado del servidor.
class SocketService {
  io.Socket? _socket;
  final _listeners = <String, List<void Function(dynamic)>>{};
  final _reconnectCbs = <void Function()>[];

  /// Último error de conexión (para diagnóstico en la UI).
  String? lastConnectionError;

  bool get connected => _socket?.connected ?? false;

  void connect(String url, {void Function(bool connected)? onConnectionChange}) {
    if (url.isEmpty) return;
    _socket?.dispose(); // evitar socket doble
    _socket = io.io(
      url,
      io.OptionBuilder()
          .setTransports(['websocket', 'polling'])
          .enableForceNew()
          .build(),
    );

    // Adjuntar listeners pendientes (registrados antes de la conexión)
    for (final entry in _listeners.entries) {
      for (final h in entry.value) {
        _socket!.on(entry.key, h);
      }
    }

    _socket!.onConnect((_) {
      lastConnectionError = null;
      onConnectionChange?.call(true);
      for (final cb in _reconnectCbs) {
        cb();
      }
    });
    _socket!.onDisconnect((_) => onConnectionChange?.call(false));
    _socket!.onConnectError((data) {
      lastConnectionError = _errText(data);
      onConnectionChange?.call(false);
    });
    _socket!.onError((data) {
      lastConnectionError = _errText(data);
      onConnectionChange?.call(false);
    });
  }

  static String _errText(dynamic data) {
    if (data == null) return 'Error de conexión desconocido';
    if (data is Map) {
      final m = data;
      if (m['message'] != null) return m['message'].toString();
      if (m['description'] != null) return m['description'].toString();
      if (m['type'] != null) return m['type'].toString();
    }
    return data.toString();
  }

  void on(String event, void Function(dynamic) handler) {
    (_listeners[event] ??= []).add(handler);
    _socket?.on(event, handler);
  }

  void off(String event, [void Function(dynamic)? handler]) {
    final list = _listeners[event];
    if (list != null) {
      if (handler == null) {
        list.clear();
      } else {
        list.remove(handler);
      }
      if (list.isEmpty) _listeners.remove(event);
    }
    _socket?.off(event, handler);
  }

  void emit(String event, [dynamic data]) {
    _socket?.emit(event, data ?? const {});
  }

  void onReconnect(void Function() cb) {
    _reconnectCbs.add(cb);
  }

  /// Emite un request y espera la primera respuesta por ese canal.
  Future<dynamic> request(
    String requestEvent,
    String responseEvent,
    dynamic payload, {
    Duration timeout = const Duration(seconds: 8),
  }) async {
    if (_socket == null) {
      throw StateError('Socket no conectado');
    }
    final completer = Completer<dynamic>();
    void onceCb(dynamic data) {
      _socket!.off(responseEvent, onceCb);
      completer.complete(data);
    }

    _socket!.on(responseEvent, onceCb);
    emit(requestEvent, payload);
    try {
      return await completer.future.timeout(timeout);
    } on TimeoutException {
      _socket!.off(responseEvent, onceCb);
      rethrow;
    }
  }

  /// Remueve todos los listeners de un evento (del buffer y del socket).
  void removeAll(String event) => off(event);

  void dispose() {
    _listeners.clear();
    _socket?.dispose();
    _socket = null;
  }
}