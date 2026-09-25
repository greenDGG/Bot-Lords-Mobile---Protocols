import { ResourcesData } from '../models/resources.types';

export class ResourceTracker {
  wheat = 0;
  wood = 0;
  stone = 0;
  ore = 0;
  gold = 0;

  private resources?: ResourcesData;
  private limit = { wheat: 1_000_000_000, wood: 1_000_000_000, stone: 1_000_000_000, ore: 1_000_000_000, gold: 1_000_000_000 };
  private timer?: NodeJS.Timeout;

  init(resources: ResourcesData, limits: { wheat: number; wood: number; stone: number; ore: number; gold: number }): void {
    this.resources = resources;
    this.limit = limits;
    this.syncFromServer();
  }

  start(): void {
    this.syncFromServer();
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  syncFromServer(): void {
    if (!this.resources) return;
    this.wheat = this.resources.wheat;
    this.wood = this.resources.wood;
    this.stone = this.resources.stone;
    this.ore = this.resources.mineral;
    this.gold = this.resources.gold;
  }

  updateFrom(data: ResourcesData): void {
    this.resources = data;
    this.syncFromServer();
  }

  onUpdate?: () => void;

  private tick(): void {
    if (!this.resources) return;
    this.wheat = this.addPerSec(this.wheat, this.resources.wheatProd, this.limit.wheat);
    this.wood = this.addPerSec(this.wood, this.resources.woodProd, this.limit.wood);
    this.stone = this.addPerSec(this.stone, this.resources.stoneProd, this.limit.stone);
    this.ore = this.addPerSec(this.ore, this.resources.mineralProd, this.limit.ore);
    this.gold = this.addPerSec(this.gold, this.resources.goldProd, this.limit.gold);
    this.resources.wheat = Math.floor(this.wheat);
    this.resources.wood = Math.floor(this.wood);
    this.resources.stone = Math.floor(this.stone);
    this.resources.mineral = Math.floor(this.ore);
    this.resources.gold = Math.floor(this.gold);
    this.onUpdate?.();
  }

  private addPerSec(current: number, prodPerHour: number, limit: number): number {
    if (prodPerHour <= 0) return current;
    const add = prodPerHour / 3600;
    const val = current + add;
    return val > limit ? limit : val;
  }

  hasEnough(wheat: number, wood: number, stone: number, ore: number, gold: number): boolean {
    return this.wheat >= wheat && this.wood >= wood && this.stone >= stone && this.ore >= ore && this.gold >= gold;
  }

  tryConsume(wheat: number, wood: number, stone: number, ore: number, gold: number): boolean {
    if (!this.hasEnough(wheat, wood, stone, ore, gold)) return false;
    this.deduct(wheat, wood, stone, ore, gold);
    return true;
  }

  deduct(wheat: number, wood: number, stone: number, ore: number, gold: number): void {
    // Nunca dejar saldo negativo local: el servidor (proto 2014) es la fuente
    // autoritativa y resincroniza; un negativo aquí solo desinforma a la UI.
    this.wheat = Math.max(0, this.wheat - wheat);
    this.wood = Math.max(0, this.wood - wood);
    this.stone = Math.max(0, this.stone - stone);
    this.ore = Math.max(0, this.ore - ore);
    this.gold = Math.max(0, this.gold - gold);
  }
}
