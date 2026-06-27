/**
 * Global test setup: mock browser globals that the Worker shims rely on.
 * Vitest runs in Node.js, so we need to polyfill the browser/worker context.
 */

// --- self (WorkerGlobalScope) ---
const postMessageLog: unknown[] = []
;(globalThis as unknown as Record<string, unknown>).self = globalThis
;(globalThis as unknown as Record<string, unknown>).postMessageLog = postMessageLog
globalThis.postMessage = (msg: unknown) => { postMessageLog.push(msg) }

// --- Web Crypto (Node 22 already has it on globalThis, but guard anyway) ---
if (!globalThis.crypto?.subtle) {
  const { webcrypto } = await import('crypto')
  ;(globalThis as unknown as Record<string, unknown>).crypto = webcrypto
}

// --- MessageChannel / MessagePort ---
if (!globalThis.MessageChannel) {
  class FakeMessagePort {
    onmessage: ((e: { data: unknown }) => void) | null = null
    private _other: FakeMessagePort | null = null
    _link(other: FakeMessagePort) { this._other = other }
    postMessage(data: unknown) {
      const other = this._other
      if (other?.onmessage) queueMicrotask(() => other.onmessage!({ data }))
    }
    start() {}
    close() {}
    addEventListener(ev: string, fn: (e: { data: unknown }) => void) {
      if (ev === 'message') this.onmessage = fn
    }
  }
  class FakeMessageChannel {
    port1 = new FakeMessagePort()
    port2 = new FakeMessagePort()
    constructor() { this.port1._link(this.port2); this.port2._link(this.port1) }
  }
  ;(globalThis as unknown as Record<string, unknown>).MessageChannel = FakeMessageChannel
  ;(globalThis as unknown as Record<string, unknown>).MessagePort = FakeMessagePort
}

// --- performance ---
if (!globalThis.performance) {
  ;(globalThis as unknown as Record<string, unknown>).performance = { now: () => Date.now() }
}
