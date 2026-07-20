import { EventEmitter } from './events'

export function Readable(this: any, opts?: { objectMode?: boolean }) {
  EventEmitter.call(this)
  this.readable = true
  this.destroyed = false
  this.readableEnded = false
  this.readableFlowing = null
  this.readableLength = 0
  this.readableHighWaterMark = 16384
  this.readableObjectMode = Boolean(opts?.objectMode)
  this.readableEncoding = null
  this._buffer = []
  this._pullEnded = false
  this._endEmitted = false
  this._pumpScheduled = false
  this._readInProgress = false
}
Object.setPrototypeOf(Readable.prototype, EventEmitter.prototype)
Object.setPrototypeOf(Readable, EventEmitter)

// Pull-model support (Node streams contract): subclasses implement _read() and
// call push(chunk)/push(null). readdirp — bundled inside vite for chokidar's
// directory scans — depends on this; without it scans yield nothing.
function _readablePump(r: any) {
  if (r._pumpScheduled) return
  r._pumpScheduled = true
  queueMicrotask(() => {
    r._pumpScheduled = false
    if (r.destroyed || r.readableFlowing === false) return
    while (r._buffer.length && r.readableFlowing) {
      r.emit('data', r._buffer.shift())
    }
    if (r._pullEnded) {
      if (!r._endEmitted && !r._buffer.length) {
        r._endEmitted = true
        r.readableEnded = true
        r.readable = false
        r.emit('end')
        r.emit('close')
      }
      return
    }
    if (r.readableFlowing && typeof r._read === 'function' && !r._readInProgress) {
      r._readInProgress = true
      try { r._read(r.readableHighWaterMark) } finally { r._readInProgress = false }
    }
  })
}

Object.assign(Readable.prototype, {
  push(chunk: unknown) {
    if (chunk === null) {
      this._pullEnded = true
    } else {
      this._buffer.push(chunk)
      this.emit('readable')
    }
    _readablePump(this)
    return !this._pullEnded && this._buffer.length < this.readableHighWaterMark
  },
  pipe(dest: any) {
    this.on('data', (chunk: any) => dest.write(chunk))
    this.on('end', () => dest.end())
    return dest
  },
  // Adding a 'data' listener switches to flowing mode unless explicitly paused.
  on(event: string, listener: (...args: unknown[]) => void) {
    EventEmitter.prototype.on.call(this, event, listener)
    if (event === 'data' && this.readableFlowing !== false) this.resume()
    return this
  },
  addListener(event: string, listener: (...args: unknown[]) => void) {
    return this.on(event, listener)
  },
  destroy(_err?: Error) { this.destroyed = true; this.emit('close'); return this },
  resume() { this.readableFlowing = true; _readablePump(this); return this },
  pause() { this.readableFlowing = false; return this },
  read(_n?: number) {
    if (this._buffer.length) return this._buffer.shift()
    if (!this._pullEnded && typeof this._read === 'function' && !this._readInProgress) {
      this._readInProgress = true
      try { this._read(this.readableHighWaterMark) } finally { this._readInProgress = false }
      if (this._buffer.length) return this._buffer.shift()
    }
    if (this._pullEnded) _readablePump(this)
    return null
  },
  setEncoding(enc: string) { this.readableEncoding = enc; return this },
  unpipe() { return this },
  unshift(chunk: unknown) { this._buffer.unshift(chunk) },
  wrap(_stream: unknown) { return this },
  [Symbol.asyncIterator]() {
    const r = this
    return {
      next(): Promise<IteratorResult<unknown>> {
        return new Promise((resolveNext, rejectNext) => {
          const value = r.read()
          if (value !== null) return resolveNext({ value, done: false })
          if (r._endEmitted || (r._pullEnded && !r._buffer.length)) {
            r.readableEnded = true
            return resolveNext({ value: undefined, done: true })
          }
          const onReadable = () => { cleanup(); resolveNext(this.next()) }
          const onEnd = () => { cleanup(); resolveNext({ value: undefined, done: true }) }
          const onError = (e: Error) => { cleanup(); rejectNext(e) }
          const cleanup = () => {
            r.off('readable', onReadable); r.off('end', onEnd); r.off('error', onError)
          }
          EventEmitter.prototype.on.call(r, 'readable', onReadable)
          EventEmitter.prototype.on.call(r, 'end', onEnd)
          EventEmitter.prototype.on.call(r, 'error', onError)
          // _read may be async; kick it so a pending pull is in flight
          if (!r._pullEnded && typeof r._read === 'function' && !r._readInProgress) {
            r._readInProgress = true
            try { r._read(r.readableHighWaterMark) } finally { r._readInProgress = false }
          }
          if (r._pullEnded && !r._buffer.length) { cleanup(); resolveNext({ value: undefined, done: true }) }
        })
      },
      [Symbol.asyncIterator]() { return this },
    }
  },
})
Readable.from = function(iterable: Iterable<unknown> | AsyncIterable<unknown>) {
  const r = new (Readable as any)()
  const iterator = (iterable as Iterable<unknown>)[Symbol.iterator]?.()
    ?? (iterable as AsyncIterable<unknown>)[Symbol.asyncIterator]?.()
  r._read = async () => {
    const { value, done } = await iterator.next()
    if (done) r.push(null)
    else r.push(value)
  }
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
