export class MessagePacket {
  private buf: Buffer;
  protocolId!: number;
  rawHex?: string;

  constructor(protoOrRaw: number | Buffer, capacity = 4096) {
    if (typeof protoOrRaw === 'number') {
      this.protocolId = protoOrRaw;
      this.buf = Buffer.alloc(capacity);
      this.buf.writeUInt16LE(4, 0);
      this.buf.writeUInt16LE(protoOrRaw, 2);
    } else {
      this.buf = Buffer.from(protoOrRaw);
      this.readHeader();
    }
  }

  private readHeader(): void {
    const len = this.buf.readUInt16LE(0);
    this.protocolId = this.buf.readUInt16LE(2);
  }

  get length(): number {
    if (this.protocolId === 0) return 0;
    return this.buf.length;
  }

  get data(): Buffer {
    return this.buf;
  }

  private ensure(size: number): void {
    if (this.buf.length < size) {
      const newBuf = Buffer.alloc(Math.max(this.buf.length * 2, size));
      this.buf.copy(newBuf);
      this.buf = newBuf;
    }
  }

  writeByte(v: number): void {
    const pos = this.buf[0] === 0 && this.buf[1] === 0 ? 4 : this.buf.readUInt16LE(0);
    this.ensure(pos + 1);
    this.buf.writeUInt16LE(pos + 1, 0);
    this.buf[pos] = v & 0xFF;
  }

  writeUInt16(v: number): void {
    const pos = this.buf.readUInt16LE(0);
    this.ensure(pos + 2);
    this.buf.writeUInt16LE(pos + 2, 0);
    this.buf.writeUInt16LE(v, pos);
  }

  writeInt32(v: number): void {
    const pos = this.buf.readUInt16LE(0);
    this.ensure(pos + 4);
    this.buf.writeUInt16LE(pos + 4, 0);
    this.buf.writeInt32LE(v, pos);
  }

  writeUInt32(v: number): void {
    const pos = this.buf.readUInt16LE(0);
    this.ensure(pos + 4);
    this.buf.writeUInt16LE(pos + 4, 0);
    this.buf.writeUInt32LE(v, pos);
  }

  writeBytes(data: Buffer): void {
    const pos = this.buf.readUInt16LE(0);
    this.ensure(pos + data.length);
    this.buf.writeUInt16LE(pos + data.length, 0);
    data.copy(this.buf, pos);
  }

  build(): Buffer {
    const len = this.buf.readUInt16LE(0);
    const result = Buffer.alloc(len);
    this.buf.copy(result, 0, 0, len);
    return result;
  }

  readByte(): number {
    return this.buf[4 + this.buf.readUInt16LE(0) - this.buf.length] || 0;
  }

  get payloadHex(): string {
    return this.buf.length > 4 ? this.buf.subarray(4).toString('hex') : '';
  }

  toString(): string {
    const raw = this.rawHex || '?';
    const header = raw.length >= 8 ? raw.substring(0, 8) : raw;
    const body = raw.length > 8 ? raw.substring(8) : '';
    return `Proto=${this.protocolId} Len=${this.length} header=${header} body=${body}`;
  }
}
