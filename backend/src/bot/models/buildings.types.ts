export enum BuildingId {
  None = 0,
  Logging = 1,
  Quarry = 2,
  Mine = 3,
  Farm = 4,
  Manor = 5,
  Barrack = 6,
  Hospital = 7,
  Castle = 8,
  Storehouse = 9,
  Academy = 10,
  WarHall = 11,
  Wall = 12,
  WatchTower = 13,
  Embassy = 14,
  Forge = 15,
  TreasureTrove = 16,
  TradingPost = 17,
  Prison = 18,
  Altar = 19,
  Monsterhold = 20,
  Spring = 21,
  MysticSpire = 22,
  Gym = 23,
  MoonStone = 24,
  Artifact = 25,
  MagicPowerMine = 26,
  MagicPowerBarrack = 27,
  VillageHouse = 28,
  DefendTower1 = 29,
  DefendTower2 = 30,
  DefendTower3 = 31,
  HeroChallenge = 100,
  Arena = 101,
  Shelter = 102,
  NpcReward = 105,
  Gamble = 106,
  Monopoly = 107,
  Valhalla = 109,
  TowerDefense = 110,
  Relics = 111,
  CombatTower = 112,
}

export interface BuildingInfo {
  position: number;
  id: BuildingId;
  level: number;
}

export class BuildingState {
  buildings: BuildingInfo[] = [];

  getBuilding(id: BuildingId): BuildingInfo | undefined {
    return this.buildings.find(b => b.id === id);
  }

  hasBuilding(id: BuildingId): boolean {
    return this.buildings.some(b => b.id === id);
  }

  getBuildingLevel(id: BuildingId): number {
    const b = this.getBuilding(id);
    return b ? b.level : 0;
  }
}

export interface ConstructionEntry {
  active: boolean;
  position: number;
  id: number;
  level: number;
  timestamp: number;
  remainingSeconds: number;
}

export interface ConstructionData {
  constructions: ConstructionEntry[];
  globalTimestamp: number;
}
