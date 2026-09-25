import 'player_info.dart';
import 'resources.dart';
import 'shield.dart';

/// Cuenta registrada en el backend (viene de `listAccounts`).
class Account {
  final String iggId;
  final Map<String, dynamic>? token;
  final Map<String, dynamic>? config;

  const Account({required this.iggId, this.token, this.config});

  int get id => int.tryParse(iggId) ?? 0;

  factory Account.fromJson(Map<String, dynamic> json) {
    return Account(
      iggId: json['iggId']?.toString() ?? '',
      token: json['token'] is Map<String, dynamic> ? json['token'] as Map<String, dynamic> : null,
      config: json['config'] is Map<String, dynamic> ? json['config'] as Map<String, dynamic> : null,
    );
  }
}

/// Estado "en vivo" de una cuenta (viene de `runningBots`).
class LiveState {
  final bool running;
  final PlayerInfo? player;
  final Shield? shield;
  final Resources? resources;

  const LiveState({this.running = false, this.player, this.shield, this.resources});

  factory LiveState.fromJson(Map<String, dynamic> json, int iggId) {
    return LiveState(
      running: json['running']?[iggId.toString()] == true,
      player: json['players']?[iggId.toString()] != null
          ? PlayerInfo.fromJson(json['players'][iggId.toString()] as Map<String, dynamic>)
          : null,
      shield: json['shields']?[iggId.toString()] != null
          ? Shield.fromJson(json['shields'][iggId.toString()] as Map<String, dynamic>)
          : null,
      resources: json['resources']?[iggId.toString()] != null
          ? Resources.fromJson(json['resources'][iggId.toString()] as Map<String, dynamic>)
          : null,
    );
  }
}