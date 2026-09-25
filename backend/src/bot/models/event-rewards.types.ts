export interface EventRewardLevel {
  gemsEntrega: number;
  valorGemas: number;
  sinValorar: number;
}

export interface EventRewardRecord {
  itemId: number;
  amount: number;
}

export interface EventRewardData {
  eventType: number;
  missionIds: number[];
  levels: [EventRewardLevel, EventRewardLevel, EventRewardLevel];
  counts: [number, number, number];
  records: EventRewardRecord[];
}
