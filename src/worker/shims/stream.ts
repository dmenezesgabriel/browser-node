import { EventEmitter } from './events'

export function Readable(this: any) {
  EventEmitter.call(this)
  this.readable = true
  this.destroyed = false
  this.readableEnded = false
  this.readableFlowing = null
  this.readableLength = 0
  this.readableHighWaterMark = 16384
  this.readableObjectMode = false
  this.readableEncoding = null
}
Object.setPrototypeOf(Readable.prototype, EventEmitter.prototype)
Object.setPrototypeOf(Readable, EventEmitter)
Object.assign(Readable.prototype, {
  pipe(dest: any) {
    this.on('data', (chunk: any) => dest.write(chunk))
    this.on('end', () => dest.end())
    return dest
  },
  destroy(_err?: Error) { this.destroyed = true; this.emit('close'); return this },
  resume() { this.readableFlowing = true; return this },
  pause() { this.readableFlowing = false; return this },
  read(_n?: number) { return null },
  setEncoding(enc: string) { this.readableEncoding = enc; return this },
  unpipe() { return this },
  unshift(_chunk: unknown) {},
  wrap(_stream: unknown) { return this }
})
Readable.from = function(iterable: Iterable<unknown>) {
  const r = new (Readable as any)()
  queueMicrotask(async () => {
    for (const chunk of iterable) r.emit('data', chunk)
    r.emit('end')
  })
  return r
}

export function Writable(this: any) {
  EventEmitter.call(this)
  this.writable = true
  this.destroyed = false
  this._chunks = []
}
Object.setPrototypeOf(Writable.prototype, EventEmitter.prototype)
Object.setPrototypeOf(Writable, EventEmitter)
Object.assign(Writable.prototype, {
  write(chunk: any, _enc?: string, cb?: () => void) {
    this._chunks.push(chunk)
    this.emit('data', chunk)
    cb?.()
    return true
  },
  end(chunk?: any, _enc?: string, cb?: () => void) {
    if (chunk !== undefined) this.write(chunk)
    this.emit('finish')
    this.emit('end')
    cb?.()
    return this
  },
  destroy() { this.destroyed = true; return this },
  setDefaultEncoding(_encoding: string) { return this },
  cork() {},
  uncork() {},
  getContents() {
    return this._chunks.map((c: any) => typeof c === 'string' ? c : new TextDecoder().decode(c)).join('')
  }
})

export function Transform(this: any) {
  Writable.call(this)
  this.readable = true
}
Object.setPrototypeOf(Transform.prototype, Writable.prototype)
Object.setPrototypeOf(Transform, Writable)

export function PassThrough(this: any) {
  Transform.call(this)
}
Object.setPrototypeOf(PassThrough.prototype, Transform.prototype)
Object.setPrototypeOf(PassThrough, Transform)

export function Stream(this: any) {
  EventEmitter.call(this)
}
Object.setPrototypeOf(Stream.prototype, EventEmitter.prototype)
Object.setPrototypeOf(Stream, EventEmitter)

Stream.prototype.pipe = function<T extends Writable>(this: any, dest: T): T {
  this.on('data', (chunk: any) => dest.write(chunk))
  this.on('end', () => dest.end())
  return dest
}

// Attach subclasses as static properties (matches Node.js stream module shape)
;(Stream as unknown as Record<string, unknown>).Readable = Readable
;(Stream as unknown as Record<string, unknown>).Writable = Writable
;(Stream as unknown as Record<string, unknown>).Transform = Transform
;(Stream as unknown as Record<string, unknown>).PassThrough = PassThrough
;(Stream as unknown as Record<string, unknown>).Stream = Stream

;(Stream as unknown as Record<string, unknown>).promises = { pipeline: () => Promise.resolve(), finished: () => Promise.resolve() }

export default Stream
