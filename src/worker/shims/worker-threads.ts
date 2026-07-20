// Real (feasible-subset) worker_threads: a Worker spawns process-worker.ts in
// 'worker_thread' mode with its own VFS snapshot + workerData, and messages are
// bridged over a MessagePort. The child's fs mutations flow back to the parent
// via the fs-journal (child→parent eventual consistency). Not implemented:
// SharedArrayBuffer transfer, synchronous receiveMessageOnPort, resourceLimits.
import { EventEmitter } from './events'
import { vol } from '../vfs'
import { applyJournalEntry } from '../fs-journal'

// Populated by process-worker.ts when it runs in worker_thread mode, and read
// back through the module exports (isMainThread/parentPort/workerData/threadId).
export const threadState = {
  isMainThread: true,
  parentPort: null as NodeMessagePort | null,
  workerData: null as unknown,
  threadId: 0,
}

let _nextThreadId = 1

type FsLike = Record<string, unknown>

/**
 * Node-style EventEmitter over a Web MessagePort. Traffic is enveloped so user
 * postMessage() and internal fs-journal entries share one port without clashing.
 * When applyJournalTo is set (the parent side), journal envelopes are applied to
 * that volume instead of surfacing as 'message' events.
 */
export class NodeMessagePort extends EventEmitter {
  constructor(private _port: MessagePort, private _applyJournalTo?: FsLike) {
    super()
    this._port.onmessage = (e: MessageEvent) => {
      const env = e.data
      if (env && env.kind === 'journal') {
        if (this._applyJournalTo) applyJournalEntry(this._applyJournalTo, env.entry)
        return
      }
      if (env && env.kind === 'user') this.emit('message', env.data)
    }
    this._port.start?.()
  }
  postMessage(value: unknown): void { this._port.postMessage({ kind: 'user', data: value }) }
  postJournal(entry: unknown): void { this._port.postMessage({ kind: 'journal', entry }) }
  close(): void { this._port.close() }
  start(): void { this._port.start?.() }
  ref(): this { return this }
  unref(): this { return this }
}

export interface WorkerOptions { workerData?: unknown }

export class Worker extends EventEmitter {
  threadId: number
  private _worker: globalThis.Worker
  private _port: NodeMessagePort

  constructor(filename: string, options?: WorkerOptions) {
    super()
    this.threadId = _nextThreadId++
    const { port1, port2 } = new MessageChannel()
    // Parent side of the bridge: apply the child's journal to our vol, surface
    // user messages as 'message' events on this Worker.
    this._port = new NodeMessagePort(port1, vol as unknown as FsLike)
    this._port.on('message', (data: unknown) => this.emit('message', data))

    this._worker = new globalThis.Worker(new URL('../process-worker.ts', import.meta.url), { type: 'module' })
    this._worker.onerror = (err) => this.emit('error', err instanceof ErrorEvent ? new Error(err.message) : new Error(String(err)))
    this._worker.onmessage = (e: MessageEvent) => {
      if (e.data?.type === 'exit') {
        this.emit('exit', e.data.code ?? 0)
        this._worker.terminate()
      } else if (e.data?.type === 'error') {
        this.emit('error', new Error(e.data.message))
      }
    }
    this._worker.postMessage({
      type: 'init',
      mode: 'worker_thread',
      modulePath: filename,
      workerData: options?.workerData ?? null,
      threadPort: port2,
      threadId: this.threadId,
      vfsSnapshot: vol.toJSON(),
    }, [port2])
  }

  postMessage(value: unknown): void { this._port.postMessage(value) }
  terminate(): Promise<number> { this._worker.terminate(); this.emit('exit', 1); return Promise.resolve(1) }
  ref(): this { return this }
  unref(): this { return this }
}

// Node re-exports the Web MessageChannel/MessagePort shapes; the browser ones
// are compatible for the transfer + onmessage usage worker_threads users rely on.
const workerThreads = {
  Worker,
  MessageChannel,
  MessagePort,
  get isMainThread() { return threadState.isMainThread },
  get parentPort() { return threadState.parentPort },
  get workerData() { return threadState.workerData },
  get threadId() { return threadState.threadId },
  receiveMessageOnPort: () => undefined,
  SHARE_ENV: Symbol('SHARE_ENV'),
  setEnvironmentData: () => {},
  getEnvironmentData: () => undefined,
}

export default workerThreads
