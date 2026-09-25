class PlayerInfo {
  final int playerId;
  final String playerName;
  final int level;
  final int power;
  final int gems;
  final int kills;
  final int vipExp;
  final int energy;
  final int? castleX;
  final int? castleY;

  const PlayerInfo({
    required this.playerId,
    required this.playerName,
    this.level = 0,
    this.power = 0,
    this.gems = 0,
    this.kills = 0,
    this.vipExp = 0,
    this.energy = 0,
    this.castleX,
    this.castleY,
  });

  factory PlayerInfo.fromJson(Map<String, dynamic> json) {
    return PlayerInfo(
      playerId: (json['playerId'] as num?)?.toInt() ?? 0,
      playerName: json['playerName']?.toString() ?? '',
      level: (json['level'] as num?)?.toInt() ?? 0,
      power: (json['power'] as num?)?.toInt() ?? 0,
      gems: (json['gems'] as num?)?.toInt() ?? 0,
      kills: (json['kills'] as num?)?.toInt() ?? 0,
      vipExp: (json['vipExp'] as num?)?.toInt() ?? 0,
      energy: (json['energy'] as num?)?.toInt() ?? 0,
      castleX: (json['castleX'] as num?)?.toInt(),
      castleY: (json['castleY'] as num?)?.toInt(),
    );
  }
}