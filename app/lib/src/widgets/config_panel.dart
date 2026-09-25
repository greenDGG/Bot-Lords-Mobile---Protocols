import 'package:flutter/material.dart';
import '../models/bot_config.dart';
import '../theme/app_theme.dart';
import 'util.dart';

class ConfigPanel extends StatefulWidget {
  const ConfigPanel({super.key, required this.config, required this.onSave, this.onSaveDelta});
  final BotConfig config;
  final ValueChanged<BotConfig> onSave;

  /// Cuando se provee, Guardar envía SOLO los campos modificados (delta) en
  /// lugar de la config completa. Se usa para la config global (varias cuentas).
  final ValueChanged<Map<String, dynamic>>? onSaveDelta;

  @override
  State<ConfigPanel> createState() => _ConfigPanelState();
}

class _ConfigPanelState extends State<ConfigPanel> {
  late BotConfig _draft;
  final Set<String> _changedPaths = {};
  bool _changed = false;
  bool _saved = false;

  @override
  void initState() {
    super.initState();
    _draft = widget.config;
  }

  @override
  void didUpdateWidget(covariant ConfigPanel old) {
    super.didUpdateWidget(old);
    if (old.config.data != widget.config.data) {
      _draft = widget.config;
      _changed = false;
      _changedPaths.clear();
    }
  }

  void _set(String path, Object? value) {
    setState(() {
      _draft = BotConfig.deepSet(_draft, path, value);
      _changed = true;
      if (widget.config.deepGet(path) == value) {
        _changedPaths.remove(path);
      } else {
        _changedPaths.add(path);
      }
    });
  }

  void _save() {
    if (widget.onSaveDelta != null) {
      final delta = BotConfig.buildDelta(_draft, _changedPaths);
      if (delta.isEmpty) {
        setState(() => _changed = false);
        return;
      }
      widget.onSaveDelta!(delta);
    } else {
      widget.onSave(_draft);
    }
    setState(() {
      _changed = false;
      _saved = true;
      _changedPaths.clear();
    });
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) setState(() => _saved = false);
    });
  }

  void _reset() {
    setState(() {
      _draft = widget.config;
      _changed = false;
      _changedPaths.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final global = widget.onSaveDelta != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const SectionLabel('Configuración'),
            const Spacer(),
            FilledButton(
              onPressed: _changed ? _save : null,
              child: Text(global ? 'Aplicar' : 'Guardar'),
            ),
            const SizedBox(width: 8),
            OutlinedButton(
              onPressed: _changed ? _reset : null,
              child: const Text('Restablecer'),
            ),
          ],
        ),
        if (global)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              '⚙️ Modo global: se aplicará(án) $_modifiedCount campo(s) modificado(s) a las cuentas seleccionadas. El resto queda igual.',
              style: const TextStyle(fontSize: 12, color: AppColors.info),
            ),
          ),
        if (_saved) const Padding(
          padding: EdgeInsets.only(top: 4),
          child: Text('✓ Aplicado', style: TextStyle(color: AppColors.primary, fontSize: 12)),
        ) else if (_changed) const Padding(
          padding: EdgeInsets.only(top: 4),
          child: Text('Hay cambios sin guardar', style: TextStyle(color: AppColors.warning, fontSize: 12)),
        ),
        const SizedBox(height: 12),
        ...kConfigSections.entries.map((entry) => _Section(
              title: entry.key,
              children: entry.value.map((f) => _field(f)).toList(),
            )),
      ],
    );
  }

  int get _modifiedCount => _changedPaths.length;

  Widget _field(ConfigField f) {
    final value = _draft.deepGet(f.path);
    final modified = _changedPaths.contains(f.path);
    switch (f.kind) {
      case 'bool':
        return SwitchListTile(
          dense: true,
          contentPadding: EdgeInsets.zero,
          title: Text(
            '${modified ? '● ' : ''}${f.label}',
            style: TextStyle(
              fontSize: 13,
              color: modified ? AppColors.warning : null,
              fontWeight: modified ? FontWeight.w700 : null,
            ),
          ),
          value: value == true,
          onChanged: (v) => _set(f.path, v),
        );
      case 'num':
        final n = (value is num) ? value.toDouble() : 0.0;
        return _NumField(
          key: ValueKey('${f.path}-$n'),
          label: f.label,
          modified: modified,
          value: n,
          onChanged: (v) => _set(f.path, v),
        );
      case 'hero':
        final n = (value is num) ? value.toInt() : (value is int ? value : 0);
        return _HeroField(
          key: ValueKey('${f.path}-$n'),
          label: f.label,
          modified: modified,
          value: n,
          onChanged: (v) => _set(f.path, v),
        );
      default:
        final s = value?.toString() ?? '';
        return _StrField(
          key: ValueKey('${f.path}-$s'),
          label: f.label,
          modified: modified,
          value: s,
          onChanged: (v) => _set(f.path, v),
        );
    }
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.primary)),
            const SizedBox(height: 6),
            ...children,
          ],
        ),
      ),
    );
  }
}

class _NumField extends StatefulWidget {
  const _NumField({super.key, required this.label, required this.value, required this.onChanged, this.modified = false});
  final String label;
  final double value;
  final ValueChanged<double> onChanged;
  final bool modified;

  @override
  State<_NumField> createState() => _NumFieldState();
}

class _NumFieldState extends State<_NumField> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: _display(widget.value));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  static String _display(double v) => v == v.toInt() ? v.toInt().toString() : v.toString();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          SizedBox(
            width: 150,
            child: Text(
              '${widget.modified ? '● ' : ''}${widget.label}',
              style: TextStyle(
                fontSize: 13,
                color: widget.modified ? AppColors.warning : null,
                fontWeight: widget.modified ? FontWeight.w700 : null,
              ),
            ),
          ),
          const Spacer(),
          SizedBox(
            width: 120,
            child: TextField(
              controller: _controller,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              onChanged: (v) {
                final n = double.tryParse(v);
                if (n != null) widget.onChanged(n);
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _StrField extends StatefulWidget {
  const _StrField({super.key, required this.label, required this.value, required this.onChanged, this.modified = false});
  final String label;
  final String value;
  final ValueChanged<String> onChanged;
  final bool modified;

  @override
  State<_StrField> createState() => _StrFieldState();
}

class _StrFieldState extends State<_StrField> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.value);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          SizedBox(
            width: 150,
            child: Text(
              '${widget.modified ? '● ' : ''}${widget.label}',
              style: TextStyle(
                fontSize: 13,
                color: widget.modified ? AppColors.warning : null,
                fontWeight: widget.modified ? FontWeight.w700 : null,
              ),
            ),
          ),
          const Spacer(),
          SizedBox(
            width: 140,
            child: TextField(
              controller: _controller,
              onChanged: widget.onChanged,
            ),
          ),
        ],
      ),
    );
  }
}

const _heroList = <int, String>{
  1: 'Guardian',
  3: 'Sabio de Viento',
  4: 'Reina De La Nieve',
  5: 'Prima Donna',
  6: 'Incineradora',
  9: 'Arquera Letal',
  13: 'Rayo Escarlata',
  16: 'Tasgo Dinamita',
  17: 'Cuervo Nocturno',
  18: 'Matademonios',
  20: 'Escudero del Mar',
  23: 'Rastreadora',
  29: 'Caballera Rosa',
};

class _HeroField extends StatelessWidget {
  const _HeroField({super.key, required this.label, required this.value, required this.onChanged, this.modified = false});
  final String label;
  final int value;
  final ValueChanged<int> onChanged;
  final bool modified;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          SizedBox(
            width: 150,
            child: Text(
              '${modified ? '● ' : ''}$label',
              style: TextStyle(
                fontSize: 13,
                color: modified ? AppColors.warning : null,
                fontWeight: modified ? FontWeight.w700 : null,
              ),
            ),
          ),
          const Spacer(),
          SizedBox(
            width: 160,
            child: DropdownButtonFormField<int>(
              value: value,
              isDense: true,
              decoration: const InputDecoration(isDense: true, contentPadding: EdgeInsets.symmetric(horizontal: 8, vertical: 6)),
              items: [
                const DropdownMenuItem(value: 0, child: Text('(vacío)', style: TextStyle(fontSize: 12))),
                ..._heroList.entries.map((e) => DropdownMenuItem(
                  value: e.key,
                  child: Text(e.value, style: const TextStyle(fontSize: 12)),
                )),
              ],
              onChanged: (v) { if (v != null) onChanged(v); },
            ),
          ),
        ],
      ),
    );
  }
}