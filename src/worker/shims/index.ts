
import { Buffer } from 'buffer'

// Patch Buffer to support base64url encoding (Node.js 14+ feature, not in the 'buffer' npm pkg)
;(function patchBase64url() {
  const _proto = Buffer.prototype as unknown as Record<string, unknown>
  const _origToString = _proto.toString as (enc?: string) => string
  _proto.toString = function(encoding?: string, ...rest: unknown[]) {
    if (encoding === 'base64url') {
      const b64 = (_origToString.call(this as unknown as Buffer, 'base64') as string)
      return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    }
    return (_origToString as (enc?: string, ...r: unknown[]) => string).call(this as unknown as Buffer, encoding, ...rest)
  }
  const _origFrom = Buffer.from as unknown as (...args: unknown[]) => Buffer
  ;(Buffer as unknown as Record<string, unknown>).from = function(data: unknown, encoding?: string, ...rest: unknown[]) {
    if (typeof data === 'string' && encoding === 'base64url') {
      const b64 = (data as string).replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((data as string).length % 4)
      return _origFrom.call(Buffer, b64, 'base64', ...rest)
    }
    return _origFrom.call(Buffer, data, encoding, ...rest)
  } as typeof Buffer.from
})()

import { process } from './process'
import { path } from './path'
import { EventEmitter, EventEmitterAsyncResource } from './events'
import { Readable, Writable, Transform, PassThrough, Stream } from './stream'
import defaultStream from './stream'
import { util } from './util'
import { os } from './os'
import ws from './ws'
import { crypto } from './crypto'
import { http, https } from './http'
import { fs, fsPromises } from './fs'
import { WASI as WasiPolyfill } from '@tybys/wasm-util'
// WASI polyfill: @tybys/wasm-util provides wasi_snapshot_preview1 for NAPI-RS
// WASM modules (e.g. oxc-parser). The CJS entry passes preopens, which requires
// an fs implementation; inject our VFS-backed fs.
class WasiWithFs extends WasiPolyfill {
  constructor(opts?: Record<string, unknown>) {
    // Preopens require fs.openSync on directories; memfs doesn't fully support
    // that. Strip preopens — NAPI-RS parsers like oxc-parser don't need
    // filesystem access from WASI.
    const { preopens, ...rest } = opts ?? {}
    super(rest)
  }
}
import esbuildShim from './esbuild'
import chokidarShim from './chokidar'
import connectDefault, { createServer as connectCreateServer } from './connect'
import sirvDefault from './sirv'
export { process } from './process'
export { path } from './path'
export { EventEmitter } from './events'
export { Readable, Writable, Transform, PassThrough, Stream } from './stream'
export { util } from './util'
export { os } from './os'
export { crypto } from './crypto'
export { http, https } from './http'
export { getServer } from './http'
export { fs, fsPromises } from './fs'

function _fileURLToPath(url: string | URL): string {
  const u = typeof url === 'string' ? new URL(url) : url
  if (u.protocol !== 'file:') throw new TypeError(`Not a file URL: ${u.href}`)
  return decodeURIComponent(u.pathname)
}
function _pathToFileURL(p: string): URL {
  return new URL('file://' + (p.startsWith('/') ? p : '/' + p))
}
const _url = {
  URL,
  URLSearchParams,
  parse: (u: string) => {
    try {
      const parsed = new URL(u);
      return {
        href: parsed.href,
        protocol: parsed.protocol,
        host: parsed.host,
        hostname: parsed.hostname,
        port: parsed.port,
        pathname: parsed.pathname,
        search: parsed.search,
        hash: parsed.hash,
        auth: parsed.username ? parsed.username + (parsed.password ? ':' + parsed.password : '') : null,
        path: parsed.pathname + parsed.search,
        query: parsed.search ? parsed.search.slice(1) : null,
        slashes: u.startsWith(parsed.protocol + '//')
      };
    } catch (e) {
      const hashIdx = u.indexOf('#');
      let hash = null;
      let withoutHash = u;
      if (hashIdx !== -1) {
        hash = u.slice(hashIdx);
        withoutHash = u.slice(0, hashIdx);
      }
      const searchIdx = withoutHash.indexOf('?');
      let search = null;
      let pathname = withoutHash;
      if (searchIdx !== -1) {
        search = withoutHash.slice(searchIdx);
        pathname = withoutHash.slice(0, searchIdx);
      }
      return {
        protocol: null,
        slashes: null,
        auth: null,
        host: null,
        port: null,
        hostname: null,
        hash: hash || null,
        search: search || null,
        query: search ? search.slice(1) : null,
        pathname,
        path: withoutHash,
        href: u
      } as any;
    }
  },
  format: (u: URL | string) => typeof u === 'string' ? u : u.href,
  fileURLToPath: _fileURLToPath,
  pathToFileURL: _pathToFileURL,
}
// The buffer npm package doesn't export MAX_STRING_LENGTH or constants;
// thread-stream accesses buffer.constants.MAX_STRING_LENGTH, pino uses Buffer.MAX_STRING_LENGTH
;(Buffer as Record<string, unknown>).MAX_STRING_LENGTH = 4294967296
const _buffer = { Buffer, default: Buffer, constants: { MAX_STRING_LENGTH: 4294967296, MAX_LENGTH: 4294967296 } }
// Node.js: require('events') returns the EventEmitter constructor directly
// (it's callable as `new (require('events'))()` and has `.EventEmitter` property)
const _events = Object.assign(EventEmitter, { EventEmitter, EventEmitterAsyncResource, default: EventEmitter })
const _querystring = {
  stringify: (obj: Record<string, string>) => new URLSearchParams(obj).toString(),
  parse: (s: string) => Object.fromEntries(new URLSearchParams(s)),
}
// assert must be callable as a function (assert(val, msg)) with methods attached
function _assertFn(val: unknown, msg?: string): void { if (!val) throw new Error(msg ?? 'Assertion failed') }
_assertFn.strictEqual = (a: unknown, b: unknown, msg?: string) => { if (a !== b) throw new Error(msg ?? `${String(a)} !== ${String(b)}`) }
_assertFn.notStrictEqual = (a: unknown, b: unknown, msg?: string) => { if (a === b) throw new Error(msg ?? `${String(a)} === ${String(b)}`) }
_assertFn.deepStrictEqual = (a: unknown, b: unknown, msg?: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(msg ?? 'Not deep equal') }
_assertFn.notDeepStrictEqual = (a: unknown, b: unknown, msg?: string) => { if (JSON.stringify(a) === JSON.stringify(b)) throw new Error(msg ?? 'Deep equal') }
_assertFn.equal = (a: unknown, b: unknown, msg?: string) => { if (a != b) throw new Error(msg ?? `${String(a)} != ${String(b)}`) } // eslint-disable-line eqeqeq
_assertFn.notEqual = (a: unknown, b: unknown, msg?: string) => { if (a == b) throw new Error(msg ?? `${String(a)} == ${String(b)}`) } // eslint-disable-line eqeqeq
_assertFn.ok = (val: unknown, msg?: string) => { if (!val) throw new Error(msg ?? 'Assertion failed') }
_assertFn.fail = (msg?: string) => { throw new Error(msg ?? 'Assert.fail()') }
_assertFn.throws = (fn: () => void, _err?: unknown, msg?: string) => { try { fn(); throw new Error(msg ?? 'Expected to throw') } catch (e) { if ((e as Error).message === (msg ?? 'Expected to throw')) throw e } }
_assertFn.doesNotThrow = (fn: () => void) => { try { fn() } catch (e) { throw new Error(`Got unwanted exception: ${e}`) } }
_assertFn.rejects = async (fn: () => Promise<unknown>) => { try { await fn(); throw new Error('Expected rejection') } catch (e) { if ((e as Error).message === 'Expected rejection') throw e } }
_assertFn.doesNotReject = async (fn: () => Promise<unknown>) => { await fn() }
_assertFn.ifError = (err: unknown) => { if (err) throw err }
;(_assertFn as unknown as { default: unknown }).default = _assertFn
const _assert = _assertFn as typeof _assertFn & { default: unknown }
// Delegate to globalThis so the Node-compat timer wrappers (with .unref/.ref) are used.
const _timers = {
  get setTimeout() { return (globalThis as unknown as Record<string, unknown>).setTimeout as typeof setTimeout },
  get clearTimeout() { return (globalThis as unknown as Record<string, unknown>).clearTimeout as typeof clearTimeout },
  get setInterval() { return (globalThis as unknown as Record<string, unknown>).setInterval as typeof setInterval },
  get clearInterval() { return (globalThis as unknown as Record<string, unknown>).clearInterval as typeof clearInterval },
  setImmediate: (fn: () => void) => globalThis.setTimeout(fn, 0),
  clearImmediate: (id: unknown) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
  default: undefined as unknown,
}
_timers.default = _timers
const _childProcess = {
  exec: (_cmd: string, cb?: (err: Error | null, stdout?: string, stderr?: string) => void) => {
    cb?.(null, '', '')
    return { on: () => {}, kill: () => {}, stdin: null, stdout: null, stderr: null }
  },
  execFile: (_file: string, _args?: unknown, _opts?: unknown, cb?: (err: Error | null, stdout?: string, stderr?: string) => void) => {
    const callback = typeof _opts === 'function' ? _opts as typeof cb : typeof _args === 'function' ? _args as typeof cb : cb
    callback?.(null, '', '')
    return { on: () => {}, kill: () => {}, stdin: null, stdout: null, stderr: null }
  },
  execSync: (_cmd: string) => Buffer.from(''),
  spawn: (_cmd: string, _args?: string[], _opts?: unknown) => {
    let handlers: Record<string, Function[]> = {}
    const createStream = () => {
      let streamHandlers: Record<string, Function[]> = {}
      return {
        on: (event: string, fn: Function) => {
          if (!streamHandlers[event]) streamHandlers[event] = []
          streamHandlers[event].push(fn)
        },
        emit: (event: string, ...args: any[]) => {
          if (streamHandlers[event]) streamHandlers[event].forEach(fn => fn(...args))
        },
        pipe: () => {},
        unpipe: () => {},
        destroy: () => {}
      }
    }
    const stdout = createStream()
    const stderr = createStream()
    const ee = { 
      on: (event: string, fn: Function) => {
        if (!handlers[event]) handlers[event] = []
        handlers[event].push(fn)
        return ee 
      }, 
      emit: (event: string, ...args: any[]) => {
        if (handlers[event]) handlers[event].forEach(fn => fn(...args))
        return false 
      }, 
      stdout,
      stderr,
      stdin: { write: () => {}, end: () => {} }, 
      kill: () => {} 
    }
    setTimeout(() => {
      stdout.emit('end')
      stderr.emit('end')
      ee.emit('close', 0)
    }, 10)
    return ee
  },
  spawnSync: (_cmd: string) => ({ status: 0, stdout: '', stderr: '', error: null }),
  fork: () => { throw new Error('child_process.fork not supported in browser') },
}
const _net = {
  createServer: () => ({ listen: () => {}, close: () => {}, on: () => {} }),
  connect: () => { throw new Error('net.connect not supported in browser') },
  Socket: class Socket { on() { return this } write() {} end() {} destroy() {} },
  isIP: () => 0,
  isIPv4: () => false,
  isIPv6: () => false,
}
const _tls = {
  connect: () => { throw new Error('tls.connect not supported in browser') },
  createServer: () => { throw new Error('tls.createServer not supported in browser') },
  TLSSocket: class TLSSocket { on() { return this } write() {} end() {} destroy() {} },
  checkServerIdentity: () => undefined,
  rootCertificates: [] as string[],
  getCiphers: () => [] as string[],
  DEFAULT_MIN_VERSION: 'TLSv1.2',
  DEFAULT_MAX_VERSION: 'TLSv1.3',
  DEFAULT_ECDH_CURVE: 'auto',
}
const _tty = {
  isatty: () => false,
  ReadStream: class {},
  WriteStream: class { columns = 80; rows = 24; isTTY = false },
}
const _readline = {
  createInterface: () => ({ on: () => {}, close: () => {}, question: (_q: string, cb: (a: string) => void) => cb('') }),
}
const _zlib = {
  gzip: (_buf: Uint8Array, cb: (e: Error | null, r?: Uint8Array) => void) => cb(null, _buf),
  gunzip: (_buf: Uint8Array, cb: (e: Error | null, r?: Uint8Array) => void) => cb(null, _buf),
  createGzip: () => ({ on: () => {}, pipe: (d: unknown) => d }),
  createGunzip: () => ({ on: () => {}, pipe: (d: unknown) => d }),
}
const _dns = {
  lookup: (_host: string, optsOrCb: unknown, cb?: (err: null, addr: string, family: number) => void) => {
    const callback = typeof optsOrCb === 'function' ? optsOrCb as typeof cb : cb
    queueMicrotask(() => callback?.(null, '127.0.0.1', 4))
  },
  resolve: (_host: string, _typeOrCb: unknown, cb?: (err: null, addrs: string[]) => void) => {
    const callback = typeof _typeOrCb === 'function' ? _typeOrCb as typeof cb : cb
    queueMicrotask(() => callback?.(null, ['127.0.0.1']))
  },
  resolve4: (_host: string, cb: (err: null, addrs: string[]) => void) => queueMicrotask(() => cb(null, ['127.0.0.1'])),
  resolve6: (_host: string, cb: (err: null, addrs: string[]) => void) => queueMicrotask(() => cb(null, [])),
  reverse: (_ip: string, cb: (err: null, hostnames: string[]) => void) => queueMicrotask(() => cb(null, ['localhost'])),
  promises: {
    lookup: (_host: string, _opts?: unknown) => Promise.resolve({ address: '127.0.0.1', family: 4 }),
    resolve: (_host: string, _type?: string) => Promise.resolve(['127.0.0.1']),
    resolve4: (_host: string) => Promise.resolve(['127.0.0.1']),
    resolve6: (_host: string) => Promise.resolve([]),
  },
}
const _workerThreads = {
  isMainThread: true,
  Worker: class {
    on: () => this
    off: () => this
    once: () => this
    postMessage: () => {}
    terminate: () => {}
    unref: () => this
    ref: () => this
    addEventListener: () => {}
    removeEventListener: () => {}
  },
  MessageChannel: class {
    port1: { postMessage: () => {}, on: () => {}, off: () => {}, close: () => {}, addEventListener: () => {}, removeEventListener: () => {}, start: () => {} }
    port2: { postMessage: () => {}, on: () => {}, off: () => {}, close: () => {}, addEventListener: () => {}, removeEventListener: () => {}, start: () => {} }
    constructor() {
      this.port1 = { postMessage: () => {}, on: () => {}, off: () => {}, close: () => {}, addEventListener: () => {}, removeEventListener: () => {}, start: () => {} }
      this.port2 = { postMessage: () => {}, on: () => {}, off: () => {}, close: () => {}, addEventListener: () => {}, removeEventListener: () => {}, start: () => {} }
    }
  },
  receiveMessageOnPort: () => undefined,
  parentPort: null,
  workerData: null,
  threadId: 0,
  SHARE_ENV: Symbol('SHARE_ENV'),
}

// v8 stub — only startupSnapshot.isBuildingSnapshot() is called in Vite
const _v8 = {
  startupSnapshot: { isBuildingSnapshot: () => false, addSerializeCallback: () => {}, addDeserializeCallback: () => {}, setDeserializeMainFunction: () => {} },
  getHeapStatistics: () => ({ total_heap_size: 0, used_heap_size: 0 }),
  writeHeapSnapshot: () => '',
  default: undefined as unknown,
}
_v8.default = _v8

// rolldown subpath stubs — build-only APIs; dev server doesn't invoke them at startup
const _notSupported = (name: string) => () => { throw new Error(`${name} is not supported in browser; use vite dev server only`) }
const _asyncNotSupported = (name: string) => () => Promise.reject(new Error(`${name} is not supported in browser`))
import * as acorn from 'acorn'

const _rolldownParseAst = {
  parseAst: (code: string) => acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' }),
  parseAstAsync: async (code: string) => acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' }),
  default: undefined as unknown,
}
_rolldownParseAst.default = _rolldownParseAst

class _TsconfigCache { constructor() {} }
class _Visitor { constructor() {} }

/**
 * Minimal synchronous JSX → React.createElement transform.
 * Used as a fallback when TypeScript is not installed in the project.
 * Handles the common patterns produced by create-vite react template.
 * The goal: make vite:import-analysis able to parse the file as plain JS.
 */
function jsxToReactCreateElement(code: string): string {
  // We use a simple character-level state machine to convert JSX.
  // Strategy: scan for '<' that starts a JSX element (not in a string/comment),
  // then convert open tags, self-closing tags, and close tags.
  // JSX fragments <> </> → React.createElement(React.Fragment, null, ...)
  // JSX expressions {expr} → expr (passed through)
  // Text content → string literals
  //
  // For vite:import-analysis we just need parseable JS, not perfect runtime semantics.
  // We convert JSX to tagged template/function calls that ARE valid JS.

  // Simple but effective approach: use nested regex replacements.
  // Order matters: handle self-closing before open tags.

  let result = code

  // 1. JSX comments {/* ... */} — strip them
  result = result.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')

  // 2. JSX fragments <> </> — convert to array notation
  // We replace fragments with a unique sentinel and process later
  // For simplicity, just strip fragment wrappers (the children become adjacent exprs)
  result = result.replace(/<>([\s\S]*?)<\/>/gs, '(_fragment($1))')

  // 3. Self-closing tags with props: <Component key="val" k2={v2} />
  // Match: < (ComponentName or tag) (optional attrs) />
  result = result.replace(
    /<([A-Za-z][A-Za-z0-9.]*(?:\.[A-Za-z][A-Za-z0-9]*)*)([^>]*?)\/>/gs,
    (_: string, tag: string, attrs: string) => {
      const name = /^[A-Z]/.test(tag[0]) ? tag : `"${tag}"`
      const props = parseJsxAttrs(attrs)
      return `React.createElement(${name}, ${props})`
    }
  )

  // 4. Open/close tag pairs with children
  // We do multiple passes to handle nesting (innermost first)
  // Match: <Tag attrs>...children...</Tag>
  for (let i = 0; i < 10; i++) {
    const before = result
    result = result.replace(
      /<([A-Za-z][A-Za-z0-9.]*)([^>]*)>([\s\S]*?)<\/\1>/g,
      (_: string, tag: string, attrs: string, children: string) => {
        const name = /^[A-Z]/.test(tag[0]) ? tag : `"${tag}"`
        const props = parseJsxAttrs(attrs)
        const childStr = processJsxChildren(children)
        return childStr
          ? `React.createElement(${name}, ${props}, ${childStr})`
          : `React.createElement(${name}, ${props})`
      }
    )
    if (result === before) break
  }

  // 5. Clean up remaining JSX closing tags (e.g. from fragments)
  result = result.replace(/<\/[A-Za-z][A-Za-z0-9.]*>/g, '')

  // 6. Remove remaining self-closing tags we might have missed
  result = result.replace(/<[A-Za-z][A-Za-z0-9.]*(?:\s+[^>]*)?\/>/g, 'null')

  return result
}

function parseJsxAttrs(attrsStr: string): string {
  const s = attrsStr.trim()
  if (!s) return 'null'
  const spreadMatch = s.match(/^\{\.\.\.(.*?)\}$/)
  if (spreadMatch) return `Object.assign({}, ${spreadMatch[1]})`
  const pairs: string[] = []
  
  let pos = 0
  while (pos < s.length) {
    while (pos < s.length && /\s/.test(s[pos])) pos++;
    if (pos >= s.length) break;

    if (s.startsWith('{...', pos)) {
      let depth = 0, start = pos
      while (pos < s.length) {
        if (s[pos] === '{') depth++
        else if (s[pos] === '}') { depth--; if (depth === 0) { pos++; break } }
        pos++
      }
      pairs.push(`...${s.slice(start + 4, pos - 1)}`)
      continue
    }

    const nameMatch = s.slice(pos).match(/^[A-Za-z_][A-Za-z0-9_-]*/)
    if (!nameMatch) { pos++; continue }
    const name = nameMatch[0]
    pos += name.length

    while (pos < s.length && /\s/.test(s[pos])) pos++;

    if (s[pos] === '=') {
      pos++
      while (pos < s.length && /\s/.test(s[pos])) pos++;
      let val = ''
      if (s[pos] === '"' || s[pos] === "'") {
        const quote = s[pos]
        const start = pos
        pos++
        while (pos < s.length && s[pos] !== quote) pos++
        val = `"${s.slice(start + 1, pos)}"`
        pos++
      } else if (s[pos] === '{') {
        let depth = 0
        const start = pos
        while (pos < s.length) {
          if (s[pos] === '{') depth++
          else if (s[pos] === '}') { depth--; if (depth === 0) { pos++; break } }
          pos++
        }
        val = s.slice(start + 1, pos - 1)
      } else {
        const start = pos
        while (pos < s.length && !/\s/.test(s[pos]) && s[pos] !== '>') pos++
        val = s.slice(start, pos)
      }
      pairs.push(`${name}: ${val}`)
    } else {
      pairs.push(`${name}: true`)
    }
  }
  return pairs.length ? `{ ${pairs.join(', ')} }` : 'null'
}

function processJsxChildren(childrenStr: string): string {
  const s = childrenStr.trim()
  if (!s) return ''
  // Split children: {expr} blocks and text content
  const parts: string[] = []
  let pos = 0
  while (pos < s.length) {
    if (s[pos] === '{') {
      // JSX expression block
      let depth = 0, end = pos
      while (end < s.length) {
        if (s[end] === '{') depth++
        else if (s[end] === '}') { depth--; if (depth === 0) { end++; break } }
        end++
      }
      parts.push(s.slice(pos + 1, end - 1).trim())
      pos = end
    } else if (s[pos] === '<') {
      // Nested element (already transformed or self-closing)
      // Look for the end of the tag
      let end = s.indexOf('>', pos) + 1
      if (end === 0) end = s.length
      parts.push(s.slice(pos, end))
      pos = end
    } else {
      // Text content
      const offset = s.slice(pos).search(/[{<]/)
      const next = offset === -1 ? -1 : pos + offset
      const text = (next === -1 ? s.slice(pos) : s.slice(pos, next)).trim()
      if (text) parts.push(`"${text.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`)
      pos = next === -1 ? s.length : next
    }
  }
  return parts.filter(p => p.trim() && p !== '""').join(', ')
}

// Synchronous TypeScript/JSX→JS transform used by Vite 8's transformWithOxc.
// Vite 8 calls: rolldown/utils.transformSync(filename, code, { lang, sourcemap, ...options })
// We must compile JSX→JS here, because Vite's vite:import-analysis plugin runs AFTER this
// transform and cannot handle raw JSX syntax.
import { transform as sucraseTransform } from 'sucrase'

function _tsTransformSync(code: string, filename?: string, lang?: string): string {
  // Try to use TypeScript from the project's node_modules if available
  try {
    const fromDir = filename ? filename.split('/').slice(0, -1).join('/') || '/' : '/'
    const ts = _requireSync('typescript', fromDir) as {
      transpileModule: (code: string, opts: Record<string, unknown>) => { outputText: string }
      _isBuiltinShim?: boolean
    }
    if (ts?.transpileModule && !ts._isBuiltinShim) {
      return ts.transpileModule(code, {
        compilerOptions: {
          target: 99, // ESNext
          module: 99, // ESNext
          jsx: 1, // Preserve (let Vite handle it if possible, or React)
          // Actually, we want to compile JSX away so Vite's import-analysis can parse it
        }
      }).outputText
    }
  } catch {}

  const isJsxLike = lang === 'jsx' || lang === 'tsx' || filename?.endsWith('.jsx') || filename?.endsWith('.tsx') || code.includes('</') || code.includes('/>')
  const isTsLike = lang === 'ts' || lang === 'tsx' || filename?.endsWith('.ts') || filename?.endsWith('.tsx')
  
  const transforms: string[] = []
  if (isTsLike) transforms.push('typescript')
  if (isJsxLike) transforms.push('jsx')
  
  if (transforms.length === 0) return code

  try {
    const result = sucraseTransform(code, {
      transforms: transforms as any,
      filePath: filename || 'file.jsx',
      production: false
    })
    return result.code
  } catch (e) {
    console.error(`[sucrase] Failed to transform ${filename}:`, e)
    return code
  }
}


const _rolldownUtils = {
  TsconfigCache: _TsconfigCache,
  Visitor: _Visitor,
  minify: _asyncNotSupported('rolldown/utils.minify'),
  minifySync: _notSupported('rolldown/utils.minifySync'),
  parse: _notSupported('rolldown/utils.parse'),
  parseSync: _notSupported('rolldown/utils.parseSync'),
  // OXC/rolldown API: transformSync(filename, sourceCode, options?) — called by Vite's transformWithOxc()
  // Must return compiled JS (no raw JSX) so that vite:import-analysis can parse the result.
  transformSync: (filename: string, sourceCode: string, options?: { lang?: string; [k: string]: unknown }) => {
    const out = _tsTransformSync(sourceCode, filename, options?.lang)
    return { code: out, map: '', errors: [], warnings: [], tsconfigFilePaths: [] }
  },
  transform: _asyncNotSupported('rolldown/utils.transform'),
  resolveTsconfig: _notSupported('rolldown/utils.resolveTsconfig'),
  default: undefined as unknown,
}
_rolldownUtils.default = _rolldownUtils

const _pluginStub = () => ({ name: 'stub-plugin', transform: undefined, resolveId: undefined })
const _rolldownPlugins = {
  esmExternalRequirePlugin: _pluginStub,
  default: undefined as unknown,
}
_rolldownPlugins.default = _rolldownPlugins

const _rolldownFilter = {
  exactRegex: (s: string) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
  prefixRegex: (s: string) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  makeIdFiltersToMatchWithQuery: (filter?: unknown) => (filter == null ? [] : Array.isArray(filter) ? filter : [filter]),
  withFilter: (_plugin: unknown, _filter: unknown) => _plugin,
  default: undefined as unknown,
}
_rolldownFilter.default = _rolldownFilter

const _experimentalPluginStub = (name: string) => () => ({ name, transform: undefined })

const _viteResolvePlugin = (options: any) => ({
  name: 'vite-resolve',
  async resolveId(id: string, importer: string | undefined) {
    if (id.startsWith('\0') || id.startsWith('virtual:')) return null;
    
    let resolvedPath = id;
    if (id.startsWith('/@fs/')) {
      resolvedPath = id.slice(4);
    } else if (id.startsWith('/')) {
      const root = options?.resolveOptions?.root || process.cwd();
      resolvedPath = path.resolve(root, id.slice(1));
    } else if (id.startsWith('.')) {
      if (!importer) return null;
      resolvedPath = path.resolve(path.dirname(importer), id);
    } else {
      try {
        const req = _moduleShim.createRequire(importer || process.cwd() + '/');
        return { id: req.resolve(id) };
      } catch {
        return null;
      }
    }

    try {
      if (fs.existsSync(resolvedPath)) {
        const stat = fs.statSync(resolvedPath);
        if (stat.isFile()) return { id: resolvedPath };
        if (stat.isDirectory()) {
          const exts = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
          for (const ext of exts) {
            if (fs.existsSync(resolvedPath + ext)) {
              return { id: resolvedPath + ext };
            }
          }
        }
      }
      
      const exts = ['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.mjs', '.cjs'];
      for (const ext of exts) {
        if (fs.existsSync(resolvedPath + ext)) {
          return { id: resolvedPath + ext };
        }
      }
    } catch (e) {
      // ignore
    }
    
    return null;
  }
})
const _rolldownExperimental = {
  dev: _experimentalPluginStub('rolldown-dev'),
  oxcRuntimePlugin: _experimentalPluginStub('oxc-runtime'),
  resolveTsconfig: _notSupported('rolldown/experimental.resolveTsconfig'),
  scan: _experimentalPluginStub('rolldown-scan'),
  viteAliasPlugin: _experimentalPluginStub('vite-alias'),
  viteBuildImportAnalysisPlugin: _experimentalPluginStub('vite-build-import-analysis'),
  viteDynamicImportVarsPlugin: _experimentalPluginStub('vite-dynamic-import-vars'),
  viteImportGlobPlugin: _experimentalPluginStub('vite-import-glob'),
  viteJsonPlugin: _experimentalPluginStub('vite-json'),
  viteLoadFallbackPlugin: _experimentalPluginStub('vite-load-fallback'),
  viteManifestPlugin: _experimentalPluginStub('vite-manifest'),
  viteModulePreloadPolyfillPlugin: _experimentalPluginStub('vite-module-preload-polyfill'),
  viteReporterPlugin: _experimentalPluginStub('vite-reporter'),
  viteResolvePlugin: _viteResolvePlugin,
  viteTransformPlugin: _experimentalPluginStub('vite-transform'),
  viteWasmFallbackPlugin: _experimentalPluginStub('vite-wasm-fallback'),
  viteWebWorkerPostPlugin: _experimentalPluginStub('vite-web-worker-post'),
  viteReactRefreshWrapperPlugin: _experimentalPluginStub('vite-react-refresh-wrapper'),
  default: undefined as unknown,
}
_rolldownExperimental.default = _rolldownExperimental

// rollup/rolldown stub — allows Vite to import them at startup without crashing.
// Actual bundling (vite build) will throw; the dev server does not use rollup/rolldown.
const _notSupportedBundle = () => { console.trace('_notSupportedBundle called'); return Promise.reject(new Error("bundler is not supported in browser; use vite dev server only")) }
const _rollupBundle = {
  rollup: _notSupportedBundle,
  rolldown: async (options: any) => {
    console.log('[rolldown] called with options:', JSON.stringify(options, null, 2))
    // Minimal mock for Vite 8's loadConfigFromFile which uses rolldown
    if (options && typeof options.input === 'string') {
      const fs = _requireSync('node:fs', '/app') as typeof import('fs')
      const code = fs.readFileSync(options.input, 'utf-8')
      const transpiled = _tsTransformSync(code, options.input)
      return {
        generate: async () => {
          return {
            output: [{
              type: 'chunk',
              isEntry: true,
              code: transpiled,
              fileName: 'vite.config.js',
              moduleIds: [options.input],
              imports: [],
              dynamicImports: []
            }]
          }
        },
        close: async () => {}
      }
    }
    return _notSupportedBundle()
  },
  watch: () => { throw new Error('rollup/rolldown.watch is not supported in browser') },
  defineConfig: (cfg: unknown) => cfg,
  VERSION: '4.34.0',
  version: '4.34.0',
  default: undefined as unknown,
}
_rollupBundle.default = _rollupBundle

// picocolors stub for packages that import it outside Vite's bundle
const _picocolors = {
  isColorSupported: false,
  reset: (s: string) => s, bold: (s: string) => s, dim: (s: string) => s,
  italic: (s: string) => s, underline: (s: string) => s, inverse: (s: string) => s,
  hidden: (s: string) => s, strikethrough: (s: string) => s,
  black: (s: string) => s, red: (s: string) => s, green: (s: string) => s,
  yellow: (s: string) => s, blue: (s: string) => s, magenta: (s: string) => s,
  cyan: (s: string) => s, white: (s: string) => s, gray: (s: string) => s,
  bgBlack: (s: string) => s, bgRed: (s: string) => s, bgGreen: (s: string) => s,
  bgYellow: (s: string) => s, bgBlue: (s: string) => s, bgMagenta: (s: string) => s,
  bgCyan: (s: string) => s, bgWhite: (s: string) => s,
  default: undefined as unknown,
}
_picocolors.default = _picocolors

// connect's default export IS the factory function; attach extra props so named imports work
const _connectFn = connectDefault as typeof connectDefault & { default: unknown; createServer: typeof connectCreateServer }
_connectFn.default = _connectFn
_connectFn.createServer = connectCreateServer
const _connectShim = _connectFn

// sirv's default export is the middleware factory; attach named export alias
const _sirvFn = sirvDefault as typeof sirvDefault & { default: unknown; sirv: typeof sirvDefault }
_sirvFn.default = _sirvFn
_sirvFn.sirv = _sirvFn
const _sirvShim = _sirvFn

// Late-bound reference to requireSync (set by worker/index.ts to avoid circular deps)
let _requireSync: (spec: string, fromDir: string) => unknown = () => undefined
let _resolveModule: (spec: string, fromDir: string) => string | null = () => null

export function bindRequireSync(
  fn: (spec: string, fromDir: string) => unknown,
  resolveFn: (spec: string, fromDir: string) => string | null
) {
  _requireSync = fn
  _resolveModule = resolveFn
}

const _vmScript = class Script {
  private _code: string
  constructor(code: string, _opts?: unknown) { this._code = code }
  runInThisContext(_opts?: unknown) { return (0, eval)(this._code) }
  runInNewContext(sandbox?: Record<string, unknown>, _opts?: unknown) {
    const keys = Object.keys(sandbox ?? {}); const vals = Object.values(sandbox ?? {})
    return new Function(...keys, `"use strict"; return (${this._code})`)(...vals)
  }
}
const _vm = {
  Script: _vmScript,
  createContext: (sandbox?: Record<string, unknown>) => sandbox ?? {},
  runInThisContext: (code: string) => (0, eval)(code),
  runInNewContext: (code: string, sandbox?: Record<string, unknown>) => new _vmScript(code).runInNewContext(sandbox),
  runInContext: (code: string, _ctx: unknown) => (0, eval)(code),
  isContext: (_obj: unknown) => false,
  compileFunction: (code: string, params: string[] = [], _opts?: unknown) => new Function(...params, code),
  default: undefined as unknown,
}
_vm.default = _vm

const _builtinModules = [
  'fs', 'path', 'http', 'https', 'events', 'stream', 'util', 'os', 'crypto',
  'buffer', 'url', 'querystring', 'assert', 'timers', 'readline', 'zlib',
  'dns', 'dns/promises', 'stream/web', 'stream/promises', 'console', 'util/types', 'path/posix', 'path/win32', 'fs/promises', 'net', 'tls', 'tty', 'child_process', 'worker_threads', 'string_decoder',
  'perf_hooks', 'cluster', 'module', 'constants', 'v8', 'domain', 'async_hooks', 'inspector', 'vm',
]

// Node.js built-in constants (deprecated module, still used by some packages)
const _constants = {
  // File open flags
  O_RDONLY: 0, O_WRONLY: 1, O_RDWR: 2, O_CREAT: 64, O_EXCL: 128,
  O_TRUNC: 512, O_APPEND: 1024, O_DIRECTORY: 65536, O_NOATIME: 262144,
  O_NOFOLLOW: 131072, O_SYNC: 1052672, O_SYMLINK: 2097152, O_NONBLOCK: 2048,
  // File mode bits
  S_IFMT: 61440, S_IFREG: 32768, S_IFDIR: 16384, S_IFLNK: 40960,
  S_IFBLK: 24576, S_IFCHR: 8192, S_IFIFO: 4096, S_IFSOCK: 49152,
  S_IRWXU: 448, S_IRUSR: 256, S_IWUSR: 128, S_IXUSR: 64,
  S_IRWXG: 56, S_IRGRP: 32, S_IWGRP: 16, S_IXGRP: 8,
  S_IRWXO: 7, S_IROTH: 4, S_IWOTH: 2, S_IXOTH: 1,
  // Access modes
  F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1,
  // errno constants
  E2BIG: 7, EACCES: 13, EADDRINUSE: 98, EADDRNOTAVAIL: 99, EAFNOSUPPORT: 97,
  EAGAIN: 11, EALREADY: 114, EBADF: 9, EBADMSG: 74, EBUSY: 16,
  ECANCELED: 125, ECHILD: 10, ECONNABORTED: 103, ECONNREFUSED: 111,
  ECONNRESET: 104, EDEADLK: 35, EDESTADDRREQ: 89, EDOM: 33, EDQUOT: 122,
  EEXIST: 17, EFAULT: 14, EFBIG: 27, EHOSTUNREACH: 113, EIDRM: 43,
  EILSEQ: 84, EINPROGRESS: 115, EINTR: 4, EINVAL: 22, EIO: 5, EISCONN: 106,
  EISDIR: 21, ELOOP: 40, EMFILE: 24, EMLINK: 31, EMSGSIZE: 90, EMULTIHOP: 72,
  ENAMETOOLONG: 36, ENETDOWN: 100, ENETRESET: 102, ENETUNREACH: 101,
  ENFILE: 23, ENOBUFS: 105, ENODATA: 61, ENODEV: 19, ENOENT: 2, ENOEXEC: 8,
  ENOLCK: 37, ENOLINK: 67, ENOMEM: 12, ENOMSG: 42, ENOPROTOOPT: 92,
  ENOSPC: 28, ENOSR: 63, ENOSTR: 60, ENOSYS: 38, ENOTCONN: 107,
  ENOTDIR: 20, ENOTEMPTY: 39, ENOTSOCK: 88, ENOTSUP: 95, ENOTTY: 25,
  ENXIO: 6, EOPNOTSUPP: 95, EOVERFLOW: 75, EPERM: 1, EPIPE: 32,
  EPROTO: 71, EPROTONOSUPPORT: 93, EPROTOTYPE: 91, ERANGE: 34, EROFS: 30,
  ESPIPE: 29, ESRCH: 3, ESTALE: 116, ETIME: 62, ETIMEDOUT: 110,
  ETXTBSY: 26, EWOULDBLOCK: 11, EXDEV: 18,
  // Signal constants
  SIGHUP: 1, SIGINT: 2, SIGQUIT: 3, SIGILL: 4, SIGTRAP: 5, SIGABRT: 6,
  SIGBUS: 7, SIGFPE: 8, SIGKILL: 9, SIGUSR1: 10, SIGSEGV: 11, SIGUSR2: 12,
  SIGPIPE: 13, SIGALRM: 14, SIGTERM: 15, SIGCHLD: 17, SIGCONT: 18,
  SIGSTOP: 19, SIGTSTP: 20, SIGTTIN: 21, SIGTTOU: 22, SIGURG: 23,
  SIGXCPU: 24, SIGXFSZ: 25, SIGVTALRM: 26, SIGPROF: 27, SIGWINCH: 28,
  SIGIO: 29, SIGPOLL: 29, SIGPWR: 30, SIGSYS: 31,
  // SSL constants (subset)
  SSL_OP_ALL: 0, SSL_OP_NO_SSLv2: 0, SSL_OP_NO_SSLv3: 0,
  // Priority constants
  PRIORITY_LOW: 19, PRIORITY_BELOW_NORMAL: 10, PRIORITY_NORMAL: 0,
  PRIORITY_ABOVE_NORMAL: -7, PRIORITY_HIGH: -14, PRIORITY_HIGHEST: -20,
  default: undefined as unknown,
}

class _Module {
  id: string; filename: string; exports: Record<string, unknown>
  constructor(id: string) { this.id = id; this.filename = id; this.exports = {} }
  static _resolveFilename(id: string) { return id }
  static _extensions: Record<string, unknown> = {}
  static _cache: Record<string, unknown> = {}
  static builtinModules = _builtinModules
  static createRequire(base: string) { return _moduleShim.createRequire(base) }
  static wrap(script: string) { return `(function (exports, require, module, __filename, __dirname) { ${script}\n});` }
}

const _moduleShim = {
  createRequire: (base: string) => {
    const fromDir = typeof base === 'string' && base.startsWith('file://')
      ? decodeURIComponent(new URL(base).pathname).replace(/\/[^/]+$/, '')
      : typeof base === 'string'
      ? base.replace(/\/[^/]+$/, '')
      : '/app'
    const req = (spec: string) => _requireSync(spec, fromDir)
    req.resolve = (spec: string) => {
      const resolved = _resolveModule(spec, fromDir)
      if (!resolved) throw new Error(`Cannot find module '${spec}'`)
      return resolved.replace(/^__shim__:/, '')
    }
    req.cache = {} as Record<string, unknown>
    req.extensions = {} as Record<string, unknown>
    req.main = undefined
    return req
  },
  Module: _Module,
  builtinModules: _builtinModules,
  default: undefined as unknown,
  isBuiltin: (id: string) => _builtinModules.includes(id.replace(/^node:/, '')),
  // Node.js Module.prototype.require — Next.js monkey-patches this in require-hook.js
  prototype: {
    require: (spec: string) => _requireSync(spec, '/app'),
  },
  // Next.js reads and patches Module._resolveFilename
  _resolveFilename: (request: string) => {
    const resolved = _resolveModule(request, '/app')
    return resolved ? resolved.replace(/^__shim__:/, '') : request
  },
}
_moduleShim.default = _moduleShim

// Synchronous shim registry — also includes node: prefixed variants for packages
// that use require('node:fs') etc.
export const shimMap: Record<string, unknown> = {
  process,
  path,
  events: _events,
  stream: defaultStream,
  util,
  os,
  crypto,
  http,
  https,
  fs,
  'fs/promises': fsPromises,
  buffer: _buffer,
  url: _url,
  querystring: _querystring,
  assert: _assert,
  'assert/strict': _assert,
  timers: _timers,
  'timers/promises': {
    setTimeout: (ms: number) => new Promise(r => setTimeout(r, ms)),
    setImmediate: () => new Promise(r => setTimeout(r, 0)),
  },
  perf_hooks: { performance },
  child_process: _childProcess,
  net: _net,
  tls: _tls,
  tty: _tty,
  readline: _readline,
  zlib: _zlib,
  dns: _dns,
  module: _moduleShim,
  constants: _constants,
  'node:constants': _constants,
  domain: { create: () => ({ on: () => {}, run: (fn: () => void) => fn(), bind: (fn: unknown) => fn, intercept: (fn: unknown) => fn, add: () => {}, remove: () => {}, enter: () => {}, exit: () => {}, dispose: () => {}, members: [] }) },
  async_hooks: { createHook: () => ({ enable: () => {}, disable: () => {} }), executionAsyncId: () => 0, triggerAsyncId: () => 0, AsyncLocalStorage: class { run<T>(store: unknown, fn: () => T): T { return fn() }; getStore() { return undefined }; enterWith() {} }, AsyncResource: class { static bind(fn: unknown) { return fn } } },
  cluster: { isMaster: true, isWorker: false, fork: () => { throw new Error('cluster not supported') } },
  'worker_threads': _workerThreads,
  'ws': ws,
  'string_decoder': {
    StringDecoder: class {
      encoding: string
      constructor(enc = 'utf8') { this.encoding = enc }
      write(buf: Uint8Array) { return new TextDecoder(this.encoding).decode(buf) }
      end() { return '' }
    }
  },
  // node: prefixed aliases — required for packages that use require('node:events') etc.
  'node:module': _moduleShim,
  'node:process': process,
  'node:path': path,
  'node:events': _events,
  'node:stream': defaultStream,
  'node:util': util,
  'node:os': os,
  'node:crypto': crypto,
  'node:http': http,
  'node:https': https,
  'node:fs': fs,
  'node:fs/promises': fsPromises,
  'node:buffer': _buffer,
  'node:url': _url,
  'node:querystring': _querystring,
  'node:assert': _assert,
  'node:timers': _timers,
  'node:timers/promises': {
    setTimeout: (ms: number) => new Promise(r => setTimeout(r, ms)),
    setImmediate: () => new Promise(r => setTimeout(r, 0)),
  },
  'node:perf_hooks': { performance },
  'node:child_process': _childProcess,
  'node:net': _net,
  'node:tls': _tls,
  'node:tty': _tty,
  'node:readline': _readline,
  'node:zlib': _zlib,
  'node:dns': _dns,
  'dns/promises': _dns.promises,
  'node:dns/promises': _dns.promises,
  'stream/promises': defaultStream.promises,
  'node:stream/promises': defaultStream.promises,
  // stream/web — Web Streams API, available as globals in browser Workers
  'stream/web': { ReadableStream, WritableStream, TransformStream, ReadableStreamBYOBReader: (self as unknown as Record<string, unknown>).ReadableStreamBYOBReader, CountQueuingStrategy, ByteLengthQueuingStrategy },
  'node:stream/web': { ReadableStream, WritableStream, TransformStream, ReadableStreamBYOBReader: (self as unknown as Record<string, unknown>).ReadableStreamBYOBReader, CountQueuingStrategy, ByteLengthQueuingStrategy },
  // console module — expose the global console object as a CommonJS module
  'console': console,
  'node:console': console,
  // util subpath exports
  'util/types': util.types,
  'node:util/types': util.types,
  // path subpath exports
  'path/posix': path,
  'node:path/posix': path,
  'path/win32': path,
  'node:path/win32': path,
  // fs subpath exports
  'fs/promises': fs.promises,
  'node:fs/promises': fs.promises,
  'node:v8': _v8,
  'v8': _v8,
  'node:worker_threads': _workerThreads,
  'wasi': { WASI: WasiWithFs, default: undefined },
  'node:wasi': { WASI: WasiWithFs, default: undefined },
  'node:string_decoder': {
    StringDecoder: class {
      encoding: string
      constructor(enc = 'utf8') { this.encoding = enc }
      write(buf: Uint8Array) { return new TextDecoder(this.encoding).decode(buf) }
      end() { return '' }
    }
  },

  // rolldown subpath stubs — intercepted so native WASM bindings are never loaded
  'rolldown': _rollupBundle,
  'rolldown/parseAst': _rolldownParseAst,
  'rolldown/plugins': _rolldownPlugins,
  'rolldown/utils': _rolldownUtils,
  'rolldown/filter': _rolldownFilter,
  'rolldown/experimental': _rolldownExperimental,

  // TypeScript shim: always available so require('typescript') works even in JS-only projects.
  // The create-vite react (JavaScript) template does NOT install typescript, but Vite 8 uses
  // rolldown/utils.transformSync (our shim) which calls _requireSync('typescript', dir).
  // By providing it here in the global shim map, JSX transform always works.
  'typescript': (() => {
    const _transpileModule = (sourceCode: string, opts: Record<string, unknown>) => {
      const co = (opts?.compilerOptions ?? {}) as Record<string, unknown>
      const lang = co.jsx === 2 || co.jsx === 4 ? 'jsx' : undefined
      const out = _tsTransformSync(sourceCode, 'file.tsx', lang ?? 'tsx')
      return { outputText: out, diagnostics: [] }
    }
    const tsShim = {
      transpileModule: _transpileModule,
      version: '5.4.0',
      ModuleKind: { CommonJS: 1, ESNext: 99 },
      ScriptTarget: { ESNext: 99 },
      JsxEmit: { None: 1, React: 2, ReactJSX: 4, Preserve: 4 },
      _isBuiltinShim: true,
      default: undefined as unknown,
    }
    tsShim.default = tsShim
    return tsShim
  })(),
  'esbuild': esbuildShim,
  'rollup': _rollupBundle,
  'chokidar': chokidarShim,
  'connect': _connectShim,
  'sirv': _sirvShim,
  'picocolors': _picocolors,
  // async_hooks — AsyncLocalStorage is used by fastify and many other frameworks
  'async_hooks': (() => {
    // AsyncLocalStorage: persist store across async boundaries by not restoring
    // synchronously when fn returns a Promise (single-threaded Worker context).
    class AsyncLocalStorage<T> {
      private _store: T | undefined = undefined
      getStore(): T | undefined { return this._store }
      run<R>(store: T, fn: (...args: unknown[]) => R, ...args: unknown[]): R {
        const prev = this._store
        this._store = store
        try {
          const result = fn(...args)
          if (result instanceof Promise) {
            // Keep store set until the promise settles so async handlers can access it
            result.finally(() => { if (this._store === store) this._store = prev })
            return result as unknown as R
          }
          this._store = prev
          return result
        } catch (e) {
          this._store = prev
          throw e
        }
      }
      enterWith(store: T): void { this._store = store }
      exit<R>(fn: (...args: unknown[]) => R, ...args: unknown[]): R {
        const prev = this._store
        this._store = undefined
        try { return fn(...args) } finally { this._store = prev }
      }
      disable(): void {}
      enable(): void {}
    }
    class AsyncResource {
      type: string
      constructor(type: string) { this.type = type }
      runInAsyncScope<R>(fn: (...args: unknown[]) => R, _thisArg?: unknown, ...args: unknown[]): R { return fn(...args) }
      bind<T extends (...args: unknown[]) => unknown>(fn: T): T { return fn }
      static bind<T extends (...args: unknown[]) => unknown>(fn: T): T { return fn }
      emitDestroy(): this { return this }
      asyncId(): number { return 1 }
      triggerAsyncId(): number { return 0 }
    }
    const _m = { AsyncLocalStorage, AsyncResource, createHook: () => ({ enable: () => {}, disable: () => {} }), executionAsyncId: () => 1, triggerAsyncId: () => 0, executionAsyncResource: () => null, default: undefined as unknown }
    _m.default = _m; return _m
  })(),
  'node:async_hooks': (() => {
    class AsyncLocalStorage2<T> {
      private _store: T | undefined = undefined
      getStore(): T | undefined { return this._store }
      run<R>(store: T, fn: (...args: unknown[]) => R, ...args: unknown[]): R {
        const prev = this._store
        this._store = store
        try {
          const result = fn(...args)
          if (result instanceof Promise) {
            result.finally(() => { if (this._store === store) this._store = prev })
            return result as unknown as R
          }
          this._store = prev
          return result
        } catch (e) {
          this._store = prev
          throw e
        }
      }
      enterWith(store: T): void { this._store = store }
      exit<R>(fn: (...args: unknown[]) => R, ...args: unknown[]): R {
        const prev = this._store
        this._store = undefined
        try { return fn(...args) } finally { this._store = prev }
      }
      disable(): void {} enable(): void {}
    }
    class AsyncResource2 {
      type: string
      constructor(type: string) { this.type = type }
      runInAsyncScope<R>(fn: (...args: unknown[]) => R, _thisArg?: unknown, ...args: unknown[]): R { return fn(...args) }
      bind<T extends (...args: unknown[]) => unknown>(fn: T): T { return fn }
      static bind<T extends (...args: unknown[]) => unknown>(fn: T): T { return fn }
      emitDestroy(): this { return this } asyncId(): number { return 1 } triggerAsyncId(): number { return 0 }
    }
    const _m2 = { AsyncLocalStorage: AsyncLocalStorage2, AsyncResource: AsyncResource2, createHook: () => ({ enable: () => {}, disable: () => {} }), executionAsyncId: () => 1, triggerAsyncId: () => 0, executionAsyncResource: () => null, default: undefined as unknown }
    _m2.default = _m2; return _m2
  })(),

  // vm stub — Next.js imports it for script compilation; basic eval-based implementation
  'vm': _vm,
  'node:vm': _vm,
  // inspector stub — Next.js imports it; browser has no V8 inspector protocol
  'inspector': { open: () => {}, close: () => {}, url: () => undefined, console: {}, Session: class { connect() {} disconnect() {} post() {} on() {} once() {} off() {} }, default: undefined as unknown },
  'node:inspector': { open: () => {}, close: () => {}, url: () => undefined, console: {}, Session: class { connect() {} disconnect() {} post() {} on() {} once() {} off() {} }, default: undefined as unknown },

  // http2 stub — fastify imports it; we stub it since browser doesn't support raw HTTP/2
  'http2': {
    createServer: () => { throw new Error('http2 not supported in browser') },
    createSecureServer: () => { throw new Error('http2 not supported in browser') },
    connect: () => { throw new Error('http2 not supported in browser') },
    constants: { HTTP2_HEADER_STATUS: ':status', HTTP2_HEADER_METHOD: ':method', HTTP2_HEADER_PATH: ':path', HTTP2_HEADER_CONTENT_TYPE: 'content-type' },
    default: undefined as unknown,
  },
  'node:http2': {
    createServer: () => { throw new Error('http2 not supported in browser') },
    createSecureServer: () => { throw new Error('http2 not supported in browser') },
    connect: () => { throw new Error('http2 not supported in browser') },
    constants: { HTTP2_HEADER_STATUS: ':status', HTTP2_HEADER_METHOD: ':method', HTTP2_HEADER_PATH: ':path', HTTP2_HEADER_CONTENT_TYPE: 'content-type' },
    default: undefined as unknown,
  },

  // diagnostics_channel — used by fastify and other packages for telemetry
  'diagnostics_channel': (() => {
    const _channels = new Map<string, { publish: (d: unknown) => void; subscribe: (fn: (d: unknown) => void) => void; unsubscribe: (fn: (d: unknown) => void) => void; hasSubscribers: boolean }>()
    const _noop = () => {}
    const _mkChannel = (map: typeof _channels, name: string) => {
      if (!map.has(name)) {
        const subs: ((d: unknown) => void)[] = []
        map.set(name, { publish: (d) => subs.forEach(fn => fn(d)), subscribe: (fn) => subs.push(fn), unsubscribe: (fn) => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1) }, get hasSubscribers() { return subs.length > 0 } })
      }
      return map.get(name)!
    }
    const _ch = (name: string) => _mkChannel(_channels, name)
    const _tracingChannel = (_name: string) => ({
      start: { publish: _noop, subscribe: _noop, unsubscribe: _noop, hasSubscribers: false },
      end: { publish: _noop, subscribe: _noop, unsubscribe: _noop, hasSubscribers: false },
      asyncStart: { publish: _noop, subscribe: _noop, unsubscribe: _noop, hasSubscribers: false },
      asyncEnd: { publish: _noop, subscribe: _noop, unsubscribe: _noop, hasSubscribers: false },
      error: { publish: _noop, subscribe: _noop, unsubscribe: _noop, hasSubscribers: false },
      subscribe: _noop, unsubscribe: _noop,
      traceSync: (fn: (...a: unknown[]) => unknown, ctx: unknown, ...a: unknown[]) => fn.apply(ctx, a),
      traceCallback: (fn: (...a: unknown[]) => unknown, pos: number, ctx: unknown, ...a: unknown[]) => fn.apply(ctx, a),
      tracePromise: (fn: (...a: unknown[]) => unknown, ctx: unknown, ...a: unknown[]) => fn.apply(ctx, a),
    })
    const m = { channel: _ch, hasSubscribers: (n: string) => _ch(n).hasSubscribers, subscribe: (n: string, fn: (d: unknown) => void) => _ch(n).subscribe(fn), unsubscribe: (n: string, fn: (d: unknown) => void) => _ch(n).unsubscribe(fn), tracingChannel: _tracingChannel, default: undefined as unknown }
    m.default = m; return m
  })(),
  'node:diagnostics_channel': (() => {
    const _channels2 = new Map<string, { publish: (d: unknown) => void; subscribe: (fn: (d: unknown) => void) => void; unsubscribe: (fn: (d: unknown) => void) => void; hasSubscribers: boolean }>()
    const _noop2 = () => {}
    const _mkChannel2 = (map: typeof _channels2, name: string) => {
      if (!map.has(name)) {
        const subs: ((d: unknown) => void)[] = []
        map.set(name, { publish: (d) => subs.forEach(fn => fn(d)), subscribe: (fn) => subs.push(fn), unsubscribe: (fn) => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1) }, get hasSubscribers() { return subs.length > 0 } })
      }
      return map.get(name)!
    }
    const _ch2 = (name: string) => _mkChannel2(_channels2, name)
    const _tracingChannel2 = (_name: string) => ({
      start: { publish: _noop2, subscribe: _noop2, unsubscribe: _noop2, hasSubscribers: false },
      end: { publish: _noop2, subscribe: _noop2, unsubscribe: _noop2, hasSubscribers: false },
      asyncStart: { publish: _noop2, subscribe: _noop2, unsubscribe: _noop2, hasSubscribers: false },
      asyncEnd: { publish: _noop2, subscribe: _noop2, unsubscribe: _noop2, hasSubscribers: false },
      error: { publish: _noop2, subscribe: _noop2, unsubscribe: _noop2, hasSubscribers: false },
      subscribe: _noop2, unsubscribe: _noop2,
      traceSync: (fn: (...a: unknown[]) => unknown, ctx: unknown, ...a: unknown[]) => fn.apply(ctx, a),
      traceCallback: (fn: (...a: unknown[]) => unknown, pos: number, ctx: unknown, ...a: unknown[]) => fn.apply(ctx, a),
      tracePromise: (fn: (...a: unknown[]) => unknown, ctx: unknown, ...a: unknown[]) => fn.apply(ctx, a),
    })
    const m2 = { channel: _ch2, hasSubscribers: (n: string) => _ch2(n).hasSubscribers, subscribe: (n: string, fn: (d: unknown) => void) => _ch2(n).subscribe(fn), unsubscribe: (n: string, fn: (d: unknown) => void) => _ch2(n).unsubscribe(fn), tracingChannel: _tracingChannel2, default: undefined as unknown }
    m2.default = m2; return m2
  })(),

  // Stub out native rollup platform bindings — rollup catches the require() error itself
  '@rollup/rollup-linux-x64-gnu': null,
  '@rollup/rollup-linux-x64-musl': null,
  '@rollup/rollup-linux-arm64-gnu': null,
  '@rollup/rollup-linux-arm64-musl': null,
  '@rollup/rollup-darwin-x64': null,
  '@rollup/rollup-darwin-arm64': null,
  '@rollup/rollup-win32-x64-msvc': null,
  // Stub out native esbuild platform bindings
  '@esbuild/linux-x64': null,
  '@esbuild/linux-arm64': null,
  '@esbuild/darwin-x64': null,
  '@esbuild/darwin-arm64': null,
  '@esbuild/win32-x64': null,
}
