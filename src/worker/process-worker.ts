/// <reference lib="webworker" />

import { Buffer } from 'buffer'
import { process as processShim, ExitSignal } from './shims/process'

globalThis.Buffer = Buffer
globalThis.process = processShim
globalThis.global = globalThis

if (!(globalThis as Record<string, unknown>).setImmediate) {
  (globalThis as Record<string, unknown>).setImmediate = (fn: (...args: unknown[]) => void, ...args: unknown[]) =>
    setTimeout(() => fn(...args), 0)
  ;(globalThis as Record<string, unknown>).clearImmediate = (id: ReturnType<typeof setTimeout>) =>
    clearTimeout(id)
}

import { vol, memfsInstance } from './vfs'
import { setStdout, setStderr, setCwd, runCommand } from './terminal-cmd'
import { bindRequireSync } from './shims/sync-registry'
import { bindTerminalDeps } from './terminal-cmd'
import { install } from './npm'
import { attachJournalSender } from './fs-journal'
import { threadState, NodeMessagePort } from './shims/worker-threads'

let _initialized = false

async function ensureRuntime(): Promise<void> {
  if (_initialized) return
  const loader = await import('./loader')
  bindRequireSync(loader.requireSync, loader.resolveModule, loader.resolveModuleInVfs)
  bindTerminalDeps(loader.requireSync, install)
  await loader.preloadShims()
  _initialized = true
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data
  if (msg.type !== 'init') return

  if (msg.vfsSnapshot) {
    vol.fromJSON(msg.vfsSnapshot)
  }

  if (msg.cwd) {
    processShim.cwd = () => msg.cwd
    setCwd(msg.cwd)
  }

  if (msg.env) {
    Object.assign(processShim.env, msg.env)
  }

  const port: MessagePort = msg.port

  await ensureRuntime()

  if (msg.mode === 'worker_thread') {
    // Node worker_threads: expose parentPort/workerData/isMainThread, run the
    // module, and propagate this thread's fs writes back to the parent vol.
    const parentPort = new NodeMessagePort(msg.threadPort as MessagePort)
    threadState.isMainThread = false
    threadState.parentPort = parentPort
    threadState.workerData = msg.workerData
    threadState.threadId = msg.threadId ?? 1
    attachJournalSender(memfsInstance as unknown as Record<string, unknown>, (entry) => parentPort.postJournal(entry))
    const loader = await import('./loader')
    try {
      loader.requireSync(msg.modulePath, msg.cwd || '/app')
      self.postMessage({ type: 'exit', code: Number(processShim.exitCode ?? 0) })
    } catch (e) {
      if (e instanceof ExitSignal) { self.postMessage({ type: 'exit', code: e.code }); self.close(); return }
      self.postMessage({ type: 'error', message: (e as Error).message || String(e) })
      self.postMessage({ type: 'exit', code: 1 })
    }
    return
  }

  // exec/spawn/fork: propagate the child's fs writes back to the parent vol.
  attachJournalSender(memfsInstance as unknown as Record<string, unknown>, (entry) => port.postMessage({ type: 'fs-journal', entry }))

  if (msg.mode === 'fork') {
    const ipcPort: MessagePort = msg.ipcPort
    const loader = await import('./loader')

    // Wire process.send() and process.on('message') for IPC
    processShim._sendPort = ipcPort
    ipcPort.onmessage = (e: MessageEvent) => {
      const data = e.data
      if (data.type === 'message') {
        processShim.emit('message', data.data)
      } else if (data.type === 'disconnect') {
        processShim.emit('disconnect')
        ipcPort.close()
      }
    }
    ipcPort.start()

    setStdout((text: string) => port.postMessage({ type: 'stdout', text }))
    setStderr((text: string) => port.postMessage({ type: 'stderr', text }))

    try {
      loader.requireSync(msg.modulePath, msg.cwd || '/app')
      port.postMessage({ type: 'exit', code: Number(processShim.exitCode ?? 0) })
      port.close()
    } catch (e) {
      if (e instanceof ExitSignal) {
        // A child worker really terminates: report the code, then close self.
        port.postMessage({ type: 'exit', code: e.code })
        port.close()
        self.close()
        return
      }
      const errMsg = (e as Error).message || String(e)
      port.postMessage({ type: 'stderr', text: errMsg + '\n' })
      port.postMessage({ type: 'exit', code: 1 })
      port.close()
    }
    return
  }

  setStdout((text: string) => port.postMessage({ type: 'stdout', text }))
  setStderr((text: string) => port.postMessage({ type: 'stderr', text }))

  try {
    const exitCode = await runCommand(msg.command)
    port.postMessage({ type: 'exit', code: exitCode })
    port.close()
  } catch (e) {
    port.postMessage({ type: 'exit', code: e instanceof ExitSignal ? e.code : 1 })
    port.close()
    if (e instanceof ExitSignal) self.close()
  }
}

// process.exit() from async callbacks (timers, promises) can't be caught at the
// dispatch boundary — recognize the ExitSignal here and really terminate.
self.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
  if (ev.reason instanceof ExitSignal) { ev.preventDefault(); self.close() }
})
self.addEventListener('error', (ev: ErrorEvent) => {
  if (ev.error instanceof ExitSignal) { ev.preventDefault(); self.close() }
})
