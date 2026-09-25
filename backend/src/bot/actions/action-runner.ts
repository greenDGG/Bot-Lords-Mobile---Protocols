import { BotInstance } from '../core/bot-instance';
import { BotAction, createActions } from './bot-action';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class ActionRunner {
  private actions: BotAction[] = [];
  private index = 0;
  private running = false;
  // Cooldown real tras una acción que sí llamó al juego
  private readonly cooldownMs = 30000;
  // Pausa mínima cuando la acción no hizo nada (cooldown/espera) para no saturar
  private readonly idleMs = 1500;
  private readonly supplyWaitMs = 10000;
  private readonly offlineWaitMs = 5000;

  constructor(private bot: BotInstance) {
    this.actions = createActions();
  }

  start(): void {
    if (this.running) return;
    if (this.bot.config.warMode) {
      this.bot.bot.log('[ACTION] No se inicia: warMode activo');
      return;
    }
    this.running = true;
    this.index = 0;
    this.bot.bot.log('[ACTION] Bucle iniciado');
    this.loop();
  }

  stop(): void {
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  pause(): void {
    if (!this.running) return;
    this.running = false;
    this.bot.bot.log('[ACTION] Bucle pausado');
  }

  resume(): void {
    if (this.running) return;
    if (this.bot.config.warMode) {
      this.bot.bot.log('[ACTION] No se reanuda: warMode activo');
      return;
    }
    this.running = true;
    this.bot.bot.log('[ACTION] Bucle reanudado');
    this.loop();
  }

  private async loop(): Promise<void> {
    while (this.running) {
      if (this.bot.config.warMode) {
        this.running = false;
        this.bot.bot.log('[ACTION] Bucle detenido (warMode activo)');
        return;
      }

      if (!this.bot.bot.isOnline) {
        await delay(this.offlineWaitMs);
        continue;
      }

      // Si hay caravanas de supply en progreso, no ejecutar ninguna otra acción
      if (this.bot.supplyPending.length > 0) {
        this.bot.bot.log('[ACTION] Supply en progreso, saltando tick...');
        await delay(this.supplyWaitMs);
        continue;
      }

      const action = this.actions[this.index];
      let didSomething = false;
      try {
        didSomething = (await action.execute(this.bot)) === true;
      } catch (ex: any) {
        this.bot.bot.log(`[ACTION] Error en ${action.name}: ${ex.message}`);
      }
      this.index = (this.index + 1) % this.actions.length;

      // Solo esperar el cooldown si la acción realmente llamó al juego.
      // Si estaba en cooldown / no hizo nada, pasar a la siguiente acción ya.
      await delay(didSomething ? this.cooldownMs : this.idleMs);
    }
  }
}
