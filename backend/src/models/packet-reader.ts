export class PacketReader {
  private data: Buffer;
  private offset = 0;

  constructor(data: Buffer) {
    this.data = data;
  }

  get remaining(): number {
    return this.data.length - this.offset;
  }

  readUInt32(): number {
    const val = this.data.readUInt32LE(this.offset);
    this.offset += 4;
    return val;
  }

  readUInt16(): number {
    const val = this.data.readUInt16LE(this.offset);
    this.offset += 2;
    return val;
  }

  readByte(): number {
    return this.data[this.offset++];
  }

  readAsciiNullTerminated(): string {
    const start = this.offset;
    while (this.offset < this.data.length && this.data[this.offset] !== 0) this.offset++;
    const str = this.data.toString('ascii', start, this.offset);
    this.offset++;
    return str;
  }

  readUtf8NullTerminated(): string {
    const start = this.offset;
    while (this.offset < this.data.length && this.data[this.offset] !== 0) this.offset++;
    const str = this.data.toString('utf-8', start, this.offset);
    this.offset++;
    return str;
  }

  readBytes(count: number): Buffer {
    const slice = this.data.subarray(this.offset, this.offset + count);
    this.offset += count;
    return slice;
  }

  skip(count: number): void {
    this.offset += count;
  }

  peek(): number {
    return this.data[this.offset];
  }
}
