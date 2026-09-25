import 'package:flutter/material.dart';
import '../models/player_info.dart';
import '../models/shield.dart';
import '../theme/app_theme.dart';
import '../utils/format.dart';

class AccountCard extends StatelessWidget {
  const AccountCard({
    super.key,
    required this.iggId,
    required this.isRunning,
    this.playerInfo,
    this.shield,
    required this.selected,
    required this.onSelect,
    required this.onStart,
    required this.onStop,
    required this.onOpen,
  });

  final int iggId;
  final bool isRunning;
  final PlayerInfo? playerInfo;
  final Shield? shield;
  final bool selected;
  final ValueChanged<bool> onSelect;
  final VoidCallback onStart;
  final VoidCallback onStop;
  final VoidCallback onOpen;

  bool get _shieldActive => (shield?.remainingMs ?? 0) > 0;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onOpen,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Checkbox(
                    value: selected,
                    onChanged: (v) => onSelect(v ?? false),
                    visualDensity: VisualDensity.compact,
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text('IGG $iggId', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                  ),
                  _StatusDot(running: isRunning),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          (playerInfo?.playerName.isNotEmpty ?? false) ? playerInfo!.playerName : '—',
                          style: const TextStyle(fontSize: 14),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if ((playerInfo?.power ?? 0) > 0)
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text('⚡ ${Fmt.number(playerInfo!.power)}', style: const TextStyle(fontSize: 12, color: AppColors.warning)),
                          ),
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text(
                            '🛡 ${_shieldActive ? Fmt.time((shield!.remainingMs / 1000).round()) : '—'}',
                            style: TextStyle(fontSize: 12, color: _shieldActive ? AppColors.primary : AppColors.textSecondary),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  if (isRunning)
                    OutlinedButton.icon(
                      onPressed: onStop,
                      icon: const Icon(Icons.stop, size: 14, color: AppColors.danger),
                      label: const Text('Detener', style: TextStyle(fontSize: 11, color: AppColors.danger)),
                      style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8)),
                    )
                  else
                    FilledButton.icon(
                      onPressed: onStart,
                      icon: const Icon(Icons.play_arrow, size: 14),
                      label: const Text('Iniciar', style: TextStyle(fontSize: 11)),
                      style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8)),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusDot extends StatelessWidget {
  const _StatusDot({required this.running});
  final bool running;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 9,
          height: 9,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: running ? AppColors.primary : AppColors.textSecondary,
          ),
        ),
        const SizedBox(width: 4),
        Text(
          running ? 'EN LÍNEA' : 'OFF',
          style: const TextStyle(fontSize: 10, color: AppColors.textSecondary),
        ),
      ],
    );
  }
}