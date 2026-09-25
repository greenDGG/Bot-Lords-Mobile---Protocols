class LogEntry {
  final int iggId;
  final String msg;
  final DateTime at;

  const LogEntry({required this.iggId, required this.msg, required this.at});

  factory LogEntry.fromJson(Map<String, dynamic> json) {
    return LogEntry(
      iggId: (json['iggId'] as num?)?.toInt() ?? 0,
      msg: json['msg']?.toString() ?? '',
      at: DateTime.now(),
    );
  }
}