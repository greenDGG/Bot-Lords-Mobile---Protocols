import 'package:flutter/material.dart';
import '../models/war_event.dart';
import '../theme/app_theme.dart';
import 'util.dart';

class WarsView extends StatelessWidget {
  const WarsView({super.key, required this.wars, required this.marches});
  final List<WarEvent> wars;
  final List<IncomingMarch> marches;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionLabel('Guerras activas'),
        if (wars.isEmpty)
          const Panel(child: Center(child: Text('Sin guerras activas', style: TextStyle(color: AppColors.textSecondary))))
        else
          ...wars.map((w) => Panel(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    const Icon(Icons.local_fire_department, color: AppColors.danger, size: 18),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(w.enemyName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                          if (w.secondName.isNotEmpty)
                            Text('Aliado: ${w.secondName}', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                          Text('(${w.coordX}, ${w.coordY})', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        const Text('⏳', style: TextStyle(fontSize: 13)),
                        Text(_fmt(w.timeRemainingSec), style: const TextStyle(fontSize: 12, color: AppColors.warning)),
                      ],
                    ),
                  ],
                ),
              )),
        const SizedBox(height: 16),
        const SectionLabel('Marchas entrantes'),
        if (marches.isEmpty)
          const Panel(child: Center(child: Text('Sin marchas entrantes', style: TextStyle(color: AppColors.textSecondary))))
        else
          ...marches.map((m) => Panel(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    const Icon(Icons.flight_land, color: AppColors.info, size: 18),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text('Marcha #${m.marchId}', style: const TextStyle(fontSize: 13)),
                    ),
                    Text('Llega: ${_fmt((m.arrivalTimestamp - DateTime.now().millisecondsSinceEpoch / 1000).round())}',
                        style: const TextStyle(fontSize: 12, color: AppColors.info)),
                  ],
                ),
              )),
      ],
    );
  }

  String _fmt(int sec) {
    if (sec <= 0) return '0s';
    final h = sec ~/ 3600;
    final m = (sec % 3600) ~/ 60;
    final s = sec % 60;
    final b = StringBuffer();
    if (h > 0) b.write('${h}h ');
    if (m > 0 || h > 0) b.write('${m}m ');
    b.write('${s}s');
    return b.toString();
  }
}