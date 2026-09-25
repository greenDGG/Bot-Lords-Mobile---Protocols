import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'providers/app_state.dart';
import 'screens/home_screen.dart';
import 'screens/setup_screen.dart';
import 'services/socket_service.dart';
import 'services/notification_service.dart';
import 'theme/app_theme.dart';

class BotIggApp extends StatefulWidget {
  const BotIggApp({super.key, required this.socket, required this.notifications});

  final SocketService socket;
  final NotificationService notifications;

  @override
  State<BotIggApp> createState() => _BotIggAppState();
}

class _BotIggAppState extends State<BotIggApp> {
  late final AppState appState;
  bool _urlChecked = false;
  String? _lastServerUrl;
  bool _needRouteSync = true;
  final _navKey = GlobalKey<NavigatorState>();

  @override
  void initState() {
    super.initState();
    appState = AppState(widget.socket)..addListener(_onStateChanged);
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final url = await appState.loadSavedUrl();
    if (url != null && url.isNotEmpty && widget.socket.connected) {
      appState.sync();
    } else if (url != null && url.isNotEmpty) {
      widget.socket.connect(url, onConnectionChange: appState.setConnectionState);
    }
    // Iniciar notificaciones push cuando tenemos la URL del servidor
    if (url != null && url.isNotEmpty) {
      widget.notifications.init(url);
    }
    if (mounted) setState(() => _urlChecked = true);
    _syncRoute();
  }

  /// Mantiene la ruta raíz alineada con la URL guardada: sin URL → SetupScreen,
  /// con URL → HomeScreen. Se dispara al terminar de cargar o al cambiar la URL.
  void _syncRoute() {
    final nav = _navKey.currentState;
    if (nav == null) return;
    final url = appState.serverUrl;
    if (!_needRouteSync && url == _lastServerUrl) return;
    _lastServerUrl = url;
    _needRouteSync = false;
    final empty = url == null || url.isEmpty;
    nav.pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => empty ? const SetupScreen() : const HomeScreen()),
      (route) => false,
    );
  }

  void _onStateChanged() {
    if (mounted) setState(() {});
    _syncRoute();
  }

  @override
  void dispose() {
    appState.removeListener(_onStateChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider<AppState>.value(
      value: appState,
      child: MaterialApp(
        title: 'BotIgg',
        debugShowCheckedModeBanner: false,
        navigatorKey: _navKey,
        theme: AppTheme.dark(),
        home: _buildRoot(),
      ),
    );
  }

  Widget _buildRoot() {
    if (!_urlChecked) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final url = appState.serverUrl;
    if (url == null || url.isEmpty) {
      return const SetupScreen();
    }
    return const HomeScreen();
  }
}