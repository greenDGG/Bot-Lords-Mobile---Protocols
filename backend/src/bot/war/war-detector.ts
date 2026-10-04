import { BotEngine } from '../engine/bot-engine';
import { WarEvent } from '../models/war.types';
import { MessagePacket } from '../network/message-packet';
import { send2476 } from '../commands/war.commands';
import { decodeCoordBytes } from '../../models/map-coords';
import { parse6611, apply6611, pruneTowerSide } from './war-6611';

export class WarDetector {
  private activeWars: WarEvent[] = [];
  private last2476 = 0;
  private readonly cooldown = 5000;
  private viewing = false;
  private notifyCount = 0;
  // 7315: llega 1 paquete por entrada (no una lista), así que al pedir datos se
  // limpia el lote anterior y el nuevo se indexa por orden de llegada (el primero = 0)
  private fortressResetPending = false;
  private fortressNextIndex = 0;

  onWarsUpdated?: (wars: WarEvent[]) => void;
  onNotification?: (count: number) => void;

  constructor(private bot: BotEngine, private iggId: number) {
    bot.on('packet', (mp: MessagePacket) => this.handlePacket(mp));
  }

  get activeWarsList(): WarEvent[] {
    return [...this.activeWars];
  }

  get notificationCount(): number {
    return this.notifyCount;
  }

  setViewing(v: boolean): void {
    this.viewing = v;
    if (v) {
      this.notifyCount = 0;
      this.requestData();
    }
  }

  clearNotification(): void {
    this.notifyCount = 0;
  }

  requestData(): void {
    const now = Date.now();
    if (now - this.last2476 < this.cooldown) return;
    this.last2476 = now;
    this.fortressResetPending = true;
    this.bot.enqueueCommand(async () => {
      this.bot.log('[AGRU] Solicitando 2476...');
      send2476(this.bot);
    });
  }

  canSend2476(): boolean {
    const now = Date.now();
    if (now - this.last2476 < this.cooldown) return false;
    this.last2476 = now;
    return true;
  }

  private handlePacket(mp: MessagePacket): void {
    const body = mp.data.length > 4 ? mp.data.subarray(4) : mp.data;
    const proto = mp.protocolId;

    if (proto === 2477) {
      // 2477 (8B): dos contadores independientes (correlacionados con los
      // bursts de 6611: cuántos paquetes a=0 y a=1 llegan por lote).
      //   u32[0] = agrupaciones propias del gremio en curso (0..4 observado)
      //   u32[1] = agrupación en contra del gremio (0..3 observado) — agruparon
      //            a ALGUIEN del gremio, no necesariamente a este bot
      const own = body.length >= 4 ? body.readUInt32LE(0) : 0;
      const against = body.length >= 8 ? body.readUInt32LE(4) : 0;
      // El badge sólo se enciende cuando hay agrupación en contra DEL GREMIO
      // (agruparon a alguien del gremio); las propias son informativas.
      this.notifyCount = this.viewing ? 0 : against;
      this.bot.log(
        `[AGRU] 2477 propias=${own} enContra=${against}${this.viewing ? ' (viendo la UI)' : ''}`,
      );
      // El contador SÍ incluye las torres (en los bursts del 02/03-10, propias
      // == nº de paquetes 6611 lado 0), pero va con desfase respecto de los
      // paquetes: sólo se poda cuando un lado queda en 0 (ahí no hay duda).
      // Para una lista que baja de N a M<N alcanza con que el refresco empiece
      // por slot 0, que handle6611 limpia ese lado solo.
      this.pruneTowersIfEmpty('own', own);
      this.pruneTowersIfEmpty('against', against);
      this.onNotification?.(this.notifyCount);
    } else if (proto === 2479) {
      // 2479 = terminó/canceló la agrupación en esa posición (uint32 index * 256)
      this.handle2479(body);
    } else if (proto === 2485) {
      // 2485 = update notification, server pushes 2478 automatically when in UI
    } else if (proto === 2478 && body.length >= 12) {
      this.bot.log(`[AGRU] 2478 raw (${body.length}b): ${body.toString('hex')}`);
      this.handle2478(body);
    } else if (proto === 6611 && body.length >= 12) {
      this.handle6611(body);
    } else if (proto === 7315 && body.length >= 10) {
      this.bot.log(`[AGRU] 7315 raw (${body.length}b): ${body.toString('hex')}`);
      this.handle7315(body);
    }
  }

  // Último tipo de lista recibida (2478/6611/7315): el índice del 2479 se aplica
  // sobre esa lista
  private lastListType: 'castle' | 'tower' | 'fortress' | null = null;

  // 2479: terminó/canceló la agrupación en la posición dada.
  // Body: uint32 LE = index * 256 (misma codificación que la selección 2480)
  private handle2479(body: Buffer): void {
    if (body.length < 4) return;
    const idx = body.readUInt32LE(0) >> 8;
    let victim = this.lastListType
      ? this.activeWars.find(w => w.active && w.type === this.lastListType && w.index === idx)
      : undefined;
    if (!victim) victim = this.activeWars.find(w => w.active && w.index === idx);
    if (!victim) {
      this.bot.log(`[AGRU] 2479 índice ${idx} no encontrado`);
      return;
    }

    this.activeWars = this.activeWars.filter(w => w !== victim);
    if (victim.type === 'fortress') {
      // las fortalezas se numeran por posición: renumerar las que quedan
      this.activeWars
        .filter(w => w.type === 'fortress')
        .sort((a, b) => a.index - b.index)
        .forEach((w, i) => { w.index = i; });
      this.fortressNextIndex = this.activeWars.filter(w => w.type === 'fortress').length;
    } else {
      this.assignIndexes();
    }

    this.bot.log(`[AGRU] 2479 terminó índice ${idx} (${victim.type} "${victim.rallyLeader}") → quedan ${this.activeWars.filter(w => w.active).length}`);
    this.onWarsUpdated?.(this.activeWars);
  }

  // Índice de selección (1144/2480): castillos/torres por menor tiempo restante.
  // Las fortalezas conservan su índice de llegada (los asigna handle7315).
  private assignIndexes(): void {
    const sorted = this.activeWars
      .filter(w => w.active && w.type !== 'fortress')
      .sort((a, b) => a.timeRemainingSec - b.timeRemainingSec);
    for (let i = 0; i < sorted.length; i++) sorted[i].index = i;
  }

  private handle2478(payload: Buffer): void {
    let off = 6;
    if (off >= payload.length) return;
    this.lastListType = 'castle';

    const parsed: WarEvent[] = [];

    while (off + 58 <= payload.length) {
      const ts = payload.readUInt32LE(off); off += 4;
      off += 4; // padding
      const timeRem = payload.readUInt16LE(off); off += 2;
      off += 2; // padding

      // PointCode 3 bytes → decoded coordinates
      const coord = decodeCoordBytes([payload[off], payload[off + 1], payload[off + 2]]);
      off += 3;

      off += 2; // AllyHead

      // AllyName 13 bytes fixed
      const rawName1 = payload.toString('ascii', off, off + 13);
      const rallyLeader = rawName1.replace(/\0+$/, '');
      off += 13;

      // RallyType: 00=unirse a agrupación, 01=ayudar al aliado (reforzar)
      const rallyType = payload[off];
      off += 15; // between fields (RallyType + AllyVIP, AllyRank, troops, kingdom, etc.)

      // EnemyName 13 bytes fixed
      const rawName2 = payload.toString('ascii', off, off + 13);
      const enemyName = rawName2.replace(/\0+$/, '');
      off += 13;

      if (!rallyLeader && coord.x === 0 && coord.y === 0 && timeRem === 0) break;

      const rallyTypeStr = rallyType === 0x01 ? 'refuerzo' : 'agrupacion';
      parsed.push({
        iggId: this.iggId,
        active: true,
        detectedAt: new Date(),
        updatedAt: Date.now(),
        warTimestamp: new Date(ts * 1000),
        timeRemainingSec: timeRem,
        coordX: coord.x,
        coordY: coord.y,
        rallyLeader,
        enemyName,
        rallyType,
        index: 0,
        type: 'castle',
      });
    }

    const currentIds = new Set(parsed.map(w => `${w.coordX},${w.coordY}|${w.rallyLeader}`));
    for (const prev of this.activeWars) {
      if (prev.type !== 'castle') continue; // solo castillos: no desactivar torres/fortalezas
      const key = `${prev.coordX},${prev.coordY}|${prev.rallyLeader}`;
      if (!currentIds.has(key)) {
        prev.active = false;
        this.bot.log(`[AGRU] Guerra terminada: ${prev.rallyLeader}`);
      }
    }

    this.activeWars = this.activeWars.filter(w => w.active || w.timeRemainingSec > 0);
    for (const w of parsed) {
      const existing = this.activeWars.find(x => x.coordX === w.coordX && x.coordY === w.coordY && x.type === w.type);
      if (existing) {
        existing.timeRemainingSec = w.timeRemainingSec;
        existing.updatedAt = w.updatedAt;
        existing.warTimestamp = w.warTimestamp;
        existing.rallyLeader = w.rallyLeader;
        existing.enemyName = w.enemyName;
      } else {
        this.activeWars.push(w);
      }
    }

    this.assignIndexes();

    this.bot.log(`[AGRU] 2478 parseado: ${parsed.length} grupos (${parsed.filter(w => w.rallyType === 1).length} refuerzos, ${parsed.filter(w => w.rallyType === 0).length} agrupaciones), ${this.activeWars.filter(w => w.active).length} activos`);
    this.onWarsUpdated?.(this.activeWars);
  }

  // 6611: UN paquete = UNA agrupación (body siempre de 87 B). N torres =>
  // N paquetes separados; el parser viejo los leía como N entradas de un
  // mismo body y salían entradas fantasmas (coords dentro del nombre de gremio).
  // El layout byte a byte (lado, slot, PointCode, tropas) está en war-6611.ts.
  private handle6611(payload: Buffer): void {
    const e = parse6611(payload);
    if (!e) return;
    this.lastListType = 'tower';

    const sideLabel = e.side === 'own' ? 'propias' : 'en contra';
    const r = apply6611(this.activeWars, e, this.iggId);
    this.activeWars = r.list;
    if (r.dropped > 0) {
      this.bot.log(`[AGRU] 6611 ${sideLabel}: nuevo lote, se limpiaron ${r.dropped} torres`);
    }

    this.assignIndexes();

    const towers = this.activeWars.filter(w => w.type === 'tower').length;
    this.bot.log(
      `[AGRU] 6611 ${sideLabel} [${e.slot}] "${e.rallyLeader}" (${e.coordX},${e.coordY}) ` +
      `${e.troopsCurrent}/${e.troopsMax ?? '?'} tropas · ${towers} torres`,
    );
    this.onWarsUpdated?.(this.activeWars);
  }

  // Poda de un lado de las torres cuando 2477 dice que ese lado quedó en 0
  private pruneTowersIfEmpty(side: 'own' | 'against', count: number): void {
    if (count > 0) return;
    const before = this.activeWars.length;
    this.activeWars = pruneTowerSide(this.activeWars, side);
    if (this.activeWars.length !== before) {
      this.bot.log(`[AGRU] 6611 lado ${side === 'own' ? 'propias' : 'en contra'} = 0 → ${before - this.activeWars.length} torres borradas`);
      this.assignIndexes();
      this.onWarsUpdated?.(this.activeWars);
    }
  }

  private handle7315(payload: Buffer): void {
    let off = 0;
    if (off >= payload.length) return;

    // El7315 llega en UN PAQUETE POR ENTRADA (53b), no como lista completa.
    // Se acumulan en lote: el primero que llega = índice 0.
    // El lote se limpia cuando empieza uno nuevo: sea porque pedimos datos (2476)
    // o porque el servidor lo reenvía empezando por serverIndex = 0.
    const serverIndex = payload.length >= 4 ? payload.readUInt32LE(0) : -1;
    this.lastListType = 'fortress';
    if (serverIndex === 0 || this.fortressResetPending) {      const reason = this.fortressResetPending ? 'tras pedido 2476' : 'serverIndex=0';
      const before = this.activeWars.filter(w => w.type === 'fortress').length;
      this.activeWars = this.activeWars.filter(w => w.type !== 'fortress');
      this.fortressNextIndex = 0;
      this.fortressResetPending = false;
      if (before > 0) this.bot.log(`[AGRU] 7315 nuevo lote (${reason}): se limpiaron ${before} fortalezas viejas`);
    }

    const parsed: WarEvent[] = [];

    while (off + 35 <= payload.length) {
      off += 4; // [0-3] = posición de la entrada (0,1,2...) según los paquetes reales
      // [4] flag de estado: 00 = en espera, 01 = en marcha
      const inMarch = payload[off] === 0x01;
      off += 1;
      const ts = payload.readUInt32LE(off); off += 4;
      off += 4; // padding
      const timeRem = payload.readUInt16LE(off); off += 2;
      off += 2; // padding

      // [17-19] ubicación de 3 bytes (sin determinar: no es pad ni iconType)
      const locA0 = payload[off]; const locA1 = payload[off + 1]; const locA2 = payload[off + 2];
      off += 3;
      const iconId = payload.readUInt16LE(off); off += 2;

      // Nombre: 13 bytes fijos null-padded, sin separador delante de subType
      const rawName = payload.toString('ascii', off, off + 13);
      const rallyLeader = rawName.replace(/\0+$/, '');
      off += 13;

      // [35-36] subType (ej: 0f03) — sin investigar
      let subType = 0;
      let troopsCurrent = 0;
      let troopsMax = 0;
      let kingdom = 0;
      let fort0 = 0;
      let fort1 = 0;
      let fort2 = 0;
      let level = 0;

      if (off + 2 <= payload.length) { subType = payload.readUInt16LE(off); off += 2; }
      if (off + 4 <= payload.length) { troopsCurrent = payload.readUInt32LE(off); off += 4; }
      if (off + 4 <= payload.length) { troopsMax = payload.readUInt32LE(off); off += 4; }
      if (off + 2 <= payload.length) { kingdom = payload.readUInt16LE(off); off += 2; }
      // [47-49] ubicación de la FORTALEZA (3 bytes)
      if (off < payload.length) { fort0 = payload[off]; off += 1; }
      if (off < payload.length) { fort1 = payload[off]; off += 1; }
      if (off < payload.length) { fort2 = payload[off]; off += 1; }
      if (off < payload.length) { level = payload[off]; off += 1; }
      off += 2; // [51-52] 0100 — sin investigar

      if (!rallyLeader && timeRem === 0 && ts === 0) break;

      parsed.push({
        iggId: this.iggId,
        active: true,
        detectedAt: new Date(),
        updatedAt: Date.now(),
        warTimestamp: new Date(ts * 1000),
        timeRemainingSec: timeRem,
        coordX: fort0 | (fort1 << 8),
        coordY: fort2,
        rallyLeader,
        enemyName: '',
        rallyType: 0,
        index: 0,
        type: 'fortress',
        inMarch,
        level,
        troopsCurrent,
        troopsMax,
      });
    }

    // Acumular (no reemplazar): cada paquete es una agrupación más del mismo lote
    for (const w of parsed) {
      const existing = this.activeWars.find(x => x.type === 'fortress' && x.coordX === w.coordX && x.coordY === w.coordY && x.rallyLeader === w.rallyLeader);
      if (existing) {
        existing.timeRemainingSec = w.timeRemainingSec;
        existing.updatedAt = w.updatedAt;
        existing.warTimestamp = w.warTimestamp;
        existing.inMarch = w.inMarch;
        existing.level = w.level;
        existing.troopsCurrent = w.troopsCurrent;
        existing.troopsMax = w.troopsMax;
        existing.active = true;
      } else {
        w.index = this.fortressNextIndex++;
        if (serverIndex >= 0 && serverIndex !== w.index) {
          this.bot.log(`[AGRU] 7315 aviso: serverIndex=${serverIndex} pero por llegada toca ${w.index}`);
        }
        this.activeWars.push(w);
      }
    }

    this.assignIndexes();

    const forts = this.activeWars.filter(w => w.type === 'fortress').length;
    this.bot.log(`[AGRU] 7315 parseado: ${parsed.length} fortaleza(s) (lote acumulado: ${forts}, índices 0..${this.fortressNextIndex - 1})`);
    this.onWarsUpdated?.(this.activeWars);
  }
}
