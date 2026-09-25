export enum TroopBranch { Infantry, Cavalry, Artillery, Siege }

export interface TroopTraining {
  troopType: number;
  tier: number;
  count: number;
  timestamp: number;
  remainingSeconds: number;
}
