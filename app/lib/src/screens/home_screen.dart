import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/resources.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';
import '../utils/format.dart';
import '../widgets/account_card.dart';
import '../widgets/util.dart';
import 'bot_detail_screen.dart';
import 'events_screen.dart';
import 'global_config_screen.dart';
import 'global_commands_screen.dart';
import 'proxy_auth_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _globalProto = TextEditingController();
  final _globalBody = TextEditingController(text: '030100fb03');
  bool _launching = false;

  @override
  void initState() {
    super.initState();
  }

  @override
  void dispose() {
    _globalProto.dispose();
    _globalBody.dispose();
    super.dispose();
  }

  Future<void> _launchSelected() async {
    setState(() => _launching = true);
    await context.read<AppState>().launchSelected();
    if (mounted) setState(() => _launching = false);
  }

  void _sendGlobal() {
    final proto = int.tryParse(_globalProto.text);
    final body = _globalBody.text.trim();
    if (proto == null || body.isEmpty) return;
    context.read<AppState>().globalCommand(proto, body);
    showSnack(context, 'Proto $proto enviado');
  }

  void _openEvents() {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => const EventsScreen()));
  }

  void _openProxyAuth() {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ProxyAuthScreen()));
  }

  void _showDiagnostics() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _DiagnosticsSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();

    return Scaffold(
      appBar: AppBar(
        title: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('🐉 BotIgg', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800)),
            SizedBox(width: 10),
            Flexible(
              child: Text(
                'Lords Mobile',
                style: TextStyle(color: AppColors.textSecondary, fontSize: 12),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        actions: [
          if (app.serverUrl != null)
            InkWell(
              onTap: _showDiagnostics,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.dns_outlined, size: 14, color: app.connected ? AppColors.primary : AppColors.danger),
                    const SizedBox(width: 4),
                    Text(
                      app.connected ? 'Conectado' : 'Desconectado',
                      style: TextStyle(fontSize: 11, color: app.connected ? AppColors.primary : AppColors.danger),
                    ),
                  ],
                ),
              ),
            ),
          IconButton(
            onPressed: _openEvents,
            icon: const Icon(Icons.event, size: 20),
            tooltip: 'Eventos globales',
          ),
          IconButton(
            onPressed: _openProxyAuth,
            icon: const Icon(Icons.lock_outline, size: 20),
            tooltip: 'Proxy Auth (global)',
          ),
          IconButton(
            onPressed: _showDiagnostics,
            icon: const Icon(Icons.settings_outlined, size: 20),
            tooltip: 'Servidor',
          ),
        ],
      ),
      body: Stack(
        children: [
          CustomScrollView(
            slivers: [
              if (!app.connected)
                SliverToBoxAdapter(
                  child: InkWell(
                    onTap: _showDiagnostics,
                    child: const _DisconnectedBanner(),
                  ),
                ),
              const SliverPadding(
                padding: EdgeInsets.fromLTRB(16, 12, 16, 8),
                sliver: SliverToBoxAdapter(child: Text('🌐 CMD Global', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.textSecondary))),
              ),
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                sliver: SliverToBoxAdapter(child: _globalCommandBar(app)),
              ),
              if (app.selected.isNotEmpty)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                    child: _SelectedResources(app: app),
                  ),
                ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
                  child: Row(
                    children: [
                      Text('Cuentas (${app.accounts.length})', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                      const Spacer(),
                      TextButton(
                        onPressed: app.accounts.isEmpty ? null : app.selectAll,
                        child: Text(app.selected.length == app.accounts.length && app.selected.isNotEmpty ? 'Deseleccionar todas' : 'Seleccionar todas'),
                      ),
                    ],
                  ),
                ),
              ),
              if (app.accounts.isEmpty)
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(child: Text('Sin cuentas. Agrega una desde el backend.', style: TextStyle(color: AppColors.textSecondary))),
                )
              else
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 120),
                  sliver: SliverGrid(
                    gridDelegate: _gridDelegate(context),
                    delegate: SliverChildBuilderDelegate(
                      (context, i) {
                        final acc = app.accounts[i];
                        final id = acc.id;
                        return AccountCard(
                          iggId: id,
                          isRunning: app.running[id] ?? false,
                          playerInfo: app.players[id],
                          shield: app.shields[id],
                          selected: app.selected.contains(id),
                          onSelect: (v) => app.toggleSelected(id, v),
                          onStart: () => app.startBot(id),
                          onStop: () => app.stopBot(id),
                          onOpen: () => _openDetail(id),
                        );
                      },
                      childCount: app.accounts.length,
                    ),
                  ),
                ),
            ],
          ),
          if (app.selected.isNotEmpty) _selectionBar(app),
        ],
      ),
    );
  }

  Widget _globalCommandBar(AppState app) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          Row(
            children: [
              SizedBox(
                width: 90,
                child: TextField(
                  controller: _globalProto,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(hintText: 'Proto'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: _globalBody,
                  decoration: const InputDecoration(hintText: 'Body en hex (ej: 030100fb03)'),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: _sendGlobal,
                style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12)),
                child: const Text('Enviar'),
              ),
              const SizedBox(width: 8),
              IconButton.filledTonal(
                onPressed: () {
                  Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => const GlobalCommandsScreen(),
                  ));
                },
                icon: const Icon(Icons.bolt, size: 20),
                tooltip: 'Comandos predefinidos',
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _selectionBar(AppState app) {
    final count = app.selected.length;
    return Positioned(
      left: 0,
      right: 0,
      bottom: 0,
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          border: const Border(top: BorderSide(color: AppColors.primary)),
        ),
        child: Row(
          children: [
            Flexible(
              child: Text(
                '📦 $count cuenta${count != 1 ? 's' : ''}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.primary, fontSize: 13),
              ),
            ),
            const SizedBox(width: 8),
            OutlinedButton.icon(
              onPressed: _openGlobalConfig,
              icon: const Icon(Icons.tune, size: 14, color: AppColors.info),
              label: const Text('Config', style: TextStyle(color: AppColors.info, fontSize: 12)),
              style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8)),
            ),
            const SizedBox(width: 8),
            OutlinedButton.icon(
              onPressed: () {
                for (final id in app.selected) {
                  app.stopBot(id);
                }
              },
              icon: const Icon(Icons.stop, size: 14, color: AppColors.danger),
              label: const Text('Detener', style: TextStyle(color: AppColors.danger, fontSize: 12)),
              style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8)),
            ),
            const SizedBox(width: 8),
            FilledButton.icon(
              onPressed: _launching ? null : _launchSelected,
              icon: _launching
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.background))
                  : const Icon(Icons.play_arrow, size: 16),
              label: Text(_launching ? 'Iniciando...' : 'Iniciar', style: const TextStyle(fontSize: 12)),
              style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8)),
            ),
          ],
        ),
      ),
    );
  }

  void _openDetail(int id) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => BotDetailScreen(iggId: id)),
    );
  }

  void _openGlobalConfig() {
    final app = context.read<AppState>();
    if (app.selected.isEmpty) {
      showSnack(context, 'Seleccioná al menos una cuenta');
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => GlobalConfigScreen(accountIds: Set<int>.from(app.selected)),
      ),
    );
  }

  /// Grilla de UNA columna (celular): ancho completo, alto fijo para el contenido.
  SliverGridDelegateWithFixedCrossAxisCount _gridDelegate(BuildContext context) {
    const spacing = 12.0;
    final width = MediaQuery.sizeOf(context).width - 16.0 * 2;
    final ratio = width / _minCardHeight;
    return SliverGridDelegateWithFixedCrossAxisCount(
      crossAxisCount: 1,
      mainAxisSpacing: spacing,
      crossAxisSpacing: spacing,
      childAspectRatio: ratio,
    );
  }

  static const _minCardHeight = 138.0;
}

/// Recursos agregados/de las cuentas seleccionadas (una fila por recurso, con
/// el total de las cuentas elegidas y sus valores individuales).
class _SelectedResources extends StatelessWidget {
  const _SelectedResources({required this.app});
  final AppState app;

  @override
  Widget build(BuildContext context) {
    final selected = app.selected.toList()..sort((a, b) => a.compareTo(b));
    final ids = selected.where((id) => app.resources[id] != null).toList();
    if (ids.isEmpty) {
      return Panel(
        padding: const EdgeInsets.all(12),
        child: const Row(
          children: [
            Icon(Icons.inventory_2_outlined, size: 16, color: AppColors.textSecondary),
            SizedBox(width: 8),
            Expanded(child: Text('Seleccioná cuentas para ver sus recursos.', style: TextStyle(fontSize: 12, color: AppColors.textSecondary))),
          ],
        ),
      );
    }

    // Total por recurso sobre las cuentas con datos.
    final totals = <String, double>{};
    for (final id in ids) {
      final r = app.resources[id]!;
      for (final row in r.rows) {
        totals[row.key] = (totals[row.key] ?? 0) + row.value;
      }
    }

    final firstRes = app.resources[ids.first]!;

    return Panel(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '📦 Recursos (${ids.length} cuenta${ids.length != 1 ? 's' : ''})',
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.primary),
          ),
          const SizedBox(height: 10),
          for (final row in firstRes.rows)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                children: [
                  Text('${row.icon} ', style: const TextStyle(fontSize: 13)),
                  SizedBox(
                    width: 62,
                    child: Text(row.name, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                  ),
                  const Spacer(),
                  Text(
                    Fmt.number(totals[row.key] ?? 0),
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
                  ),
                  if (ids.length > 1)
                    Text(
                      '  total',
                      style: const TextStyle(fontSize: 10, color: AppColors.primary),
                    ),
                ],
              ),
            ),
          if (ids.length > 1) ...[
            const SizedBox(height: 8),
            const Divider(height: 1, color: AppColors.border),
            const SizedBox(height: 8),
            Text(
              ids.map((id) => app.players[id]?.playerName.isNotEmpty == true ? app.players[id]!.playerName : id).join('  •  '),
              style: const TextStyle(fontSize: 11, color: AppColors.textSecondary),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      ),
    );
  }
}

class _DisconnectedBanner extends StatelessWidget {
  const _DisconnectedBanner();

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF3D1F1F),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.danger.withValues(alpha: 0.5)),
      ),
      child: const Row(
        children: [
          Icon(Icons.cloud_off, color: AppColors.danger, size: 16),
          SizedBox(width: 8),
          Expanded(
            child: Text(
              'Desconectado del servidor. Reintentando... (tocá para ver por qué)',
              style: TextStyle(fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}

class _DiagnosticsSheet extends StatefulWidget {
  const _DiagnosticsSheet();

  @override
  State<_DiagnosticsSheet> createState() => _DiagnosticsSheetState();
}

class _DiagnosticsSheetState extends State<_DiagnosticsSheet> {
  bool _testing = false;
  final List<String> _console = [];

  Future<void> _probe(AppState app) async {
    final stamp = DateTime.now();
    final header =
        '─── ${stamp.hour.toString().padLeft(2, '0')}:${stamp.minute.toString().padLeft(2, '0')}:${stamp.second.toString().padLeft(2, '0')} ───';
    setState(() {
      _testing = true;
      _console.add(header);
    });
    final lines = await app.probeBackend();
    if (!mounted) return;
    setState(() {
      _console.addAll(lines);
      _testing = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final err = app.connectionError;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('🔌 Diagnóstico de conexión', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            _row('URL del backend', app.serverUrl ?? '—'),
            _row('Socket.io', app.connected ? '✅ Conectado' : '❌ Desconectado'),
            if (err != null) _row('Último error socket', err, error: true),
            const SizedBox(height: 12),
            if (_console.isNotEmpty)
              Container(
                height: 180,
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xFF090D12),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppColors.border),
                ),
                child: ListView(
                  children: [
                    for (final line in _console)
                      SelectableText(
                        line,
                        style: TextStyle(
                          fontSize: 11,
                          fontFamily: 'monospace',
                          height: 1.4,
                          color: _colorOf(line),
                        ),
                      ),
                  ],
                ),
              ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _testing ? null : () => _probe(app),
              icon: _testing
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.background))
                  : const Icon(Icons.network_check, size: 18),
              label: const Text('Probar conexión (DNS → TCP → HTTP)'),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () {
                Navigator.pop(context);
                showDialog<void>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: const Text('Cambiar servidor'),
                    content: const Text('Se volverá a la pantalla de configuración para cambiar la URL.'),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
                      FilledButton(
                        onPressed: () async {
                          await context.read<AppState>().clearServer();
                        },
                        child: const Text('Cambiar'),
                      ),
                    ],
                  ),
                );
              },
              icon: const Icon(Icons.dns, size: 18),
              label: const Text('Cambiar servidor'),
            ),
            const SizedBox(height: 8),
            Text(
              'Sugerencias:\n'
              '• Si todo da timeout: el teléfono no llega a la IP (revisá que el backend esté en la misma red WiFi y que el firewall deje pasar el puerto).\n'
              '• Si el backend no loguea conexiones, el tráfico nunca llega (confirmá la IP/subred correcta).',
              style: TextStyle(fontSize: 11, color: AppColors.textSecondary, height: 1.4),
            ),
          ],
        ),
      ),
    );
  }

  Color _colorOf(String line) {
    if (line.contains('ok') || line.contains('responde')) return AppColors.primary;
    if (line.contains('falla') || line.contains('timeout') || line.contains('error') || line.contains('inválida')) {
      return AppColors.danger;
    }
    // cabeceras (───)
    if (line.startsWith('───')) return AppColors.info;
    if (line.startsWith('URL') || line.startsWith('Destino') || line.contains('socket')) return AppColors.warning;
    return AppColors.text;
  }

  Widget _row(String label, String value, {bool error = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(label, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
          ),
          Expanded(
            child: SelectableText(
              value,
              style: TextStyle(
                fontSize: 12,
                fontFamily: 'monospace',
                color: error ? AppColors.danger : AppColors.text,
              ),
            ),
          ),
        ],
      ),
    );
  }
}