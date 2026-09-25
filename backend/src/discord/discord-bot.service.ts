import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Client, GatewayIntentBits, Events } from 'discord.js';

@Injectable()
export class DiscordBotService implements OnModuleInit, OnModuleDestroy {
  private client: Client | null = null;
  private ready = false;

  private readonly token = process.env.DISCORD_BOT_TOKEN || '';

  async onModuleInit(): Promise<void> {
    if (!this.token) {
      console.warn('[Discord] DISCORD_BOT_TOKEN no configurado, bot desactivado');
      return;
    }

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
      ],
    });

    this.client.once(Events.ClientReady, (c) => {
      this.ready = true;
      console.log(`[Discord] Bot listo como ${c.user.tag}`);
    });

    this.client.on(Events.Error, (err) => {
      console.error('[Discord] Error del client:', err.message);
    });

    try {
      await this.client.login(this.token);
    } catch (err) {
      console.error('[Discord] Error al login:', (err as Error).message);
    }
  }

  onModuleDestroy(): void {
    if (this.client) {
      this.client.destroy();
      this.client = null;
      this.ready = false;
    }
  }

  getClient(): Client | null {
    return this.client;
  }

  isReady(): boolean {
    return this.ready && this.client !== null;
  }
}
