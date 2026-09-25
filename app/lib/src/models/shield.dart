class Shield {
  final int remainingMs;
  final String name;

  const Shield({this.remainingMs = 0, this.name = ''});

  factory Shield.fromJson(Map<String, dynamic> json) {
    return Shield(
      remainingMs: (json['remaining'] as num?)?.toInt() ?? 0,
      name: json['name']?.toString() ?? '',
    );
  }
}