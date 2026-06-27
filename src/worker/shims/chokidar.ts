// chokidar stub — memfs doesn't support real file watching.
// Returns a FSWatcher that emits nothing; HMR won't fire automatically,
// but Vite's dev server will still start and serve transformed files.
import { EventEmitter } from './events'

export class FSWatcher extends EventEmitter {
  private _closed = false

  add(_paths: string | string[]): this { return this }
  unwatch(_paths: string | string[]): this { return this }

  close(): Promise<void> {
    if (!this._closed) {
      this._closed = true
      this.emit('close')
    }
    return Promise.resolve()
  }

  getWatched(): Record<string, string[]> { return {} }
}

export function watch(
  _paths: string | string[],
  _opts?: Record<string, unknown>
): FSWatcher {
  return new FSWatcher()
}

const chokidar = { watch, FSWatcher }
export default chokidar
