class Resources {
  final double wheat;
  final double stone;
  final double wood;
  final double mineral;
  final double gold;
  final double wheatProd;
  final double stoneProd;
  final double woodProd;
  final double mineralProd;
  final double goldProd;

  const Resources({
    this.wheat = 0,
    this.stone = 0,
    this.wood = 0,
    this.mineral = 0,
    this.gold = 0,
    this.wheatProd = 0,
    this.stoneProd = 0,
    this.woodProd = 0,
    this.mineralProd = 0,
    this.goldProd = 0,
  });

  factory Resources.fromJson(Map<String, dynamic> json) {
    num n(Object? v) => v is num ? v : 0;
    return Resources(
      wheat: n(json['wheat']).toDouble(),
      stone: n(json['stone']).toDouble(),
      wood: n(json['wood']).toDouble(),
      mineral: n(json['mineral']).toDouble(),
      gold: n(json['gold']).toDouble(),
      wheatProd: n(json['wheatProd']).toDouble(),
      stoneProd: n(json['stoneProd']).toDouble(),
      woodProd: n(json['woodProd']).toDouble(),
      mineralProd: n(json['mineralProd']).toDouble(),
      goldProd: n(json['goldProd']).toDouble(),
    );
  }
}

extension ResourcesExt on Resources {
  List<({String key, String name, String icon, double value, double prod})> get rows => [
        (key: 'wheat', name: 'Trigo', icon: '🌾', value: wheat, prod: wheatProd),
        (key: 'wood', name: 'Madera', icon: '🪵', value: wood, prod: woodProd),
        (key: 'stone', name: 'Piedra', icon: '🪨', value: stone, prod: stoneProd),
        (key: 'mineral', name: 'Mineral', icon: '⛏️', value: mineral, prod: mineralProd),
        (key: 'gold', name: 'Oro', icon: '🪙', value: gold, prod: goldProd),
      ];
}