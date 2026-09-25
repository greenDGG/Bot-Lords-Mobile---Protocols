/// Utilidades numericas/tiempo reutilizables.
abstract final class Fmt {
  static String number(num v) {
    if (v >= 1e9) return '${(v / 1e9).toStringAsFixed(1)}B';
    if (v >= 1e6) return '${(v / 1e6).toStringAsFixed(1)}M';
    if (v >= 1e3) return '${(v / 1e3).toStringAsFixed(1)}K';
    return v.toInt().toString();
  }

  static String time(int totalSec) {
    if (totalSec <= 0) return '0s';
    final d = totalSec ~/ 86400;
    final h = (totalSec % 86400) ~/ 3600;
    final m = (totalSec % 3600) ~/ 60;
    final s = totalSec % 60;
    final buf = StringBuffer();
    if (d > 0) buf.write('${d}d ');
    if (h > 0 || d > 0) buf.write('${h}h ');
    if (m > 0 || h > 0 || d > 0) buf.write('${m}m ');
    buf.write('${s}s');
    return buf.toString();
  }

  static String clock(int hours, int minutes) {
    final h = hours.toString().padLeft(2, '0');
    final m = minutes.toString().padLeft(2, '0');
    return '$h:$m';
  }

  static String ts(int unixSeconds) {
    final dt = DateTime.fromMillisecondsSinceEpoch(unixSeconds * 1000);
    return '${dt.hour.toString().padLeft(2, '0')}:'
        '${dt.minute.toString().padLeft(2, '0')}:'
        '${dt.second.toString().padLeft(2, '0')}';
  }
}