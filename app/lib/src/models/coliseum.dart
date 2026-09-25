/// Estado del Coliseo (proto 5201).
class ColiseumState {
  const ColiseumState({
    required this.rank,
    required this.fightsDone,
    required this.gems,
    required this.rivals,
  });

  final int rank;
  final int fightsDone;
  final int gems;
  final List<ColiseumRival> rivals;

  factory ColiseumState.fromJson(Map<String, dynamic> json) {
    return ColiseumState(
      rank: (json['rank'] as num?)?.toInt() ?? 0,
      fightsDone: (json['fightsDone'] as num?)?.toInt() ?? 0,
      gems: (json['gems'] as num?)?.toInt() ?? 0,
      rivals: (json['rivals'] as List<dynamic>? ?? [])
          .map((e) => ColiseumRival.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class ColiseumRival {
  const ColiseumRival({
    required this.name,
    required this.guildTag,
    required this.heroId,
  });

  final String name;
  final String guildTag;
  final int heroId;

  factory ColiseumRival.fromJson(Map<String, dynamic> json) {
    return ColiseumRival(
      name: json['name']?.toString() ?? '',
      guildTag: json['guildTag']?.toString() ?? '',
      heroId: (json['heroId'] as num?)?.toInt() ?? 0,
    );
  }
}
