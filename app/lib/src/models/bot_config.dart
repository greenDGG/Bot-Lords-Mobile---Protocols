import 'dart:convert';

/// Config guardada por cuenta. Se manipula de forma "profunda" (a/b/c) igual
/// que en el frontend web: los paneles usan [deepGet] / [deepSet].
class BotConfig {
  final Map<String, dynamic> data;

  const BotConfig(this.data);

  factory BotConfig.fromJson(Map<String, dynamic> json) => BotConfig(json);

  Map<String, dynamic> toJson() => data;

  Object? deepGet(String path) {
    Object? cur = data;
    for (final key in path.split('.')) {
      if (cur is Map<String, dynamic>) {
        cur = cur[key];
      } else if (cur is Map) {
        cur = cur[key];
      } else {
        return null;
      }
    }
    return cur;
  }

  static BotConfig deepSet(BotConfig cfg, String path, Object? value) {
    final clone = _deepClone(cfg.data);
    final parts = path.split('.');
    Map<String, dynamic> cur = clone;
    for (var i = 0; i < parts.length - 1; i++) {
      final k = parts[i];
      final next = cur[k];
      if (next is! Map<String, dynamic>) {
        cur[k] = <String, dynamic>{};
      }
      cur = cur[k] as Map<String, dynamic>;
    }
    cur[parts.last] = value;
    return BotConfig(clone);
  }

  static Map<String, dynamic> _deepClone(Map<String, dynamic> src) {
    return jsonDecode(jsonEncode(src)) as Map<String, dynamic>;
  }

  /// Construye un mapa "delta": copia solo las rutas marcadas como modificadas
  /// en [paths] con los valores actuales de [draft]. Se usa para aplicar a
  /// varias cuentas solo lo que el usuario tocó (sin pisar el resto).
  static Map<String, dynamic> buildDelta(BotConfig draft, Iterable<String> paths) {
    final delta = <String, dynamic>{};
    for (final p in paths) {
      _deepSetValue(delta, p, draft.deepGet(p));
    }
    return delta;
  }

  static void _deepSetValue(Map<String, dynamic> target, String path, Object? value) {
    final parts = path.split('.');
    Map<String, dynamic> cur = target;
    for (var i = 0; i < parts.length - 1; i++) {
      final k = parts[i];
      if (cur[k] is! Map<String, dynamic>) {
        cur[k] = <String, dynamic>{};
      }
      cur = cur[k] as Map<String, dynamic>;
    }
    cur[parts.last] = value;
  }
}

/// Secciones editables del panel de config. Cada entrada define la etiqueta,
/// la ruta y el tipo de control (bool | num | string | hero).
class ConfigField {
  final String path;
  final String label;
  final String kind; // 'bool' | 'num' | 'str' | 'hero'
  const ConfigField(this.path, this.label, [this.kind = 'str']);
}

const kConfigSections = <String, List<ConfigField>>{
  'General': [
    ConfigField('dailyResetTime', 'Reset diario', 'str'),
    ConfigField('limitTrain', 'Límite entrenamiento', 'num'),
    ConfigField('reconnectTime', 'Reconexión (s)', 'num'),
    ConfigField('sendHelp', 'Auto Ayuda', 'bool'),
    ConfigField('warMode', 'War Mode', 'bool'),
  ],
  'Entrenamiento': [
    ConfigField('train.enable', 'Activo', 'bool'),
    ConfigField('train.type', 'Tipo', 'str'),
    ConfigField('train.velTrain', 'Velocidad', 'num'),
    ConfigField('train.subsidiosPorcentaje', 'Subsidios %', 'num'),
  ],
  'Escudo': [
    ConfigField('shield.enable', 'Activo', 'bool'),
    ConfigField('shield.type', 'Tipo', 'str'),
    ConfigField('shield.redeployTime', 'Repliegue', 'str'),
  ],
  'Regalo Diario': [
    ConfigField('giftDaily.autoreclaim', 'Auto-reclamar', 'bool'),
    ConfigField('giftDaily.index', 'Índice', 'num'),
    ConfigField('giftDaily.next', 'Próximo (unix)', 'num'),
  ],
  'Caja Misteriosa': [
    ConfigField('mysteryBox.enable', 'Activo', 'bool'),
  ],
  'Barco': [
    ConfigField('ship.intercambio', 'Intercambio', 'bool'),
    ConfigField('ship.reclaim', 'Reclamar', 'bool'),
  ],
  'Forja': [
    ConfigField('forgeGift.enable', 'Activo', 'bool'),
  ],
  'Cofre VIP': [
    ConfigField('chestVip.enable', 'Activo', 'bool'),
  ],
  'Feria de Artefactos': [
    ConfigField('artifactFair.enable', 'Activo', 'bool'),
  ],
  'Refinar Maná': [
    ConfigField('refineMana.enable', 'Activo', 'bool'),
  ],
  'Cofre del Gremio': [
    ConfigField('openGuildChest.enable', 'Activo', 'bool'),
  ],
  'Tesoro Eterno': [
    ConfigField('eternalTreasure.enable', 'Activo', 'bool'),
  ],
  'Cámara del Tesoro': [
    ConfigField('treasureChamber.enable', 'Activo', 'bool'),
  ],
  'Misiones': [
    ConfigField('adminQuest.enable', 'Admin', 'bool'),
    ConfigField('guildQuest.enable', 'Gremio', 'bool'),
  ],
  'Límite de Recursos': [
    ConfigField('resourceLimit.wheat', 'Trigo', 'num'),
    ConfigField('resourceLimit.wood', 'Madera', 'num'),
    ConfigField('resourceLimit.stone', 'Piedra', 'num'),
    ConfigField('resourceLimit.ore', 'Mineral', 'num'),
    ConfigField('resourceLimit.gold', 'Oro', 'num'),
  ],
  'Suministros': [
    ConfigField('supply.enable', 'Activo', 'bool'),
    ConfigField('supply.location', 'Ubicación', 'str'),
    ConfigField('supply.threshold', 'Umbral', 'num'),
    ConfigField('supply.maxAmount', 'Máx. Monto', 'num'),
    ConfigField('supply.caravanLimit', 'Límite caravanas', 'num'),
  ],
  'Coliseo': [
    ConfigField('coliseum.reclaimGems', 'Reclamar gemas auto', 'bool'),
    ConfigField('coliseum.autoAttack', 'Auto-atacar rivales', 'bool'),
    ConfigField('coliseum.hero0', 'Héroe 1', 'hero'),
    ConfigField('coliseum.hero1', 'Héroe 2', 'hero'),
    ConfigField('coliseum.hero2', 'Héroe 3', 'hero'),
    ConfigField('coliseum.hero3', 'Héroe 4', 'hero'),
    ConfigField('coliseum.hero4', 'Héroe 5', 'hero'),
  ],
};