import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/bot_event.dart';

/// REST del backend: eventos globales (CRUD) y debug.
class ApiService {
  ApiService(this.baseUrl);

  final String baseUrl;
  http.Client? _client;

  Uri _uri(String path) => Uri.parse('${baseUrl.replaceFirst(RegExp(r'/+$'), '')}$path');

  Future<List<BotEvent>> fetchEvents() async {
    final res = await http.get(_uri('/events')).timeout(const Duration(seconds: 8));
    if (res.statusCode != 200) {
      throw Exception('HTTP ${res.statusCode}');
    }
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    final list = body['events'] as List<dynamic>? ?? [];
    return list.map((e) => BotEvent.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> createEvent(BotEvent e) async {
    final res = await http.post(
      _uri('/events'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'eventId': e.eventId,
        'name': e.name,
        'action': e.action,
        'claimProto': e.claimProto,
        'claimPayload': e.claimPayload,
        'cooldownSeconds': e.cooldownSeconds,
        'active': e.active,
        'startAt': e.startAt,
        'endAt': e.endAt,
      }),
    ).timeout(const Duration(seconds: 8));
    if (res.statusCode != 200) throw Exception('HTTP ${res.statusCode}');
  }

  Future<void> deleteEvent(String eventId) async {
    final res = await http.delete(_uri('/events/$eventId')).timeout(const Duration(seconds: 8));
    if (res.statusCode != 200) throw Exception('HTTP ${res.statusCode}');
  }

  void dispose() {
    _client?.close();
  }
}