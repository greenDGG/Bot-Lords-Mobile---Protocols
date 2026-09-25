import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class LogView extends StatelessWidget {
  const LogView({super.key, required this.lines});
  final List<String> lines;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: const Color(0xFF090D12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.border),
      ),
      child: lines.isEmpty
          ? const Padding(
              padding: EdgeInsets.all(16),
              child: Text('Sin registros todavía...', style: TextStyle(color: AppColors.textSecondary)),
            )
          : ListView.builder(
              reverse: true,
              padding: const EdgeInsets.all(10),
              itemCount: lines.length,
              itemBuilder: (context, i) {
                final line = lines[lines.length - 1 - i];
                final Color color = line.contains('[+]') || line.contains('[OK]') || line.contains('✓')
                    ? AppColors.primary
                    : line.contains('[-]') || line.toLowerCase().contains('error')
                        ? AppColors.danger
                        : AppColors.text;
                return SelectableText(
                  line,
                  style: TextStyle(color: color, fontSize: 12, fontFamily: 'monospace', height: 1.4),
                );
              },
            ),
    );
  }
}