export function inherits(ctor: Function, superCtor: Function) {
  if (!superCtor || !superCtor.prototype) return
  Object.setPrototypeOf(ctor.prototype, superCtor.prototype)
  Object.defineProperty(ctor.prototype, 'constructor', {
    value: ctor, enumerable: false, writable: true, configurable: true,
  })
}

export function promisify(fn: Function) {
  return (...args: unknown[]) =>
    new Promise((resolve, reject) => {
      fn(...args, (err: Error | null, value: unknown) => {
        if (err) reject(err)
        else resolve(value)
      })
    })
}

export function callbackify(fn: (...args: unknown[]) => Promise<unknown>) {
  return (...args: unknown[]) => {
    const cb = args.pop() as (err: Error | null, value?: unknown) => void
    fn(...args).then((v) => cb(null, v), cb)
  }
}

export function deprecate<T extends Function>(fn: T, msg: string): T {
  let warned = false
  return ((...args: unknown[]) => {
    if (!warned) { warned = true; console.warn(`DeprecationWarning: ${msg}`) }
    return fn(...args)
  }) as unknown as T
}

export const types = {
  isPromise: (v: unknown): v is Promise<unknown> => v instanceof Promise,
  isRegExp: (v: unknown): v is RegExp => v instanceof RegExp,
  isDate: (v: unknown): v is Date => v instanceof Date,
  isError: (v: unknown): v is Error => v instanceof Error,
  isMap: (v: unknown): v is Map<unknown, unknown> => v instanceof Map,
  isSet: (v: unknown): v is Set<unknown> => v instanceof Set,
  isArrayBuffer: (v: unknown): v is ArrayBuffer => v instanceof ArrayBuffer,
  isUint8Array: (v: unknown): v is Uint8Array => v instanceof Uint8Array,
}

export function format(fmt: unknown, ...args: unknown[]): string {
  if (typeof fmt !== 'string') return [fmt, ...args].map(inspect).join(' ')
  let i = 0
  const result = fmt.replace(/%[sdifjoO%]/g, (m) => {
    if (m === '%%') return '%'
    const arg = args[i++]
    if (m === '%s') return String(arg)
    if (m === '%d' || m === '%i') return String(Number(arg))
    if (m === '%f') return String(parseFloat(String(arg)))
    if (m === '%j') return JSON.stringify(arg)
    if (m === '%o' || m === '%O') return inspect(arg)
    return m
  })
  return i < args.length ? result + ' ' + args.slice(i).map(inspect).join(' ') : result
}

const colors: Record<string, [number, number]> = {
  reset: [0, 0], bold: [1, 22], dim: [2, 22], italic: [3, 23], underline: [4, 24],
  inverse: [7, 27], hidden: [8, 28], strikethrough: [9, 29],
  black: [30, 39], red: [31, 39], green: [32, 39], yellow: [33, 39],
  blue: [34, 39], magenta: [35, 39], cyan: [36, 39], white: [37, 39],
  gray: [90, 39], grey: [90, 39],
  blackBright: [90, 39], redBright: [91, 39], greenBright: [92, 39],
  yellowBright: [93, 39], blueBright: [94, 39], magentaBright: [95, 39],
  cyanBright: [96, 39], whiteBright: [97, 39],
  bgBlack: [40, 49], bgRed: [41, 49], bgGreen: [42, 49], bgYellow: [43, 49],
  bgBlue: [44, 49], bgMagenta: [45, 49], bgCyan: [46, 49], bgWhite: [47, 49],
}

export function inspect(value: unknown, _opts?: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'function') return `[Function: ${value.name || 'anonymous'}]`
  if (Array.isArray(value)) return `[ ${value.map(v => inspect(v)).join(', ')} ]`
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

inspect.colors = colors;
inspect.custom = Symbol.for('nodejs.util.inspect.custom');

export function formatWithOptions(_opts: unknown, fmt: unknown, ...args: unknown[]): string {
  return format(fmt, ...args)
}

export function parseEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx < 1) continue
    const key = trimmed.slice(0, idx).trim()
    let val = trimmed.slice(idx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

export function stripVTControlCharacters(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[mGKHFJABCDEF]/g, '').replace(/\x1B\][^\x07]*\x07/g, '')
}

export function debuglog(section: string, cb?: (fn: (...args: unknown[]) => void) => void): (...args: unknown[]) => void {
  const noop = () => {}
  if (cb) cb(noop)
  return noop
}

export function isDeepStrictEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function styleText(format: string | string[], text: string): string {
  const formats = Array.isArray(format) ? format : [format]
  let out = String(text)
  for (const f of formats.reverse()) {
    const c = colors[f]
    if (c) out = `\x1b[${c[0]}m${out}\x1b[${c[1]}m`
  }
  return out
}

export const util = { inherits, promisify, callbackify, deprecate, types, format, inspect, formatWithOptions, parseEnv, stripVTControlCharacters, debuglog, isDeepStrictEqual, styleText, TextDecoder, TextEncoder }
