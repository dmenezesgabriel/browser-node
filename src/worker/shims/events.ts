class AsyncResource {
  asyncId(): number { return 1 }
  triggerAsyncId(): number { return 0 }
  emitDestroy(): this { return this }
  runInAsyncScope<R>(fn: (...args: unknown[]) => R, ...args: unknown[]): R { return fn(...args) }
}

export function EventEmitter(this: any) {
  // Initialization logic if any
}

EventEmitter.init = function() {}
EventEmitter.usingDomains = false

Object.assign(EventEmitter.prototype, {
  _e(): Map<string, ((...args: unknown[]) => void)[]> {
    if (!this._events) this._events = new Map()
    return this._events
  },

  on(event: string, listener: (...args: unknown[]) => void): any {
    const e = this._e()
    const arr = e.get(event) ?? []
    arr.push(listener)
    e.set(event, arr)
    return this
  },

  once(event: string, listener: (...args: unknown[]) => void): any {
    const self = this
    const wrapper = function(this: any, ...args: unknown[]) { self.off(event, wrapper); listener.apply(this, args) }
    return this.on(event, wrapper)
  },

  off(event: string, listener: (...args: unknown[]) => void): any {
    const e = this._e()
    const arr = e.get(event)
    if (arr) e.set(event, arr.filter(fn => fn !== listener))
    return this
  },

  removeListener(event: string, listener: (...args: unknown[]) => void): any { return this.off(event, listener) },
  removeAllListeners(event?: string): any {
    if (event) this._e().delete(event)
    else this._events = new Map()
    return this
  },

  emit(event: string, ...args: unknown[]): boolean {
    const arr = this._e().get(event)
    if (!arr) return false
    for (const fn of arr) fn.apply(this, args)
    return true
  },

  listenerCount(event: string): number { return this._e().get(event)?.length ?? 0 },
  listeners(event: string): Function[] { return this._e().get(event) ?? [] },
  rawListeners(event: string): Function[] { return this.listeners(event) },
  prependListener(event: string, listener: (...args: unknown[]) => void): any {
    const e = this._e()
    const arr = e.get(event) ?? []
    arr.unshift(listener)
    e.set(event, arr)
    return this
  },
  prependOnceListener(event: string, listener: (...args: unknown[]) => void): any {
    const self = this
    const wrapper = function(this: any, ...args: unknown[]) { self.off(event, wrapper); listener.apply(this, args) }
    return this.prependListener(event, wrapper)
  },
  eventNames(): string[] { return Array.from(this._e().keys()) },
  setMaxListeners(_n: number): any { return this },
  getMaxListeners(): number { return 10 },
  addListener(event: string, listener: (...args: unknown[]) => void): any { return this.on(event, listener) }
})

export class EventEmitterAsyncResource extends EventEmitter {
  private _asyncResource: AsyncResource

  constructor(options?: string | { name?: string }) {
    super()
    const name = typeof options === 'string' ? options : options?.name ?? 'event'
    this._asyncResource = new AsyncResource()
  }

  get asyncResource(): AsyncResource {
    return this._asyncResource
  }

  asyncId(): number {
    return this._asyncResource.asyncId()
  }

  triggerAsyncId(): number {
    return this._asyncResource.triggerAsyncId()
  }

  emitDestroy(): this {
    this._asyncResource.emitDestroy()
    return this
  }

  emit(event: string, ...args: unknown[]): boolean {
    return this._asyncResource.runInAsyncScope(() => super.emit(event, ...args))
  }
}

export default EventEmitter
