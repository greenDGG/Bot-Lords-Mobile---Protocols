import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/bot_event.dart';
import '../providers/app_state.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../widgets/util.dart';

class EventsScreen extends StatefulWidget {
  const EventsScreen({super.key});

  @override
  State<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends State<EventsScreen> {
  List<BotEvent>? _events;
  bool _loading = true;
  String? _error;

  ApiService? get _api {
    final url = context.read<AppState>().serverUrl;
    return url == null ? null : ApiService(url);
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final events = await _api?.fetchEvents();
      if (mounted) setState(() => _events = events ?? []);
    } catch (e) {
      if (mounted) {
        setState(() => _error = 'Error: $e');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _toggle(BotEvent e, bool active) async {
    try {
      await _api?.createEvent(e.copyWith(active: active));
      _load();
    } catch (e) {
      if (mounted) showSnack(context, 'Error: $e', error: true);
    }
  }

  Future<void> _delete(BotEvent e) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Eliminar evento'),
        content: Text('¿Eliminar "${e.name}"?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger, foregroundColor: Colors.white),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await _api?.deleteEvent(e.eventId);
      _load();
    } catch (e) {
      if (mounted) showSnack(context, 'Error: $e', error: true);
    }
  }

  Future<void> _add() async {
    final result = await showDialog<Map<String, Object?>>(
      context: context,
      builder: (_) => const _EventForm(initial: null),
    );
    if (result == null) return;
    await _upsert(result);
  }

  Future<void> _edit(BotEvent e) async {
    final result = await showDialog<Map<String, Object?>>(
      context: context,
      builder: (_) => _EventForm(initial: e),
    );
    if (result == null) return;
    await _upsert(result);
  }

  Future<void> _upsert(Map<String, Object?> result) async {
    try {
      await _api?.createEvent(
        BotEvent(
          eventId: result['eventId']!.toString(),
          name: result['name']?.toString() ?? '',
          action: result['action']?.toString() ?? '',
          claimProto: (result['claimProto'] as num?)?.toInt() ?? 0,
          claimPayload: result['claimPayload']?.toString() ?? '00',
          cooldownSeconds: (result['cooldownSeconds'] as num?)?.toInt() ?? 3600,
          active: result['active'] == true,
          startAt: (result['startAt'] as num?)?.toInt() ?? 0,
          endAt: (result['endAt'] as num?)?.toInt() ?? 0,
        ),
      );
      _load();
    } catch (e) {
      if (mounted) showSnack(context, 'Error: $e', error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Eventos globales')),
      floatingActionButton: FloatingActionButton(
        onPressed: _add,
        child: const Icon(Icons.add),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: AppColors.danger, size: 40),
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: AppColors.textSecondary), textAlign: TextAlign.center),
              const SizedBox(height: 16),
              OutlinedButton(onPressed: _load, child: const Text('Reintentar')),
            ],
          ),
        ),
      );
    }
    final events = _events ?? [];
    if (events.isEmpty) {
      return const Center(child: Text('Sin eventos. Tocá + para agregar.', style: TextStyle(color: AppColors.textSecondary)));
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 90),
      itemCount: events.length,
      itemBuilder: (context, i) {
        final e = events[i];
        return Card(
          child: ListTile(
            leading: Switch(value: e.active, onChanged: (v) => _toggle(e, v)),
            title: Text(e.name, style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(
              '${e.action} · proto ${e.claimProto} · cooldown ${e.cooldownSeconds ~/ 3600}h',
              style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
            ),
            trailing: IconButton(
              icon: const Icon(Icons.delete_outline, color: AppColors.danger, size: 20),
              onPressed: () => _delete(e),
            ),
            onTap: () => _edit(e),
          ),
        );
      },
    );
  }
}

class _EventForm extends StatefulWidget {
  const _EventForm({required this.initial});
  final BotEvent? initial;

  @override
  State<_EventForm> createState() => _EventFormState();
}

class _EventFormState extends State<_EventForm> {
  late final TextEditingController _id;
  late final TextEditingController _name;
  late final TextEditingController _action;
  late final TextEditingController _proto;
  late final TextEditingController _payload;
  late final TextEditingController _cooldown;
  late final TextEditingController _startAt;
  late final TextEditingController _endAt;
  late bool _active;

  @override
  void initState() {
    super.initState();
    final e = widget.initial;
    _id = TextEditingController(text: e?.eventId ?? '');
    _name = TextEditingController(text: e?.name ?? '');
    _action = TextEditingController(text: e?.action ?? '');
    _proto = TextEditingController(text: (e?.claimProto ?? 0).toString());
    _payload = TextEditingController(text: e?.claimPayload ?? '00');
    _cooldown = TextEditingController(text: ((e?.cooldownSeconds ?? 3600) ~/ 3600).toString());
    _startAt = TextEditingController(text: (e?.startAt ?? 0).toString());
    _endAt = TextEditingController(text: (e?.endAt ?? 0).toString());
    _active = e?.active ?? true;
  }

  @override
  void dispose() {
    for (final c in [_id, _name, _action, _proto, _payload, _cooldown, _startAt, _endAt]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.initial == null ? 'Nuevo evento' : 'Editar evento'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: _id, decoration: const InputDecoration(labelText: 'eventId', hintText: 'mi-evento')),
            const SizedBox(height: 8),
            TextField(controller: _name, decoration: const InputDecoration(labelText: 'Nombre')),
            const SizedBox(height: 8),
            TextField(controller: _action, decoration: const InputDecoration(labelText: 'Acción')),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                child: TextField(controller: _proto, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'claimProto')),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(controller: _cooldown, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Cooldown (h)')),
              ),
            ]),
            const SizedBox(height: 8),
            TextField(controller: _payload, decoration: const InputDecoration(labelText: 'claimPayload (hex)')),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(child: TextField(controller: _startAt, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'startAt'))),
              const SizedBox(width: 8),
              Expanded(child: TextField(controller: _endAt, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'endAt'))),
            ]),
            const SizedBox(height: 4),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Activo'),
              value: _active,
              onChanged: (v) => setState(() => _active = v),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
        FilledButton(
          onPressed: () {
            Navigator.pop(context, {
              'eventId': _id.text.trim(),
              'name': _name.text.trim(),
              'action': _action.text.trim(),
              'claimProto': int.tryParse(_proto.text) ?? 0,
              'claimPayload': _payload.text.trim(),
              'cooldownSeconds': (int.tryParse(_cooldown.text) ?? 1) * 3600,
              'startAt': int.tryParse(_startAt.text) ?? 0,
              'endAt': int.tryParse(_endAt.text) ?? 0,
              'active': _active,
            });
          },
          child: const Text('Guardar'),
        ),
      ],
    );
  }
}