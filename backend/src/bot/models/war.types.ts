export interface WarEvent {
  iggId: number;
  active: boolean;
  detectedAt: Date;
  warTimestamp?: Date;
  timeRemainingSec: number;
  coordX: number;
  coordY: number;
  rallyLeader: string;
  enemyName: string;
  rallyType: number;
  index: number;
  type: string;
}
