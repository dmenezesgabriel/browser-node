// chokidar-compatible watcher over the VFS's real fs.watch (memfs emits
// rename/change events, recursive included). Events are re-statted to map to
// chokidar's add/addDir/change/unlink/unlinkDir, and bursts are coalesced with
// a short per-path debounce (npm installs write thousands of files at once).
import { EventEmitter } from './events'
import { memfsInstance } from '../vfs'

const DEBOUNCE_MS = 50

type StatsLike = { isFile(): boolean; isDirectory(): boolean }
type VolWatch = (path: string, opts: { recursive?: boolean }, listener: (ev: string, filename: string | null) => void) => { close(): void }

function statOrNull(p: string): StatsLike | null {
  try { return memfsInstance.statSync(p) as unknown as StatsLike } catch { return null }
}

export class FSWatcher extends EventEmitter {
  private _watchers: Array<{ close(): void }> = []
  private _known = new Map<string, 'file' | 'dir'>()
  private _pending = new Map<string, ReturnType<typeof setTimeout>>()
  private _closed = false
  private _ignoreInitial: boolean

  constructor(opts?: Record<string, unknown>) {
    super()
    this._ignoreInitial = Boolean(opts?.ignoreInitial)
  }

  add(paths: string | string[]): this {
    // Deferred so callers can attach listeners before the initial scan emits
    // add/addDir; ready fires after the scan, per the chokidar contract.
    queueMicrotask(() => {
      if (this._closed) return
      for (const p of Array.isArray(paths) ? paths : [paths]) this._addPath(p)
      this.emit('ready')
    })
    return this
  }

  unwatch(_paths: string | string[]): this { return this }

  close(): Promise<void> {
    if (!this._closed) {
      this._closed = true
      for (const t of this._pending.values()) clearTimeout(t)
      for (const w of this._watchers) w.close()
      this.emit('close')
    }
    return Promise.resolve()
  }

  getWatched(): Record<string, string[]> {
    const byDir: Record<string, string[]> = {}
    for (const [p, kind] of this._known) {
      if (kind !== 'file') continue
      const dir = p.slice(0, p.lastIndexOf('/')) || '/'
      ;(byDir[dir] ??= []).push(p.slice(p.lastIndexOf('/') + 1))
    }
    return byDir
  }

  private _addPath(root: string): void {
    const st = statOrNull(root)
    if (!st) return
    const volWatch = (memfsInstance as unknown as { watch: VolWatch }).watch.bind(memfsInstance)
    if (st.isDirectory()) {
      this._scanInitial(root)
      this._watchers.push(volWatch(root, { recursive: true }, (_ev, filename) => {
        if (filename) this._schedule(`${root}/${filename}`)
      }))
      return
    }
    this._known.set(root, 'file')
    if (!this._ignoreInitial) this._emitFor('add', root)
    this._watchers.push(volWatch(root, {}, () => this._schedule(root)))
  }

  private _scanInitial(dir: string): void {
    this._known.set(dir, 'dir')
    if (!this._ignoreInitial) this._emitFor('addDir', dir)
    for (const entry of memfsInstance.readdirSync(dir) as string[]) {
      const full = `${dir}/${entry}`
      const st = statOrNull(full)
      if (st?.isDirectory()) {
        this._scanInitial(full)
      } else if (st) {
        this._known.set(full, 'file')
        if (!this._ignoreInitial) this._emitFor('add', full)
      }
    }
  }

  private _schedule(fullPath: string): void {
    const prev = this._pending.get(fullPath)
    if (prev) clearTimeout(prev)
    this._pending.set(fullPath, setTimeout(() => {
      this._pending.delete(fullPath)
      this._settle(fullPath)
    }, DEBOUNCE_MS))
  }

  // Decide which chokidar event a raw fs event maps to by re-statting.
  private _settle(fullPath: string): void {
    if (this._closed) return
    const st = statOrNull(fullPath)
    const known = this._known.get(fullPath)
    if (!st) {
      if (!known) return
      this._known.delete(fullPath)
      this._emitFor(known === 'dir' ? 'unlinkDir' : 'unlink', fullPath)
      return
    }
    if (st.isDirectory()) {
      if (known !== 'dir') { this._known.set(fullPath, 'dir'); this._emitFor('addDir', fullPath) }
      return
    }
    this._known.set(fullPath, 'file')
    this._emitFor(known === 'file' ? 'change' : 'add', fullPath)
  }

  private _emitFor(event: string, p: string): void {
    this.emit(event, p)
    this.emit('all', event, p)
  }
}

export function watch(paths: string | string[], opts?: Record<string, unknown>): FSWatcher {
  return new FSWatcher(opts).add(paths)
}

const chokidar = { watch, FSWatcher }
export default chokidar
