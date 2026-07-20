// Delegates to the shared memfs instance
import { memfsInstance } from '../vfs'
import { Readable, Writable } from './stream'

// Convert a path argument that may be a URL object or file:// string to a plain path string.
function toPath(p: unknown): string {
  if (typeof p === 'string') {
    // file:// URL strings
    if (p.startsWith('file://')) {
      try { return decodeURIComponent(new URL(p).pathname) } catch {}
    }
    return p
  }
  if (p instanceof URL) return decodeURIComponent(p.pathname)
  // Let memfs handle Buffers/Uint8Arrays
  return p as string
}

export const fs = memfsInstance as unknown as typeof import('fs')

function cpSyncFallback(src: string, dest: string, opts: any = {}) {
  const stat = (fs as any).statSync(src);
  if (stat.isDirectory()) {
    if (opts.recursive) {
      try { (fs as any).mkdirSync(dest, { recursive: true }); } catch {}
      for (const f of (fs as any).readdirSync(src)) {
        cpSyncFallback(src + '/' + f, dest + '/' + f, opts);
      }
    }
  } else {
    const parent = require('path').dirname(dest)
    try { (fs as any).mkdirSync(parent, { recursive: true }); } catch {}
    (fs as any).writeFileSync(dest, (fs as any).readFileSync(src));
  }
}

if (!(fs as any).cpSync) {
  (fs as any).cpSync = cpSyncFallback;
}

// memfs implements real fs.watch/watchFile with rename/change events
// (recursive included) — Vite's HMR file watching works against it. Wrap them
// like the other methods so URL path arguments are handled.
const _fs = fs as unknown as Record<string, unknown>

// Wrap core fs methods to handle URL objects as path arguments (Node.js 12+ feature)
const _wrap = <T extends (...args: unknown[]) => unknown>(fn: T): T =>
  ((...args: unknown[]) => { args[0] = toPath(args[0]); return fn(...args) }) as T

const _wrapSync = (name: string) => {
  if (typeof _fs[name] === 'function') _fs[name] = _wrap(_fs[name] as (...args: unknown[]) => unknown)
}
for (const m of ['readFileSync','writeFileSync','statSync','lstatSync','existsSync','readdirSync',
                  'mkdirSync','rmdirSync','unlinkSync','accessSync','renameSync',
                  'openSync','chmodSync','copyFileSync','linkSync','symlinkSync','readlinkSync','realpathSync', 'cpSync',
                  'watch','watchFile','unwatchFile']) {
  _wrapSync(m)
}

// createReadStream/createWriteStream: memfs's own ReadStream doesn't drive our
// stream shim's pull model, so express.static / send (which pipe a read stream
// to the response) produced empty bodies. The VFS is fully in-memory, so back
// these with readFileSync/writeFileSync over our Readable/Writable instead.
function _concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) { out.set(p, off); off += p.length }
  return out
}

_fs.createReadStream = (p: unknown, opts?: unknown): unknown => {
  const path = toPath(p)
  const rs = new (Readable as unknown as new () => Record<string, unknown>)() as Record<string, unknown> & {
    emit(e: string, ...a: unknown[]): unknown; push(c: unknown): unknown
  }
  rs.path = path
  rs.close = (cb?: () => void) => cb?.()
  queueMicrotask(() => {
    try {
      let data = memfsInstance.readFileSync(path) as Uint8Array
      const o = (opts && typeof opts === 'object') ? opts as { start?: number; end?: number; encoding?: string } : {}
      if (typeof o.start === 'number' || typeof o.end === 'number') {
        data = data.slice(o.start ?? 0, (o.end ?? data.length - 1) + 1)
      }
      rs.emit('open', 0)
      rs.emit('ready')
      rs.push(o.encoding ? new TextDecoder(o.encoding).decode(data) : data)
      rs.push(null)
    } catch (e) { rs.emit('error', e) }
  })
  return rs
}

_fs.createWriteStream = (p: unknown, opts?: unknown): unknown => {
  const path = toPath(p)
  const chunks: Uint8Array[] = []
  const append = !!(opts && typeof opts === 'object' && (opts as { flags?: string }).flags?.includes('a'))
  const ws = new (Writable as unknown as new () => Record<string, unknown>)() as Record<string, unknown> & {
    emit(e: string, ...a: unknown[]): unknown
  }
  ws.path = path
  ws.write = (chunk: string | Uint8Array, enc?: unknown, cb?: () => void): boolean => {
    chunks.push(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk)
    ;(typeof enc === 'function' ? enc as () => void : cb)?.()
    return true
  }
  ws.end = (chunk?: string | Uint8Array | (() => void), enc?: unknown, cb?: () => void): unknown => {
    if (chunk && typeof chunk !== 'function') (ws.write as (c: unknown) => void)(chunk)
    try {
      let data = _concat(chunks)
      if (append && memfsInstance.existsSync(path)) {
        data = _concat([memfsInstance.readFileSync(path) as Uint8Array, data])
      }
      memfsInstance.writeFileSync(path, data)
      ws.emit('finish'); ws.emit('close')
    } catch (e) { ws.emit('error', e) }
    ;(typeof chunk === 'function' ? chunk : typeof enc === 'function' ? enc as () => void : cb)?.()
    return ws
  }
  queueMicrotask(() => { ws.emit('open', 0); ws.emit('ready') })
  return ws
}

if (!_fs.constants) {
  _fs.constants = FS_CONSTANTS
}

// Node.js fs.realpathSync.native uses the OS realpath(3) syscall; in our VFS
// there are no real symlinks so native and JS variants behave identically.
if (typeof _fs.realpathSync === 'function' && !(_fs.realpathSync as unknown as Record<string, unknown>).native) {
  (_fs.realpathSync as unknown as Record<string, unknown>).native = _fs.realpathSync
}

export const FS_CONSTANTS = {
  O_RDONLY: 0, O_WRONLY: 1, O_RDWR: 2, O_CREAT: 64, O_EXCL: 128, O_TRUNC: 512, O_APPEND: 1024,
  F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1,
  COPYFILE_EXCL: 1, COPYFILE_FICLONE: 2, COPYFILE_FICLONE_FORCE: 4,
}

export const fsPromises = {
  constants: FS_CONSTANTS,
  readFile:   (p: unknown, opts?: unknown) => Promise.resolve(memfsInstance.readFileSync(toPath(p), opts as string) as Buffer),
  writeFile:  (p: unknown, data: string | Uint8Array) => { memfsInstance.writeFileSync(toPath(p), data); return Promise.resolve() },
  mkdir:      (p: unknown, opts?: unknown) => { try { memfsInstance.mkdirSync(toPath(p), opts as object) } catch {} return Promise.resolve() },
  readdir:    (p: unknown, opts?: unknown) => {
    const entries = memfsInstance.readdirSync(toPath(p), opts as object) as string[]
    return Promise.resolve(entries)
  },
  stat:       (p: unknown) => Promise.resolve(memfsInstance.statSync(toPath(p))),
  lstat:      (p: unknown) => Promise.resolve(memfsInstance.statSync(toPath(p))),
  unlink:     (p: unknown) => { memfsInstance.unlinkSync(toPath(p)); return Promise.resolve() },
  rm:         (p: unknown, opts?: unknown) => {
    const resolved = toPath(p)
    try { memfsInstance.unlinkSync(resolved) } catch {
      try { (memfsInstance as unknown as Record<string, (...a: unknown[]) => unknown>).rmdirSync?.(resolved, opts) } catch {}
    }
    return Promise.resolve()
  },
  rename:     (from: unknown, to: unknown) => { memfsInstance.renameSync(toPath(from), toPath(to)); return Promise.resolve() },
  access:     (p: unknown) => { try { memfsInstance.accessSync(toPath(p)); return Promise.resolve() } catch(e) { return Promise.reject(e) } },
  copyFile:   (src: unknown, dst: unknown) => { memfsInstance.writeFileSync(toPath(dst), memfsInstance.readFileSync(toPath(src))); return Promise.resolve() },
  cp:         (src: unknown, dst: unknown, opts: any) => { try { (memfsInstance as any).cpSync(toPath(src), toPath(dst), opts) } catch(e) { console.error('cp error', e); return Promise.reject(e) } return Promise.resolve() },
  realpath:   (p: unknown) => Promise.resolve(toPath(p)),
  open:       (p: unknown, _flags: string) => Promise.resolve({ read: () => Promise.resolve({ bytesRead: 0 }), close: () => Promise.resolve(), fd: 1 }),
  readlink:   (p: unknown) => Promise.resolve(toPath(p)),
  symlink:    (_target: unknown, _path: unknown) => Promise.resolve(),
  chmod:      (_p: unknown, _mode: number) => Promise.resolve(),
  // Async-iterator adapter over fs.watch, matching fsPromises.watch semantics:
  // yields { eventType, filename } until the returned iterator's close() runs.
  watch: (p: unknown, _opts?: unknown) => {
    const queue: Array<{ eventType: string; filename: string | null }> = []
    let notify: (() => void) | null = null
    let closed = false
    const watcher = (fs as unknown as {
      watch: (p: string, l: (e: string, f: string | null) => void) => { close(): void }
    }).watch(toPath(p), (eventType, filename) => {
      queue.push({ eventType, filename })
      notify?.()
    })
    const close = () => { closed = true; watcher.close(); notify?.() }
    return {
      close,
      async *[Symbol.asyncIterator]() {
        while (!closed) {
          if (queue.length) { yield queue.shift()!; continue }
          await new Promise<void>(r => { notify = r })
          notify = null
        }
      },
    }
  },
}

