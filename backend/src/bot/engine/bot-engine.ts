import { EventEmitter } from 'events';
import * as net from 'net';
import { AccountRecord, createDevice } from './account-info';
import { GameClient } from '../network/game-client';
import { MessagePacket } from '../network/message-packet';
import { setDesKey, hasKey, decryptFull } from '../network/crypto';
import { configService } from '../../config/config.service';
import { parseCargoShip, CargoShipData } from '../models/cargo-ship.types';
import { ProxyAuthBytes, loadProxyAuthBytes } from '../features/proxy-auth-config';

export type LogFn = (msg: string) => void;
export type StatusFn = (online: boolean) => void;
export type PacketFn = (mp: MessagePacket, seq: number) => void;
export type ReadyFn = () => void;

export class BotEngine extends EventEmitter {
  readonly game = new GameClient();
  private heartbeatTimer?: NodeJS.Timeout;
  private online = false;
  private iggId = 0;
  private globalSeq = 1;
  private recvSeq = 0;
  private device = createDevice();
  private pendingReplies = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();
  private pendingReplyTimers = new Map<number, NodeJS.Timeout>();
  private helpIds: number[] = [];

  waitForReply<T>(proto: number, timeoutMs = 5000): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve, reject) => {
      if (this.pendingReplyTimers.has(proto)) clearTimeout(this.pendingReplyTimers.get(proto)!);
      this.pendingReplies.set(proto, { resolve, reject });
      this.pendingReplyTimers.set(proto, setTimeout(() => {
        if (this.pendingReplies.has(proto)) {
          this.pendingReplies.delete(proto);
          this.pendingReplyTimers.delete(proto);
          resolve(undefined);
        }
      }, timeoutMs));
    });
  }

  waitForAnyReply(protos: number[], timeoutMs = 5000): Promise<number | undefined> {
    return new Promise<number | undefined>((resolve) => {
      const timer = setTimeout(() => {
        for (const p of protos) {
          this.pendingReplies.delete(p);
          this.pendingReplyTimers.delete(p);
        }
        resolve(undefined);
      }, timeoutMs);

      for (const p of protos) {
        if (this.pendingReplyTimers.has(p)) clearTimeout(this.pendingReplyTimers.get(p)!);
        this.pendingReplies.set(p, { resolve: () => {
          clearTimeout(timer);
          for (const q of protos) {
            this.pendingReplies.delete(q);
            this.pendingReplyTimers.delete(q);
          }
          resolve(p);
        }, reject: () => {} });
        this.pendingReplyTimers.set(p, timer);
      }
    });
  }

  private resolveReply(proto: number, value?: any): void {
    if (this.pendingReplyTimers.has(proto)) clearTimeout(this.pendingReplyTimers.get(proto)!);
    const pending = this.pendingReplies.get(proto);
    if (pending) {
      this.pendingReplies.delete(proto);
      this.pendingReplyTimers.delete(proto);
      pending.resolve(value);
    }
  }
  private last3402Ids?: Buffer;
  private initBusy = false;
  private cmdQueue: Array<() => Promise<void>> = [];
  private cmdQueueRunning = false;

  account?: AccountRecord;
  lastAuthError?: string;

  cargoShip?: CargoShipData;
  shipDataRequested = false;

  get isOnline(): boolean { return this.online; }
  get helpIdList(): number[] { return this.helpIds; }
  get globalSeqNum(): number { return this.globalSeq; }
  set globalSeqNum(v: number) { this.globalSeq = v; }

  constructor() {
    super();
    this.setMaxListeners(0);
    this.game.on('log', (msg: string) => this.log(msg));
    this.game.on('packet', (mp: MessagePacket) => this.onGamePacket(mp));
    this.game.on('disconnected', () => this.onDisconnected());

    setDesKey(configService.desKey);
  }

  private onDisconnected(): void {
    this.online = false;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
    this.emit('status', false);
    this.log('[*] Conexión perdida');
  }

  log(msg: string): void {
    this.emit('log', msg);
  }

  // ── Token handling ──

  setToken(accessToken: string, iggId: number): void {
    this.account = { iggId, accessKey: accessToken, uuid: this.device.uuid, device: this.device, gameId: 'lordsmobile' };
    this.iggId = iggId;
    this.log(`[+] Token configurado para IGG ID ${iggId}`);
  }

  // ── Proxy Auth ──

  async proxyAuth(): Promise<{ success: boolean; gameIp?: string; gamePort?: number }> {
    if (!this.account?.accessKey) {
      this.log('[-] No hay access_token para autenticar con proxy');
      return { success: false };
    }

    const proxyAddr = this.account.proxyAddress;
    if (!proxyAddr) {
      this.log('[-] No hay dirección de proxy en la cuenta');
      return { success: false };
    }

    const parts = proxyAddr.split(':');
    if (parts.length !== 2) {
      this.log(`[-] Dirección de proxy inválida: "${proxyAddr}"`);
      return { success: false };
    }

    const proxyHost = parts[0];
    const proxyPort = parseInt(parts[1], 10);

    this.log(`[*] Autenticando con proxy ${proxyHost}:${proxyPort}...`);

    return new Promise((resolve) => {
      const proxy = new net.Socket();
      proxy.setNoDelay(true);
      let settled = false;
      const buf = Buffer.alloc(4096);
      let total = 0;

      const finish = (result: { success: boolean; gameIp?: string; gamePort?: number }) => {
        if (settled) return;
        settled = true;
        proxy.destroy();
        resolve(result);
      };

      proxy.connect(proxyPort, proxyHost, async () => {
        const bytes = await loadProxyAuthBytes();
        const pkt = this.buildProxyAuthPacket(bytes);
        this.log(`[*] Enviando auth packet v${bytes.versionMajor}.${bytes.versionMinor}.${(bytes.versionPatchHigh << 8) | bytes.versionPatchLow} (${pkt.length} bytes)`);
        proxy.write(pkt);
      });

      proxy.on('data', (data) => {
        if (data.length > buf.length - total) {
          finish({ success: false });
          return;
        }
        data.copy(buf, total);
        total += data.length;

        // Already got enough data to parse (min 20 bytes for a valid response)
        if (total >= 20) {
          const proto = buf.readUInt16LE(2);
          if (proto === 0x03EB) {
            const gamePort = buf.readInt32LE(4);
            let gameIp: string | undefined;
            let ipEnd = 16;
            while (ipEnd < total && buf[ipEnd] !== 0) ipEnd++;
            if (ipEnd > 16) gameIp = buf.toString('ascii', 16, ipEnd);
            this.log(`[*] Proxy asignó servidor: ${gameIp || '(sin IP)'}:${gamePort}`);
            finish({ success: true, gameIp, gamePort });
          } else {
            this.log(`[-] Proxy respondió con proto 0x${proto.toString(16)} (esperado 0x03EB)`);
            finish({ success: false });
          }
        }
      });

      proxy.on('error', (err) => {
        this.log(`[-] Error conectando al proxy: ${err.message}`);
        finish({ success: false });
      });

      proxy.on('close', () => {
        if (settled) return;
        if (total < 4) {
          this.log('[-] Proxy cerró conexión sin enviar datos suficientes');
          finish({ success: false });
        }
      });

      // Timeout safety
      setTimeout(() => {
        if (total < 20) {
          this.log('[-] Proxy timeout - respuesta insuficiente');
          finish({ success: false });
        }
      }, 5000);
    });
  }

  private buildProxyAuthPacket(bytes: ProxyAuthBytes): Buffer {
    const jwt = this.account!.accessKey!;
    const jwtBytes = Buffer.from(jwt, 'utf-8');
    const fixedSize = 0x246;
    const buf = Buffer.alloc(fixedSize, 0);

    buf[0] = fixedSize & 0xFF;
    buf[1] = (fixedSize >> 8) & 0xFF;
    buf[2] = 0x13; buf[3] = 0x04;
    buf.writeInt32LE(this.iggId, 4);
    // Bytes configurables globalmente (DB → colección proxyauths), editables desde web/app
    buf[0x0C] = bytes.versionMinor;
    buf[0x0D] = bytes.versionMajor;
    buf[0x0E] = bytes.versionPatchLow;
    buf[0x0F] = bytes.versionPatchHigh;
    buf[0x10] = bytes.extra1;
    buf[0x11] = bytes.extra2;

    const jwtLen = Math.min(jwtBytes.length, fixedSize - 0x44 - 2);
    buf.writeUInt16LE(jwtLen, 0x44);
    jwtBytes.copy(buf, 0x46, 0, jwtLen);

    return buf;
  }

  // ── Connection ──

  async connectToGameServer(ip: string, port: number): Promise<boolean> {
    this.log(`[*] Conectando a ${ip}:${port}...`);
    return await this.game.connect(ip, port);
  }

  goOnline(): void {
    if (!this.game.connected) {
      this.log('[-] No conectado al servidor');
      return;
    }
    if (!this.account?.accessKey) {
      this.log('[-] No hay token de acceso');
      return;
    }

    this.globalSeq = 1;
    this.last3402Ids = undefined;
    this.iggId = Number(this.account.iggId);

    this.sendLoginPacket();
    this.log('[AUTH] Login packet enviado, esperando init...');

    setTimeout(() => this.sendInitSequence(), 3000);
  }

  private sendHeartbeat(): void {
    if (!this.online || !this.game.connected) return;
    const seq = this.globalSeq++;
    const body = Buffer.alloc(4);
    body.writeInt32LE(seq, 0);
    const buf = Buffer.alloc(4 + body.length);
    buf.writeUInt16LE(buf.length, 0);
    buf.writeUInt16LE(1024, 2);
    body.copy(buf, 4);
    this.game.sendRaw(buf);
  }

  private sendLoginPacket(): void {
    const jwt = this.account!.accessKey!;
    const jwtBytes = Buffer.from(jwt, 'utf-8');
    const fixedSize = 0x246;
    const jwtSlot = 68;
    const buf = Buffer.alloc(fixedSize, 0);

    buf[0] = fixedSize & 0xFF;
    buf[1] = (fixedSize >> 8) & 0xFF;
    buf[2] = 0x14; buf[3] = 0x04;
    buf.writeInt32LE(this.iggId, 4);

    const jwtLen = Math.min(jwtBytes.length, fixedSize - jwtSlot - 2);
    buf.writeUInt16LE(jwtLen, jwtSlot);
    jwtBytes.copy(buf, jwtSlot + 2, 0, jwtLen);

    this.game.sendRaw(buf);
    this.log(`[AUTH] Sent login packet (${fixedSize} bytes, JWT ${jwtLen}/${jwtBytes.length} bytes at offset ${jwtSlot})`);
  }

  // ── Init Sequence ──

  private async sendInitSequence(): Promise<void> {
    if (this.initBusy) { this.log('[INIT] Ya en ejecución, ignorando'); return; }
    this.initBusy = true;

    try {
      if (!this.game.connected) { this.initBusy = false; return; }
      this.log('[*] Enviando secuencia de inicialización...');

      const iggBytes = Buffer.alloc(4);
      iggBytes.writeInt32LE(this.iggId, 0);
      const iggBytesArr = [...iggBytes];

      // sendProto: wraps payload with 4-byte LE seq (matches C# BitConverter.GetBytes(seq))
      const sendProto = (proto: number, payload: Buffer) => {
        const seq = this.globalSeq++;
        const full = Buffer.alloc(4 + payload.length);
        full.writeInt32LE(seq, 0);
        payload.copy(full, 4);
        this.sendInitPacket(proto, full);
      };

      sendProto(1020, Buffer.from([iggBytesArr[0], iggBytesArr[1], iggBytesArr[2], iggBytesArr[3], 0, 0, 0, 0]));
      await this.delay(1000);
      sendProto(1416, Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
      await this.delay(1000);
      sendProto(1414, Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
      await this.delay(1000);
      sendProto(1418, Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));

      // 3002 plaintext (C#: seq 4 bytes LE + 00 00 FF)
      {
        const seq = this.globalSeq++;
        const full = Buffer.alloc(7);
        full.writeInt32LE(seq, 0);
        full[4] = 0x00; full[5] = 0x00; full[6] = 0xFF;
        const buf = Buffer.alloc(4 + full.length);
        buf.writeUInt16LE(buf.length, 0);
        buf.writeUInt16LE(3002, 2);
        full.copy(buf, 4);
        this.game.sendRaw(buf);
        this.log(`[INIT] proto=3002 plain raw=${full.toString('hex')}`);
      }

      let ids = this.last3402Ids;
      if (!ids) {
        this.log('[*] Esperando IDs (3201/3402)...');
        ids = await this.waitForReply<Buffer>(3402, 5000);
      }

      if (ids && ids.length >= 4) {
        const count = ids.length / 4;
        const payload = Buffer.alloc(1 + ids.length);
        payload[0] = count;
        ids.copy(payload, 1);
        sendProto(3438, payload);
        await this.delay(100);

        // 11155 plaintext
        {
          const seq = this.globalSeq++;
          const body = Buffer.alloc(5);
          body.writeInt32LE(seq, 0);
          body[4] = 0x58;
          const buf = Buffer.alloc(4 + body.length);
          buf.writeUInt16LE(buf.length, 0);
          buf.writeUInt16LE(11155, 2);
          body.copy(buf, 4);
          this.game.sendRaw(buf);
          this.log(`[INIT] proto=11155 plain raw=${body.toString('hex')}`);
        }

        await this.delay(100);

        // 9721 #1
        {
          const seq = this.globalSeq++;
          const body = Buffer.alloc(4);
          body.writeInt32LE(seq, 0);
          const buf = Buffer.alloc(4 + body.length);
          buf.writeUInt16LE(buf.length, 0);
          buf.writeUInt16LE(9721, 2);
          body.copy(buf, 4);
          this.game.sendRaw(buf);
          this.log(`[INIT] proto=9721 #1 plain`);
        }

        await this.delay(100);

        // 9721 #2 (wire proto 0x0FA2)
        {
          const seq = this.globalSeq++;
          const body = Buffer.alloc(7);
          body.writeInt32LE(seq, 0);
          body[4] = 0x01; body[5] = 0x2F; body[6] = 0xC1;
          const buf = Buffer.alloc(4 + body.length);
          buf.writeUInt16LE(buf.length, 0);
          buf.writeUInt16LE(0x0FA2, 2);
          body.copy(buf, 4);
          this.game.sendRaw(buf);
          this.log(`[INIT] proto=9721 #2 plain`);
        }

        await this.delay(100);

        // 4004 (wire proto 0x0FA4)
        {
          const seq = this.globalSeq++;
          const body = Buffer.alloc(7);
          body.writeInt32LE(seq, 0);
          body[4] = 0x2F; body[5] = 0xC1; body[6] = 0x00;
          const buf = Buffer.alloc(4 + body.length);
          buf.writeUInt16LE(buf.length, 0);
          buf.writeUInt16LE(0x0FA4, 2);
          body.copy(buf, 4);
          this.game.sendRaw(buf);
          this.log(`[INIT] proto=4004 plain`);
        }
      } else {
        this.log('[-] No hay IDs para 3438');
      }

      this.log('[*] Init básico completado');
      this.online = true;
      this.emit('status', true);
      this.emit('ready');
      this.log('[+] ¡EN LÍNEA!');

      this.heartbeatTimer = setInterval(() => {
        try { this.sendHeartbeat(); } catch { }
      }, 15000);
    } catch (ex: any) {
      this.log(`[-] Error en init sequence: ${ex.message}`);
    }

    this.initBusy = false;
  }

  private sendInitPacket(proto: number, payload: Buffer): void {
    if (!this.game.connected) return;
    const mp = new MessagePacket(proto);
    mp.writeBytes(payload);
    this.game.send(mp);
    this.log(`[INIT] proto=${proto} raw=${payload.toString('hex')}`);
  }

  // ── Packet handlers ──

  private onGamePacket(mp: MessagePacket): void {
    const seq = ++this.recvSeq;
    const proto = mp.protocolId;
    // Filtrar protos que generan spam (heartbeat, etc.)
    if (proto !== 1024 && proto !== 1025 && proto !== 2869) {
      this.log(`[RECV #${seq}] ${mp}`);
    }
    this.emit('packet', mp, seq);

    const raw = mp.data;
    const body = raw.length > 4 ? raw.subarray(4) : raw;

    // 3404 - IDs de edificios
    if (proto === 3404) {
      const preview = body.length >= 4 ? body.subarray(0, Math.min(8, body.length)).toString('hex') : '?';
      this.log(`[3404] body len=${body.length} first8=${preview}`);
      let ids = this.tryParseIdList(body);
      if (!ids && hasKey()) {
        const dec = decryptFull(body);
        ids = this.tryParseIdList(dec);
      }
      if (ids) {
        this.log(`[3404] parsed OK count=${ids.length / 4}`);
        this.last3402Ids = ids;
        this.resolveReply(3402, ids);
      } else {
        this.log('[3404] parse FAILED');
      }
    }

    // 2851 - sincronización de ayudas
    if (proto === 2851) {
      this.helpIds.length = 0;
      let pos = 2;
      while (pos + 15 <= body.length) {
        const id = body.readUInt32LE(pos);
        if (id === 0 || id > 1000000) break;
        this.helpIds.push(id);
        this.log(`[HELP] ID=${id} from 2851 sync`);
        pos += 4 + 3;
        while (pos < body.length && body[pos] !== 0) pos++;
        pos++;
        pos += 8;
      }
      this.log(`[HELP] ${this.helpIds.length} IDs cargados de sync`);
    }

    // 2854 - nueva solicitud de ayuda
    if (proto === 2854 && body.length >= 4) {
      const id = body.readUInt32LE(0);
      if (id > 0 && id < 1000000) {
        this.helpIds.push(id);
        this.log(`[HELP] ID=${id} agregado (nueva solicitud)`);
        this.emit('newHelp');
      }
    }

    // 2478 - datos de guerra (castillos)
    if (proto === 2478) this.resolveReply(2478);

    // 7315 - datos de guerra (fortalezas)
    if (proto === 7315) this.resolveReply(7315);

    // 1110 - respuesta de perfil de jugador
    if (proto === 1110) this.resolveReply(1110, body);

    // 2205 - respuesta de ubicación de jugador
    if (proto === 2205) this.resolveReply(2205, body);

    // 2481 - respuesta ventana guerra
    if (proto === 2481) {
      this.resolveReply(2481);
      this.log('[GUERRA] 2481 recibido');
    }

    // 2483 - lista de participantes/rally
    if (proto === 2483) {
      this.resolveReply(2483, body);
      this.log(`[GUERRA] 2483 recibido (${body.length}b)`);
    }

    // 6302 - barco de carga
    if (proto === 6302) {
      const ship = parseCargoShip(body);
      this.cargoShip = ship;
      this.emit('cargoShipUpdated');
      const resNames = ['wheat', 'stone', 'wood', 'ore', 'gold'];
      this.log(`[BARCO] ts=${ship.timestamp.toLocaleTimeString()} offers=${ship.offers.length}`);
      for (let i = 0; i < ship.offers.length; i++) {
        const o = ship.offers[i];
        const resName = o.costResource < resNames.length ? resNames[o.costResource] : `?${o.costResource}`;
        this.log(`[BARCO]  slot=${i} cost=${resName}(${o.price}) cat=${o.categoryId} obj=${o.objectId} qty=${o.quantity} stars=${o.stars}`);
      }
    }
  }

  private tryParseIdList(data: Buffer): Buffer | null {
    if (data.length < 6) return null;
    const count = data[0];
    if (count <= 0 || count > 200) return null;
    if (1 + count * 5 !== data.length) return null;
    const list = Buffer.alloc(count * 4);
    for (let i = 0; i < count; i++) {
      const off = 1 + i * 5;
      list[4 * i] = data[off];
      list[4 * i + 1] = data[off + 1];
      list[4 * i + 2] = data[off + 2];
      list[4 * i + 3] = data[off + 3];
    }
    return list;
  }

  // ── Command Queue ──

  enqueueCommand(action: () => Promise<void>): void {
    this.cmdQueue.push(action);
    if (!this.cmdQueueRunning) {
      this.cmdQueueRunning = true;
      this.processCommandQueue();
    }
  }

  enqueueDelay(ms: number): void {
    this.enqueueCommand(async () => new Promise(resolve => setTimeout(resolve, ms)));
  }

  private async processCommandQueue(): Promise<void> {
    while (true) {
      const item = this.cmdQueue.shift();
      if (!item) {
        this.cmdQueueRunning = false;
        return;
      }
      try { await item(); } catch (ex: any) { this.log(`[-] Queue error: ${ex.message}`); }
    }
  }

  // ── Sending commands ──

  sendCommandPacket(proto: number, payload: Buffer, includeSeq = false): void {
    if (!this.online || !this.game.connected) { this.log('[-] No conectado'); return; }

    let fullPayload: Buffer;
    if (includeSeq) {
      fullPayload = Buffer.alloc(4 + payload.length);
      fullPayload.writeInt32LE(this.globalSeq++, 0);
      payload.copy(fullPayload, 4);
    } else {
      fullPayload = payload;
    }

    const buf = Buffer.alloc(4 + fullPayload.length);
    buf.writeUInt16LE(buf.length, 0);
    buf.writeUInt16LE(proto, 2);
    fullPayload.copy(buf, 4);

    if (includeSeq) {
      const mp = new MessagePacket(proto);
      mp.writeBytes(fullPayload);
      this.game.send(mp);
    } else {
      this.game.sendRaw(buf);
    }
    this.log(`[CMD] proto=${proto} ${includeSeq ? 'seq' : 'raw'}=${fullPayload.toString('hex')}`);
  }

  sendEncrypted(proto: number, payload: Buffer): void {
    if (!this.online || !this.game.connected) { this.log('[-] No conectado'); return; }
    const mp = new MessagePacket(proto);
    mp.writeBytes(payload);
    this.game.send(mp);
    this.log(`[CMD] proto=${proto} enc=${payload.toString('hex')}`);
    if (proto === 2445) {
      this.emit('sentPacket', { proto, payload });
    }
  }

  sendRaw(data: Buffer): void {
    if (!this.game.connected) { this.log('[-] No conectado'); return; }
    this.game.sendRaw(data);
    this.log(`[RAW] ${data.toString('hex')}`);
  }

  requestShipData(): void {
    const payload = Buffer.alloc(5);
    payload.writeUInt32LE(this.globalSeq++, 0);
    payload[4] = 0x01;
    this.shipDataRequested = true;
    this.sendCommandPacket(3111, payload, false);
    this.log('[BARCO] Solicitando datos del barco (3111 01)');
  }

  requestQuestData(): void {
    const payload = Buffer.alloc(5);
    payload.writeUInt32LE(this.globalSeq++, 0);
    payload[4] = 0x02;
    this.sendCommandPacket(3111, payload, false);
    this.log('[QUESTS] Solicitando datos de misiones (3111 02)');
  }

  // ── War helpers ──

  // ── Help ──

  sendHelp(): void {
    if (!this.online || !this.game.connected) { this.log('[-] No conectado'); return; }
    if (this.helpIds.length === 0) { this.log('[-] No hay IDs de ayuda guardados'); return; }

    const count = Math.min(this.helpIds.length, 20);
    const payload = Buffer.alloc(2 + count * 4);
    payload[0] = count;
    payload[1] = 0;
    for (let i = 0; i < count; i++) {
      payload.writeUInt32LE(this.helpIds[i], 2 + i * 4);
    }
    this.sendCommandPacket(2855, payload, true);
    this.log(`[HELP] Enviando ayuda para ${count} IDs`);
    this.helpIds.length = 0;
  }

  sendHelpAuto(): void {
    if (!this.online || !this.game.connected) return;
    if (this.helpIds.length === 0) return;
    const count = Math.min(this.helpIds.length, 20);
    const payload = Buffer.alloc(2 + count * 4);
    payload[0] = count;
    payload[1] = 0;
    for (let i = 0; i < count; i++) {
      payload.writeUInt32LE(this.helpIds[i], 2 + i * 4);
    }
    this.sendCommandPacket(2855, payload, true);
  }

  // ── Chat ──

  /**
   * 3001 _MSG_REQUEST_SENDCHAT. Layout (verificado contra la respuesta 3003 del
   * servidor: parsea `canal`(u8) + 0 + 5 + `len`(u16) + texto justo después del seq):
   *   [u8 canal][u8 0][u8 5][u16 len][texto]
   * canal: 0 = mundo/global, 1 = gremio (misma numeración que el 3002 VIEWCHAT).
   */
  sendChat(text: string, channel = 1): void {
    if (!this.online || !this.game.connected) { this.log('[-] No conectado'); return; }
    const textBytes = Buffer.from(text, 'utf-8');
    const body = Buffer.alloc(1 + 1 + 1 + 2 + textBytes.length);
    let off = 0;
    body[off++] = channel;
    body[off++] = 0;
    body[off++] = 5;
    body.writeUInt16LE(textBytes.length, off); off += 2;
    textBytes.copy(body, off);
    this.sendCommandPacket(3001, body, true);
    this.log(`[CHAT] canal=${channel === 1 ? 'gremio' : 'mundo'} "${text}"`);
  }

  // ── Disconnect ──

  disconnect(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.online = false;
    this.helpIds.length = 0;
    this.emit('status', false);
    this.game.disconnect();
    this.log('[*] Desconectado');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
