import * as crypto from 'crypto';

let desKey: Buffer | null = null;

export function setDesKey(key: Buffer): void {
  desKey = key;
}

export function hasKey(): boolean {
  return desKey !== null && desKey.length === 8;
}

function createCipher(): crypto.Cipher {
  const cipher = crypto.createCipheriv('des-ecb', desKey!, null);
  cipher.setAutoPadding(false);
  return cipher;
}

function createDecipher(): crypto.Decipher {
  const decipher = crypto.createDecipheriv('des-ecb', desKey!, null);
  decipher.setAutoPadding(false);
  return decipher;
}

export function encryptBlock(block: Buffer): Buffer {
  if (!hasKey() || block.length === 0) return block;
  const padded = block.length >= 8 ? block.subarray(0, 8) : Buffer.concat([block, Buffer.alloc(8 - block.length)]);
  const cipher = createCipher();
  return Buffer.concat([cipher.update(padded), cipher.final()]);
}

export function decryptBlock(block: Buffer): Buffer {
  if (!hasKey() || block.length < 8) return block;
  const decipher = createDecipher();
  return Buffer.concat([decipher.update(block.subarray(0, 8)), decipher.final()]);
}

export function encrypt(data: Buffer): Buffer {
  if (!hasKey() || data.length === 0) return data;
  const enc = encryptBlock(data);
  if (data.length <= 8) return enc;
  return Buffer.concat([enc.subarray(0, 8), data.subarray(8)]);
}

export function decrypt(data: Buffer): Buffer {
  if (!hasKey() || data.length < 8) return data;
  const dec = decryptBlock(data);
  if (data.length <= 8) return dec;
  return Buffer.concat([dec.subarray(0, 8), data.subarray(8)]);
}

export function decryptFull(data: Buffer): Buffer {
  if (!hasKey() || data.length < 8) return data;
  const decryptLen = Math.floor(data.length / 8) * 8;
  const result = Buffer.alloc(data.length);
  for (let off = 0; off < decryptLen; off += 8) {
    const block = data.subarray(off, off + 8);
    const dec = decryptBlock(block);
    dec.copy(result, off);
  }
  if (data.length > decryptLen) {
    data.copy(result, decryptLen, decryptLen);
  }
  return result;
}

export function encryptBody(data: Buffer): Buffer {
  if (!hasKey() || data.length < 4) return data;
  const bodyLen = data.length - 4;
  const encryptLen = Math.floor(bodyLen / 8) * 8;
  for (let off = 0; off < encryptLen; off += 8) {
    const block = data.subarray(4 + off, 4 + off + 8);
    const enc = encryptBlock(block);
    enc.copy(data, 4 + off);
  }
  return data;
}
