export class EventEmitter {
  // Lazy init: subclasses that call util.inherits() may not invoke super(),
  // so we cannot rely on field initializers. Always access via _e() getter.
  private _events!: Map<string, ((...args: unknown[]) => void)[]>

  private _e(): Map<string, ((...args: unknown[]) => void)[]> {
    if (!this._events) this._events = new Map()
    return this._events
  }

  on(event: string, listener: (...args: unknown[]) => void): this {
    const e = this._e()
    const arr = e.get(event) ?? []
    arr.push(listener)
    e.set(event, arr)
    return this
  }

  once(event: string, listener: (...args: unknown[]) => void): this {
    const wrapper = (...args: unknown[]) => { this.off(event, wrapper); listener(...args) }
    return this.on(event, wrapper)
  }

  off(event: string, listener: (...args: unknown[]) => void): this {
    const arr = this._e().get(event)
    if (arr) this._e().set(event, arr.filter(l => l !== listener))
    return this
  }

  removeAllListeners(event?: string): this {
    if (event) this._e().delete(event)
    else this._e().clear()
    return this
  }

  emit(event: string, ...args: unknown[]): boolean {
    const arr = this._e().get(event)
    if (!arr?.length) return false
    for (const fn of [...arr]) fn(...args)
    return true
  }

  listeners(event: string): ((...args: unknown[]) => void)[] {
    return [...(this._e().get(event) ?? [])]
  }

  listenerCount(event: string): number {
    return this._e().get(event)?.length ?? 0
  }

  setMaxListeners(_n: number): this { return this }
  getMaxListeners(): number { return 10 }

  addListener = this.on
  removeListener = this.off
  prependListener(event: string, listener: (...args: unknown[]) => void): this {
    const e = this._e()
    const arr = e.get(event) ?? []
    arr.unshift(listener)
    e.set(event, arr)
    return this
  }
  prependOnceListener(event: string, listener: (...args: unknown[]) => void): this {
    const wrapper = (...args: unknown[]) => { this.off(event, wrapper); listener(...args) }
    return this.prependListener(event, wrapper)
  }
  eventNames(): string[] {
    return [...this._e().keys()]
  }
}

export default EventEmitter
