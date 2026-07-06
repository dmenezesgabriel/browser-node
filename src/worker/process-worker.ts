/// <reference lib="webworker" />

import { Buffer } from 'buffer'
import { process as processShim } from './shims/process'

globalThis.Buffer = Buffer
globalThis.process = processShim
globalThis.global = globalThis

if (!(globalThis as Record<string, unknown>).setImmediate) {
  (globalThis as Record<string, unknown>).setImmediate = (fn: (...args: unknown[]) => void, ...args: unknown[]) =>
    setTimeout(() => fn(...args), 0)
  ;(globalThis as Record<string, unknown>).clearImmediate = (id: ReturnType<typeof setTimeout>) =>
    clearTimeout(id)
}

import { vol } from './vfs'
import { setStdout, setStderr, setCwd, runCommand } from './terminal-cmd'
import { bindRequireSync } from './shims/sync-registry'
import { bindTerminalDeps } from './terminal-cmd'
import { install } from './npm'

let _initialized = false

async function ensureRuntime(): Promise<void> {
  if (_initialized) return
  const loader = await import('./loader')
  bindRequireSync(loader.requireSync, loader.resolveModule)
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
      port.postMessage({ type: 'exit', code: 0 })
      port.close()
    } catch (e) {
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
    port.postMessage({ type: 'exit', code: 1 })
    port.close()
  }
}
