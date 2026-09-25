import { Module } from '@nestjs/common';
import { AppGateway } from './app.gateway';
import { AccountManager } from '../bot/core/account-manager';
import { DiscordModule } from '../discord/discord.module';

@Module({
  imports: [DiscordModule],
  providers: [AppGateway, AccountManager],
})
export class AppModule {}
