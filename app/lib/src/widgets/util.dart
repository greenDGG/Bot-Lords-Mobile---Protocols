import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

void showSnack(BuildContext context, String msg, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..removeCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: error ? const Color(0xFF7F1D1D) : const Color(0xFF1A3C24),
      ),
    );
}

/// Contenedor estándar de tarjeta de la app.
class Panel extends StatelessWidget {
  const Panel({super.key, this.padding = const EdgeInsets.all(16), required this.child});
  final EdgeInsets padding;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(padding: padding, child: child),
    );
  }
}

/// Etiqueta de sección (estilo terminal).
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.title, {super.key});
  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        title,
        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.primary),
      ),
    );
  }
}