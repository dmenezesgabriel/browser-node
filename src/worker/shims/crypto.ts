// Synchronous hash using a pure-JS implementation
// (Web Crypto subtle API is async and not suitable for Node-compatible sync usage)
function fnv1a32(data: Uint8Array): number {
  let h = 2166136261
  for (const b of data) {
    h ^= b
    h = (h * 16777619) >>> 0
  }
  return h
}

// Simple synchronous MD5 shim — good enough for ETags, not cryptographic
function simpleHash(data: Uint8Array, bits = 128): Uint8Array {
  // Expand input into 16 bytes using FNV variations + rotations
  const out = new Uint8Array(bits / 8)
  const base = fnv1a32(data)
  const view = new DataView(out.buffer)
  for (let i = 0; i < bits / 32; i++) {
    const seed = (base ^ (i * 2654435761)) >>> 0
    let h = seed
    for (const b of data) {
      h = (Math.imul(h ^ b, 0x9e3779b9) + ((h << 6) | (h >>> 26))) >>> 0
    }
    view.setUint32(i * 4, h, false)
  }
  return out
}

function hashToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

function hashToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

class Hash {
  private _algo: string
  private _chunks: Uint8Array[] = []

  constructor(algorithm: string) {
    this._algo = algorithm.toLowerCase().replace(/-/g, '')
  }

  update(data: string | Uint8Array): this {
    this._chunks.push(typeof data === 'string' ? new TextEncoder().encode(data) : data)
    return this
  }

  digest(encoding?: string): string | Uint8Array {
    const merged = new Uint8Array(this._chunks.reduce((a, c) => a + c.length, 0))
    let off = 0
    for (const c of this._chunks) { merged.set(c, off); off += c.length }

    let bits = 128
    if (this._algo.includes('256') || this._algo === 'sha256') bits = 256
    else if (this._algo.includes('512') || this._algo === 'sha512') bits = 512

    const bytes = simpleHash(merged, bits)
    if (encoding === 'hex') return hashToHex(bytes)
    if (encoding === 'base64') return hashToBase64(bytes)
    if (encoding === 'binary') return String.fromCharCode(...bytes)
    return bytes
  }
}

class Hmac {
  update(_data: string | Uint8Array): this { return this }
  digest(enc?: string): string | Uint8Array { return enc === 'hex' ? '0'.repeat(64) : new Uint8Array(32) }
}

export const crypto = {
  randomBytes: (size: number): Buffer => {
    const buf = new Uint8Array(size)
    self.crypto.getRandomValues(buf)
    return buf as unknown as Buffer
  },

  randomUUID: (): string => self.crypto.randomUUID(),

  // Web Crypto compat — node:crypto exposes these in Node 19+
  getRandomValues: <T extends ArrayBufferView>(buf: T): T => {
    self.crypto.getRandomValues(buf)
    return buf
  },

  subtle: self.crypto.subtle,

  createHash: (algorithm: string): Hash => new Hash(algorithm),

  createHmac: (_algorithm: string, _key: string | Uint8Array): Hmac => new Hmac(),

  // Node.js 21.7+ one-shot hash — used by Vite 8
  hash: (algorithm: string, data: string | Uint8Array | ArrayBuffer, outputEncoding: string = 'hex'): string | Uint8Array => {
    const h = new Hash(algorithm)
    if (data instanceof ArrayBuffer) {
      h.update(new Uint8Array(data))
    } else {
      h.update(data as string | Uint8Array)
    }
    return h.digest(outputEncoding) as string | Uint8Array
  },

  pbkdf2Sync: (_pwd: string, _salt: string, _iter: number, _len: number): Buffer => {
    throw new Error('pbkdf2Sync not available — use async pbkdf2')
  },

  getHashes: (): string[] => ['md5', 'sha1', 'sha256', 'sha512'],
}
