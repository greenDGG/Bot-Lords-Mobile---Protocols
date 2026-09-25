import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/player_info.dart';
import '../models/resources.dart';
import '../providers/bot_detail_state.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';
import '../utils/format.dart';
import '../widgets/chat_view.dart';
import '../widgets/config_panel.dart';
import '../widgets/log_view.dart';
import '../widgets/util.dart';
import '../widgets/war_list.dart';

class BotDetailScreen extends StatefulWidget {
  const BotDetailScreen({super.key, required this.iggId});
  final int iggId;

  @override
  State<BotDetailScreen> createState() => _BotDetailScreenState();
}

class _BotDetailScreenState extends State<BotDetailScreen> {
  int _tab = 0;

  static const _tabs = ['Info', 'Recursos', 'Chat', 'Registro', 'Config', 'Agrupaciones', 'Coliseo'];

  @override
  void initState() {
    super.initState();
  }

  @override
  void dispose() {
    super.dispose();
  }

  void _onTabChanged(BuildContext innerContext, int index) {
    final detail = innerContext.read<BotDetailState>();
    if (index == 5) {
      detail.closeWarView();
      detail.openWarView();
    } else if (_tab == 5) {
      detail.closeWarView();
    }
    setState(() => _tab = index);
  }

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => BotDetailState(context.read<AppState>().socket, widget.iggId),
      child: Builder(builder: (innerContext) {
        final detail = innerContext.watch<BotDetailState>();
        return DefaultTabController(
          length: _tabs.length,
          child: Scaffold(
          appBar: AppBar(
            title: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Flexible(
                  child: Text(
                    'IGG ${widget.iggId}',
                    maxLines: 1,
                    overflow: TextOverflow.clip,
                  ),
                ),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    detail.online ? '• En línea' : '• Offline',
                    maxLines: 1,
                    overflow: TextOverflow.clip,
                    style: TextStyle(fontSize: 11, color: detail.online ? AppColors.primary : AppColors.danger),
                  ),
                ),
              ],
            ),
            actions: [
              IconButton(
                icon: const Icon(Icons.security, size: 20),
                tooltip: 'Renovar escudo',
                onPressed: () => detail.renewShield(),
              ),
              IconButton(
                icon: const Icon(Icons.help_outline, size: 20),
                tooltip: 'Ayuda',
                onPressed: () => detail.sendCommand('help'),
              ),
              IconButton(
                icon: const Icon(Icons.link_off, size: 20),
                tooltip: 'Desconectar',
                onPressed: () {
                  detail.sendCommand('disconnect');
                  showSnack(innerContext, 'Desconectando...');
                },
              ),
            ],
            bottom: TabBar(
              onTap: (i) => _onTabChanged(innerContext, i),
              isScrollable: true,
              tabs: [for (final t in _tabs) Tab(text: t)],
            ),
          ),
          body: _body(innerContext, detail),
          ),
        );
      }),
    );
  }

  Widget _body(BuildContext context, BotDetailState detail) {
    if (detail.loading) {
      return const Center(child: CircularProgressIndicator());
    }
    switch (_tab) {
      case 0:
        return _InfoTab(detail: detail);
      case 1:
        return _ResourcesTab(detail: detail);
      case 2:
        return ChatView(
          messages: detail.chatMessages,
          onSend: detail.sendChat,
        );
      case 3:
        return Padding(
          padding: const EdgeInsets.all(16),
          child: LogView(lines: detail.logs),
        );
      case 4:
        return _ConfigTab(detail: detail);
      case 5:
        return SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: WarsView(wars: detail.wars, marches: detail.marches),
        );
      case 6:
        return _ColiseoTab(detail: detail);
      default:
        return const SizedBox();
    }
  }
}

class _InfoTab extends StatelessWidget {
  const _InfoTab({required this.detail});
  final BotDetailState detail;

  @override
  Widget build(BuildContext context) {
    final p = detail.playerInfo;
    final shield = detail.shield;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Panel(
          child: p == null
              ? const Center(child: Text('Esperando datos del jugador...', style: TextStyle(color: AppColors.textSecondary)))
              : _buildPlayer(p),
        ),
        const SizedBox(height: 12),
        Panel(
          child: Row(
            children: [
              Icon(Icons.security, color: (shield?.remainingMs ?? 0) > 0 ? AppColors.primary : AppColors.textSecondary, size: 18),
              const SizedBox(width: 10),
              const Text('Escudo', style: TextStyle(fontWeight: FontWeight.w700)),
              const Spacer(),
              Text(
                (shield?.remainingMs ?? 0) > 0 ? Fmt.time((shield!.remainingMs / 1000).round()) : 'Sin escudo',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: (shield?.remainingMs ?? 0) > 0 ? AppColors.primary : AppColors.textSecondary,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            FilledButton.icon(
              onPressed: detail.renewShield,
              icon: const Icon(Icons.security, size: 16),
              label: const Text('Renovar escudo'),
            ),
            OutlinedButton.icon(
              onPressed: () => detail.sendCommand('help'),
              icon: const Icon(Icons.help, size: 16),
              label: const Text('Ayuda'),
            ),
            OutlinedButton.icon(
              onPressed: detail.buyFruit,
              icon: const Icon(Icons.shopping_cart, size: 16),
              label: const Text('Comprar fruta'),
            ),
            OutlinedButton.icon(
              onPressed: detail.useFruit,
              icon: const Icon(Icons.restore, size: 16),
              label: const Text('Usar fruta'),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildPlayer(PlayerInfo p) {
    final rows = <(String, String)>[
      ('Nombre', p.playerName),
      ('Nivel', '${p.level}'),
      ('Poder', Fmt.number(p.power)),
      ('Asesinatos', Fmt.number(p.kills)),
      ('Gemas', Fmt.number(p.gems)),
      ('VIP Exp', Fmt.number(p.vipExp)),
      ('Energía', Fmt.number(p.energy)),
      if (p.castleX != null) ('Castillo', 'X=${p.castleX} Y=${p.castleY}'),
    ];
    return Column(
      children: [
        for (final (label, value) in rows)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 14)),
                Text(value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
      ],
    );
  }
}

class _ResourcesTab extends StatelessWidget {
  const _ResourcesTab({required this.detail});
  final BotDetailState detail;

  @override
  Widget build(BuildContext context) {
    final r = detail.resources;
    if (r == null) {
      return const Center(child: Text('Esperando recursos...', style: TextStyle(color: AppColors.textSecondary)));
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        for (final row in r.rows)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Panel(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Row(
                children: [
                  Text('${row.icon} ', style: const TextStyle(fontSize: 16)),
                  SizedBox(
                    width: 80,
                    child: Text(row.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                  ),
                  const Spacer(),
                  Text(Fmt.number(row.value), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.text)),
                  const SizedBox(width: 12),
                  Text('+${Fmt.number(row.prod)}/h', style: const TextStyle(fontSize: 12, color: AppColors.primary)),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _ConfigTab extends StatelessWidget {
  const _ConfigTab({required this.detail});
  final BotDetailState detail;

  @override
  Widget build(BuildContext context) {
    if (detail.configLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    final cfg = detail.botConfig;
    if (cfg == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: AppColors.warning, size: 36),
              const SizedBox(height: 12),
              const Text('No se pudo cargar la configuración.', style: TextStyle(color: AppColors.textSecondary)),
              const SizedBox(height: 12),
              OutlinedButton(onPressed: detail.sync, child: const Text('Reintentar')),
            ],
          ),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.all(16),
      child: ConfigPanel(
        config: cfg,
        onSave: (c) {
          detail.saveConfig(c);
          showSnack(context, 'Configuración guardada');
        },
      ),
    );
  }
}

class _ColiseoTab extends StatelessWidget {
  const _ColiseoTab({required this.detail});
  final BotDetailState detail;

  @override
  Widget build(BuildContext context) {
    final c = detail.coliseum;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (c == null)
          const Panel(
            child: Text('Esperando datos del Coliseo...', style: TextStyle(color: AppColors.textSecondary)),
          )
        else ...[
          Panel(
            child: Row(
              children: [
                _Stat(label: 'Puesto', value: '#${c.rank}'),
                _Stat(label: 'Peleas', value: '${c.fightsDone}/5'),
                _Stat(label: 'Gemas', value: Fmt.number(c.gems)),
              ],
            ),
          ),
          if (c.rivals.isNotEmpty) ...[
            const SizedBox(height: 12),
            const Text('Rivales', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            for (final r in c.rivals)
              Panel(
                child: Row(
                  children: [
                    Expanded(child: Text(r.name, style: const TextStyle(fontWeight: FontWeight.w600))),
                    Text('${r.guildTag.isNotEmpty ? '[${r.guildTag}] ' : ''}rank ${r.heroId}',
                        style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                  ],
                ),
              ),
          ],
        ],
      ],
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
          const SizedBox(height: 2),
          Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}