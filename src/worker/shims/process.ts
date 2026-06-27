type Listener = (...args: unknown[]) => void

const _listeners = new Map<string, Listener[]>()

function _getListeners(event: string): Listener[] {
  if (!_listeners.has(event)) _listeners.set(event, [])
  return _listeners.get(event)!
}

export const process = {
  env: {
    NODE_ENV: 'development',
    NODE_NO_WARNINGS: '1',
  } as Record<string, string | undefined>,
  argv: ['node', 'script.js'],
  execArgv: [],
  version: 'v26.0.0',
  versions: { node: '26.0.0', v8: '12.0.0' },
  platform: 'linux' as NodeJS.Platform,
  arch: 'x64',
  pid: 1,
  ppid: 0,
  exitCode: 0,
  cwd: () => '/app',
  chdir: (_dir: string) => {},
  nextTick: (fn: (...args: unknown[]) => void, ...args: unknown[]) => {
    queueMicrotask(() => fn(...args))
  },
  hrtime: Object.assign(
    (time?: [number, number]): [number, number] => {
      const ns = BigInt(Math.round(performance.now() * 1e6))
      if (time) {
        const diff = ns - BigInt(time[0]) * 1_000_000_000n - BigInt(time[1])
        return [Number(diff / 1_000_000_000n), Number(diff % 1_000_000_000n)]
      }
      return [Number(ns / 1_000_000_000n), Number(ns % 1_000_000_000n)]
    },
    { bigint: (): bigint => BigInt(Math.round(performance.now() * 1e6)) }
  ),
  exit: (code = 0) => {
    console.error('process.exit called!', code, new Error().stack)
    // Removed throw/freeze to allow logs to flush
  },
  stdout: {
    write: (s: string) => { self.postMessage({ type: 'stdout', text: s }); return true },
    isTTY: false,
    columns: 80,
    rows: 24,
  },
  stderr: {
    write: (s: string) => { self.postMessage({ type: 'stderr', text: s }); return true },
    isTTY: false,
    columns: 80,
    rows: 24,
  },
  on(event: string, listener: Listener) { _getListeners(event).push(listener); return process },
  addListener(event: string, listener: Listener) { return process.on(event, listener) },
  once(event: string, listener: Listener) {
    const wrapped = (...args: unknown[]) => { process.removeListener(event, wrapped); listener(...args) }
    return process.on(event, wrapped)
  },
  off(event: string, listener: Listener) { return process.removeListener(event, listener) },
  removeListener(event: string, listener: Listener) {
    const arr = _getListeners(event)
    const idx = arr.indexOf(listener)
    if (idx !== -1) arr.splice(idx, 1)
    return process
  },
  removeAllListeners(event?: string) {
    if (event) _listeners.delete(event)
    else _listeners.clear()
    return process
  },
  prependListener(event: string, listener: Listener) {
    const arr = _getListeners(event)
    arr.unshift(listener)
    return process
  },
  prependOnceListener(event: string, listener: Listener) {
    const wrapped = (...args: unknown[]) => { process.removeListener(event, wrapped); listener(...args) }
    return process.prependListener(event, wrapped)
  },
  emit(event: string, ...args: unknown[]) {
    const arr = _listeners.get(event)
    if (!arr || arr.length === 0) return false
    arr.slice().forEach(fn => fn(...args))
    return true
  },
  listeners(event: string) { return _getListeners(event).slice() },
  rawListeners(event: string) { return _getListeners(event).slice() },
  listenerCount(event: string) { return _getListeners(event).length },
  eventNames() { return [..._listeners.keys()] },
  getMaxListeners: () => 10,
  setMaxListeners: (_n: number) => process,
  stdin: {
    on(_: string, __: unknown) { return this },
    once(_: string, __: unknown) { return this },
    off(_: string, __: unknown) { return this },
    resume() { return this },
    pause() { return this },
    setEncoding() { return this },
    read() { return null },
    pipe(dest: unknown) { return dest },
    isTTY: false as boolean,
    readable: false as boolean,
    isRaw: false as boolean,
  },
}

;(globalThis as any).process = process;
