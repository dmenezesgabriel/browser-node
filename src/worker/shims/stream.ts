import { EventEmitter } from './events'

export class Readable extends EventEmitter {
  readable = true
  destroyed = false
  readableEnded = false
  readableFlowing: boolean | null = null
  readableLength = 0
  readableHighWaterMark = 16384
  readableObjectMode = false
  readableEncoding: string | null = null

  pipe<T extends Writable>(dest: T): T {
    this.on('data', (chunk) => dest.write(chunk as Buffer | string))
    this.on('end', () => dest.end())
    return dest
  }

  destroy(_err?: Error): this { this.destroyed = true; this.emit('close'); return this }
  resume(): this { this.readableFlowing = true; return this }
  pause(): this { this.readableFlowing = false; return this }
  read(_n?: number): unknown { return null }
  setEncoding(enc: string): this { this.readableEncoding = enc; return this }
  unpipe(): this { return this }
  unshift(_chunk: unknown): void {}
  wrap(_stream: unknown): this { return this }

  static from(iterable: Iterable<unknown>): Readable {
    const r = new Readable()
    queueMicrotask(async () => {
      for (const chunk of iterable) r.emit('data', chunk)
      r.emit('end')
    })
    return r
  }
}

export class Writable extends EventEmitter {
  writable = true
  destroyed = false
  private _chunks: (string | Uint8Array)[] = []

  write(chunk: string | Uint8Array, _enc?: string, cb?: () => void): boolean {
    this._chunks.push(chunk)
    this.emit('data', chunk)
    cb?.()
    return true
  }

  end(chunk?: string | Uint8Array, _enc?: string, cb?: () => void): this {
    if (chunk !== undefined) this.write(chunk)
    this.emit('finish')
    this.emit('end')
    cb?.()
    return this
  }

  destroy(): this { this.destroyed = true; return this }

  getContents(): string {
    return this._chunks.map(c => typeof c === 'string' ? c : new TextDecoder().decode(c)).join('')
  }
}

export class Transform extends Writable {
  readable = true
}

export class PassThrough extends Transform {}

// Stream class — Node.js's require('stream') returns this constructor,
// which also has Readable/Writable/etc. as properties.
export class Stream extends EventEmitter {
  pipe<T extends Writable>(dest: T): T {
    this.on('data', (chunk) => dest.write(chunk as Buffer | string))
    this.on('end', () => dest.end())
    return dest
  }
}

// Attach subclasses as static properties (matches Node.js stream module shape)
;(Stream as unknown as Record<string, unknown>).Readable = Readable
;(Stream as unknown as Record<string, unknown>).Writable = Writable
;(Stream as unknown as Record<string, unknown>).Transform = Transform
;(Stream as unknown as Record<string, unknown>).PassThrough = PassThrough
;(Stream as unknown as Record<string, unknown>).Stream = Stream

;(Stream as unknown as Record<string, unknown>).promises = { pipeline: () => Promise.resolve(), finished: () => Promise.resolve() }

export default Stream
