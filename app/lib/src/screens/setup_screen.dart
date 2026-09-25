import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';
import '../widgets/util.dart';

class SetupScreen extends StatefulWidget {
  const SetupScreen({super.key});

  @override
  State<SetupScreen> createState() => _SetupScreenState();
}

class _SetupScreenState extends State<SetupScreen> {
  final _urlController = TextEditingController();
  bool _working = false;

  @override
  void dispose() {
    _urlController.dispose();
    super.dispose();
  }

  Future<void> _connect() async {
    final url = _urlController.text.trim();
    if (url.isEmpty) {
      showSnack(context, 'Ingresá la URL del servidor');
      return;
    }
    final app = context.read<AppState>();
    setState(() => _working = true);
    // Normaliza (esquema/puerto default 3100), guarda y conecta el socket
    await app.connectToServer(url);
    if (mounted) setState(() => _working = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(28),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text('🐉 BotIgg', style: TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: AppColors.primary)),
                      const SizedBox(height: 6),
                      Text('Cliente de Lords Mobile', style: TextStyle(color: AppColors.textSecondary, fontSize: 14)),
                      const SizedBox(height: 28),
                      TextField(
                        controller: _urlController,
                        keyboardType: TextInputType.url,
                        autofocus: true,
                        onSubmitted: (_) => _connect(),
                        decoration: const InputDecoration(
                          labelText: 'URL del backend',
                          hintText: 'http://192.168.50.1:3100',
                          prefixIcon: Icon(Icons.dns_outlined, size: 18),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'La URL del servidor que corre el bot (ej: http://192.168.50.1:3100).',
                        style: TextStyle(color: AppColors.textSecondary, fontSize: 12),
                      ),
                      const SizedBox(height: 24),
                      FilledButton.icon(
                        onPressed: _working ? null : _connect,
                        icon: _working
                            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.background))
                            : const Icon(Icons.bolt, size: 18),
                        label: const Text('CONECTAR'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}