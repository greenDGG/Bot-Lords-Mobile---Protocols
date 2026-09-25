import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'src/app.dart';
import 'src/services/socket_service.dart';
import 'src/services/notification_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  final socket = SocketService();
  final notifications = NotificationService();
  runApp(BotIggApp(socket: socket, notifications: notifications));
}