export interface MissionEntry {
  missionId: number;
  name: string;
  timestamp: number;
  total: number;
  points: number;
  available: boolean;
}

export interface MissionData {
  progress: number;
  activeMission: MissionEntry | null;
  missions: MissionEntry[];
}

export interface ActiveMission {
  unknown: number;
  missionId: number;
  level: number;
  remaining: number;
  endTimestamp: number;
  separator1: Buffer;
  timeMinutes: number;
  startTimestamp: number;
  reserved: Buffer;
  missionType: number;
  specialFlag: boolean;
}

export interface MissionSlot {
  appearanceTimestamp: number;
  separator: Buffer;
  level: number;
  missionId: number;
  completed: number;
}

export interface FdgMissionExtensionData {
  activeMission: ActiveMission;
  mission200: MissionSlot;
  mission120: MissionSlot;
}

export interface MissionRecord {
  type: 'normal' | 'waiting';
  missionId?: number;
  level?: number;
  unknown3?: Buffer;
  status?: number;
  timestamp?: number;
}

export interface MissionRecordData {
  header: Buffer;
  records: MissionRecord[];
}
