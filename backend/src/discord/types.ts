export interface DiscordNotificationEvent {
  hex: string;
  timestamp: number;
  type: string;
  missionIds: string[];
  title: string;
  description: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
}

export interface DiscordChannelConfig {
  guildId: string;
  channelId: string;
  missionRoles: Record<string, string>;
  enabled: boolean;
}
