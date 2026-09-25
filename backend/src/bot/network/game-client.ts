import * as net from 'net';
import { EventEmitter } from 'events';
import { MessagePacket } from './message-packet';
import { decryptFull, hasKey, encryptBlock } from './crypto';

export class GameClient extends EventEmitter {
  private tcp?: net.Socket;
  private running = false;
  private seqId = 0;
  private recvBuf = Buffer.alloc(0);

  serverIP?: string;
  port: number = 10714;

  get connected(): boolean {
    return this.tcp !== undefined && !this.tcp.destroyed && this.running;
  }

  get sequence(): number {
    return this.seqId;
  }

  async connect(ip: string, port: number): Promise<boolean> {
    this.serverIP = ip;
    this.port = port;
    this.seqId = 0;
    this.recvBuf = Buffer.alloc(0);

    return new Promise((resolve) => {
      this.tcp = new net.Socket();
      this.tcp.setNoDelay(true);

      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };

      this.tcp.on('connect', () => {
        this.running = true;
        this.log(`[+] Conectado a ${ip}:${port}`);
        finish(true);
      });

      this.tcp.on('data', (data: Buffer) => {
        if (!this.running) return;
        this.recvBuf = Buffer.concat([this.recvBuf, data]);
        this.processBuffer();
      });

      this.tcp.on('close', () => {
        this.running = false;
        this.log('[-] Desconectado del servidor');
        this.emit('disconnected');
        finish(false);
      });

      this.tcp.on('error', (err) => {
        this.log(`[!] Error de conexión: ${err.message}`);
        finish(false);
      });

      this.tcp.connect(port, ip);

      // Connection timeout
      setTimeout(() => {
        if (!settled) {
          this.log(`[-] Timeout conectando a ${ip}:${port}`);
          this.tcp?.destroy();
          finish(false);
        }
      }, 10000);
    });
  }

  private processBuffer(): void {
    let consumed = 0;
    while (this.recvBuf.length - consumed >= 4) {
      const len = this.recvBuf.readUInt16LE(consumed);
      if (len < 4 || len > 4096) { consumed++; continue; }
      if (this.recvBuf.length - consumed < len) break;

      const pkt = Buffer.alloc(len);
      this.recvBuf.copy(pkt, 0, consumed, consumed + len);

      const proto = this.recvBuf.readUInt16LE(consumed + 2);
      if (proto === 3010 && hasKey() && len > 4) {
        const bodyLen = len - 4;
        const body = Buffer.alloc(bodyLen);
        pkt.copy(body, 0, 4, len);
        const dec = decryptFull(body);
        dec.copy(pkt, 4);
      }

      const rawHex = pkt.toString('hex');

      try {
        const mp = new MessagePacket(pkt);
        mp.rawHex = rawHex;
        this.emit('packet', mp);
      } catch (ex: any) {
        this.log(`[!] Error al parsear paquete: ${ex.message}`);
      }

      consumed += len;
    }

    if (consumed > 0) {
      this.recvBuf = this.recvBuf.subarray(consumed);
    }
  }

  send(mp: MessagePacket): void {
    if (!this.tcp || this.tcp.destroyed) throw new Error('No conectado');
    let data = mp.build();
    if (hasKey()) {
      const bodyLen = data.length - 4;
      const encryptLen = Math.floor(bodyLen / 8) * 8;
      for (let off = 0; off < encryptLen; off += 8) {
        const block = data.subarray(4 + off, 4 + off + 8);
        const enc = encryptBlock(block);
        enc.copy(data, 4 + off);
      }
    }
    try {
      this.tcp.write(data);
    } catch { return; }
    this.seqId++;
    const hex = data.subarray(0, Math.min(16, data.length)).toString('hex');
    this.log(`[SEND #${this.seqId}] ${mp} ${hex}`);
  }

  sendRaw(data: Buffer): void {
    if (!this.tcp || this.tcp.destroyed) return;
    try { this.tcp.write(data); } catch { }
  }

  private log(msg: string): void {
    this.emit('log', msg);
  }

  disconnect(): void {
    this.running = false;
    if (this.tcp) {
      this.tcp.destroy();
      this.tcp = undefined;
    }
  }
}
