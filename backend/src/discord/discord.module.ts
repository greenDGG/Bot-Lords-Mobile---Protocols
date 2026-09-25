import { Module } from '@nestjs/common';
import { DiscordBotService } from './discord-bot.service';
import { DiscordNotificationService } from './discord-notification.service';
import { DiscordCommandsService } from './discord-commands.service';

@Module({
  providers: [
    DiscordBotService,
    DiscordNotificationService,
    DiscordCommandsService,
  ],
  exports: [DiscordNotificationService],
})
export class DiscordModule {}
