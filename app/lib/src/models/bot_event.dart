/// Evento global de Lords Mobile (definido en la DB del backend).
class BotEvent {
  final String eventId;
  final String name;
  final String action;
  final int claimProto;
  final String claimPayload;
  final int cooldownSeconds;
  final bool active;
  final int startAt;
  final int endAt;

  const BotEvent({
    required this.eventId,
    required this.name,
    required this.action,
    required this.claimProto,
    required this.claimPayload,
    required this.cooldownSeconds,
    required this.active,
    required this.startAt,
    required this.endAt,
  });

  factory BotEvent.fromJson(Map<String, dynamic> json) {
    return BotEvent(
      eventId: json['eventId']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      action: json['action']?.toString() ?? '',
      claimProto: (json['claimProto'] as num?)?.toInt() ?? 0,
      claimPayload: json['claimPayload']?.toString() ?? '00',
      cooldownSeconds: (json['cooldownSeconds'] as num?)?.toInt() ?? 3600,
      active: json['active'] == true,
      startAt: (json['startAt'] as num?)?.toInt() ?? 0,
      endAt: (json['endAt'] as num?)?.toInt() ?? 0,
    );
  }

  BotEvent copyWith({bool? active, int? startAt, int? endAt}) {
    return BotEvent(
      eventId: eventId,
      name: name,
      action: action,
      claimProto: claimProto,
      claimPayload: claimPayload,
      cooldownSeconds: cooldownSeconds,
      active: active ?? this.active,
      startAt: startAt ?? this.startAt,
      endAt: endAt ?? this.endAt,
    );
  }

  Map<String, dynamic> toJson() => {
        'eventId': eventId,
        'name': name,
        'action': action,
        'claimProto': claimProto,
        'claimPayload': claimPayload,
        'cooldownSeconds': cooldownSeconds,
        'active': active,
        'startAt': startAt,
        'endAt': endAt,
      };
}