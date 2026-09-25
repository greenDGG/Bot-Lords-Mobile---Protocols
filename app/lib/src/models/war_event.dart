class WarEvent {
  final int iggId;
  final bool active;
  final int timeRemainingSec;
  final int coordX;
  final int coordY;
  final String enemyName;
  final String secondName;
  final int index;
  final String type;

  const WarEvent({
    required this.iggId,
    required this.active,
    required this.timeRemainingSec,
    required this.coordX,
    required this.coordY,
    required this.enemyName,
    required this.secondName,
    required this.index,
    required this.type,
  });

  factory WarEvent.fromJson(Map<String, dynamic> json) {
    return WarEvent(
      iggId: (json['iggId'] as num?)?.toInt() ?? 0,
      active: json['active'] == true,
      timeRemainingSec: (json['timeRemainingSec'] as num?)?.toInt() ?? 0,
      coordX: (json['coordX'] as num?)?.toInt() ?? 0,
      coordY: (json['coordY'] as num?)?.toInt() ?? 0,
      enemyName: json['enemyName']?.toString() ?? '',
      secondName: json['secondName']?.toString() ?? '',
      index: (json['index'] as num?)?.toInt() ?? 0,
      type: json['type']?.toString() ?? '',
    );
  }
}

class IncomingMarch {
  final int marchId;
  final int arrivalTimestamp;
  final int? marchType;

  const IncomingMarch({required this.marchId, required this.arrivalTimestamp, this.marchType});

  factory IncomingMarch.fromJson(Map<String, dynamic> json) {
    return IncomingMarch(
      marchId: (json['marchId'] as num?)?.toInt() ?? 0,
      arrivalTimestamp: (json['arrivalTimestamp'] as num?)?.toInt() ?? 0,
      marchType: (json['marchType'] as num?)?.toInt(),
    );
  }
}