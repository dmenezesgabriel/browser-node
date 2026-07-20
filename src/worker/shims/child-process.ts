import { EventEmitter } from './events'
import { Readable, Writable, PassThrough } from './stream'
import { vol } from '../vfs'
import { applyJournalEntry } from '../fs-journal'
import { runCommandSync } from '../terminal-cmd'

// ── Types ────────────────────────────────────────────────────────────────────

interface ExecOptions {
  cwd?: string
  env?: Record<string, string>
  encoding?: string
  timeout?: number
  maxBuffer?: number
  shell?: boolean | string
}

interface ExecSyncOptions extends ExecOptions {}

interface SpawnOptions {
  cwd?: string
  env?: Record<string, string>
  stdio?: Array<'pipe' | 'ignore' | 'inherit'> | string
  shell?: boolean | string
}

interface SpawnSyncOptions extends SpawnOptions {
  encoding?: string
  maxBuffer?: number
  timeout?: number
}

interface ForkOptions {
  cwd?: string
  env?: Record<string, string>
  execPath?: string
  execArgv?: string[]
  silent?: boolean
  stdio?: Array<'pipe' | 'ignore' | 'inherit' | 'ipc'> | string
}

interface SpawnSyncResult {
  pid: number
  output: Array<Buffer | null>
  stdout: Buffer | string
  stderr: Buffer | string
  status: number | null
  signal: string | null
  error?: Error
}

// ── ProcessManager ───────────────────────────────────────────────────────────

class ProcessManager {
  private _nextPid = 42
  private _processes = new Map<number, ChildProcess>()

  _allocPid(): number {
    return this._nextPid++
  }

  _register(cp: ChildProcess): void {
    this._processes.set(cp.pid, cp)
  }

  _unregister(cp: ChildProcess): void {
    this._processes.delete(cp.pid)
  }
}

const _pm = new ProcessManager()

// ── ChildProcess ─────────────────────────────────────────────────────────────

export class ChildProcess extends EventEmitter {
  pid: number
  stdout: Readable
  stderr: Readable
  stdin: Writable
  exitCode: number | null = null
  signalCode: string | null = null
  killed = false

  _worker: Worker | null = null
  private _port: MessagePort | null = null
  _channel: MessagePort | null = null

  constructor(pid: number) {
    super()
    this.pid = pid
    this.stdout = new PassThrough()
    this.stderr = new PassThrough()
    this.stdin = new Writable({ write: () => {} })
  }

  kill(_signal?: string): boolean {
    this.killed = true
    this._worker?.terminate()
    this._worker = null
    this._channel?.close()
    this._channel = null
    return true
  }

  get connected(): boolean { return this._worker !== null }

  ref(): this { return this }
  unref(): this { return this }

  send(message: unknown, callback?: (error: Error | null) => void): boolean {
    if (!this._channel) return false
    try {
      this._channel.postMessage(message)
      callback?.(null)
      return true
    } catch (e) {
      callback?.(e as Error)
      return false
    }
  }

  disconnect(): void {
    if (this._channel) {
      this._channel.close()
      this._channel = null
    }
    this.kill()
  }
}

// ── Inline execSync (runs command in current context, no separate Worker) ────

function _runSync(command: string, options?: ExecSyncOptions): { stdout: string; stderr: string; status: number } {
  const result = runCommandSync(command, options?.cwd)
  return { stdout: result.stdout, stderr: result.stderr, status: result.code }
}

// ── Public API ───────────────────────────────────────────────────────────────

export function exec(
  command: string,
  options?: ExecOptions | ((err: Error | null, stdout?: string, stderr?: string) => void),
  callback?: (err: Error | null, stdout?: string, stderr?: string) => void
): ChildProcess {
  let opts: ExecOptions = {}
  let cb: ((err: Error | null, stdout?: string, stderr?: string) => void) | undefined

  if (typeof options === 'function') {
    cb = options
  } else if (options) {
    opts = options
    cb = callback
  }

  const pid = _pm._allocPid()
  const cp = new ChildProcess(pid)

  const { port1, port2 } = new MessageChannel()
  const snapshot = vol.toJSON()
  const cwd = opts?.cwd ?? ((globalThis as Record<string, unknown>).process as Record<string, unknown>)?.cwd?.() as string ?? '/app'

  let stdoutBuf = ''
  let stderrBuf = ''

  port1.onmessage = (e: MessageEvent) => {
    const msg = e.data
    if (msg.type === 'stdout') {
      stdoutBuf += msg.text
      cp.stdout.emit('data', Buffer.from(msg.text))
    } else if (msg.type === 'stderr') {
      stderrBuf += msg.text
      cp.stderr.emit('data', Buffer.from(msg.text))
    } else if (msg.type === 'fs-journal') {
      applyJournalEntry(vol as unknown as Record<string, unknown>, msg.entry)
    } else if (msg.type === 'exit') {
      port1.close()
      cp.exitCode = msg.code
      cp.stdout.emit('end')
      cp.stderr.emit('end')
      cp.emit('exit', msg.code, null)
      cp.emit('close', msg.code, null)
      cp._worker?.terminate()
      if (cb) {
        cb(msg.code !== 0 ? new Error(`Command failed: exit code ${msg.code}\n${stderrBuf || stdoutBuf}`) : null, stdoutBuf, stderrBuf)
      }
    }
  }
  port1.start()

  const worker = new Worker(
    new URL('../process-worker.ts', import.meta.url),
    { type: 'module', name: `cp-async` }
  )
  cp._worker = worker

  worker.onerror = (err) => {
    port1.close()
    const msg = `[cp-worker-error] ${err.message}`
    cp.stdout.emit('data', Buffer.from(msg))
    cp.stdout.emit('end')
    cp.stderr.emit('end')
    cp.exitCode = -2
    cp.emit('exit', -2, null)
    cp.emit('close', -2, null)
    if (cb) cb(new Error(msg), stdoutBuf, stderrBuf)
  }

  worker.postMessage(
    { type: 'init', mode: 'async', port: port2, command, cwd, env: opts?.env ?? undefined, vfsSnapshot: snapshot },
    [port2]
  )

  _pm._register(cp)
  return cp
}

export function execSync(command: string, options?: ExecSyncOptions): Buffer {
  const { stdout, stderr, status } = _runSync(command, options)

  if (status !== 0) {
    const errMsg = stderr || stdout
    const err = new Error(errMsg ? `Command failed: ${errMsg}` : `Command failed with exit code ${status}`) as Error & { code: number; killed: boolean; signal: null; cmd: string; stdout: Buffer; stderr: Buffer }
    err.code = status
    err.killed = false
    err.signal = null
    err.cmd = command
    err.stdout = Buffer.from(stdout)
    err.stderr = Buffer.from(stderr)
    throw err
  }

  if (options?.encoding === 'utf8' || options?.encoding === 'utf-8') {
    return stdout as unknown as Buffer
  }

  return Buffer.from(stdout)
}

export function spawn(
  command: string,
  args?: string[] | SpawnOptions,
  options?: SpawnOptions
): ChildProcess {
  let cmdArgs: string[] = []
  let opts: SpawnOptions = {}

  if (Array.isArray(args)) {
    cmdArgs = args
    opts = options ?? {}
  } else if (args && typeof args === 'object') {
    opts = args
  }

  const fullCmd = cmdArgs.length > 0 ? `${command} ${cmdArgs.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}` : command
  return exec(fullCmd, opts, undefined)
}

export function spawnSync(
  command: string,
  args?: string[] | SpawnSyncOptions,
  options?: SpawnSyncOptions
): SpawnSyncResult {
  let cmdArgs: string[] = []
  let opts: SpawnSyncOptions = {}

  if (Array.isArray(args)) {
    cmdArgs = args
    opts = options ?? {}
  } else if (args && typeof args === 'object') {
    opts = args
  }

  const fullCmd = cmdArgs.length > 0 ? `${command} ${cmdArgs.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}` : command
  const { stdout, stderr, status } = _runSync(fullCmd, opts)

  const stdoutBuf = Buffer.from(stdout)
  const stderrBuf = Buffer.from(stderr)

  if (status !== 0) {
    const err = new Error(`Command failed: ${stderr || stdout}`) as Error & { code: number; killed: boolean; signal: null; cmd: string; stdout: Buffer; stderr: Buffer }
    err.code = status
    err.killed = false
    err.signal = null
    err.cmd = fullCmd
    err.stdout = stdoutBuf
    err.stderr = stderrBuf
    return {
      pid: 0,
      output: [null, stdoutBuf, stderrBuf],
      stdout: opts.encoding ? stdout : stdoutBuf,
      stderr: opts.encoding ? stderr : stderrBuf,
      status,
      signal: null,
      error: err,
    }
  }

  return {
    pid: 0,
    output: [null, stdoutBuf, stderrBuf],
    stdout: opts.encoding ? stdout : stdoutBuf,
    stderr: opts.encoding ? stderr : stderrBuf,
    status,
    signal: null,
  }
}

export function execFile(
  file: string,
  args?: string[] | ExecOptions | ((err: Error | null, stdout?: string, stderr?: string) => void),
  options?: ExecOptions | ((err: Error | null, stdout?: string, stderr?: string) => void),
  callback?: (err: Error | null, stdout?: string, stderr?: string) => void
): ChildProcess {
  let cmdArgs: string[] = []
  let opts: ExecOptions = {}
  let cb: ((err: Error | null, stdout?: string, stderr?: string) => void) | undefined

  if (Array.isArray(args)) {
    cmdArgs = args
    if (typeof options === 'function') {
      cb = options
    } else if (options) {
      opts = options as ExecOptions
      cb = callback
    }
  } else if (typeof args === 'function') {
    cb = args
  } else if (args) {
    opts = args as ExecOptions
    cb = options as typeof cb
  }

  const command = cmdArgs.length > 0 ? `${file} ${cmdArgs.join(' ')}` : file
  return exec(command, opts, cb)
}

export function fork(modulePath: string, args?: string[] | ForkOptions, options?: ForkOptions): ChildProcess {
  let cmdArgs: string[] = []
  let opts: ForkOptions = {}

  if (Array.isArray(args)) {
    cmdArgs = args
    opts = options ?? {}
  } else if (args && typeof args === 'object') {
    opts = args
  }

  const pid = _pm._allocPid()
  const cp = new ChildProcess(pid)

  // IPC channel for process.send()/process.on('message')
  const { port1: ipcPort1, port2: ipcPort2 } = new MessageChannel()

  // Stdio channel
  const { port1, port2 } = new MessageChannel()
  const snapshot = vol.toJSON()
  const cwd = opts?.cwd ?? ((globalThis as Record<string, unknown>).process as Record<string, unknown>)?.cwd?.() as string ?? '/app'

  port1.onmessage = (e: MessageEvent) => {
    const msg = e.data
    if (msg.type === 'stdout') {
      cp.stdout.emit('data', Buffer.from(msg.text))
    } else if (msg.type === 'stderr') {
      cp.stderr.emit('data', Buffer.from(msg.text))
    } else if (msg.type === 'fs-journal') {
      applyJournalEntry(vol as unknown as Record<string, unknown>, msg.entry)
    } else if (msg.type === 'exit') {
      port1.close()
      ipcPort1.close()
      cp.exitCode = msg.code
      cp.stdout.emit('end')
      cp.stderr.emit('end')
      cp.emit('exit', msg.code, null)
      cp.emit('close', msg.code, null)
      cp._worker?.terminate()
    }
  }
  port1.start()

  // Forward IPC messages from child → parent as 'message' events
  ipcPort1.onmessage = (e: MessageEvent) => {
    const msg = e.data
    if (msg.type === 'message') {
      cp.emit('message', msg.data)
    }
  }
  ipcPort1.start()

  cp._channel = ipcPort1

  const worker = new Worker(
    new URL('../process-worker.ts', import.meta.url),
    { type: 'module', name: `cp-fork` }
  )
  cp._worker = worker

  worker.onerror = (err) => {
    port1.close()
    ipcPort1.close()
    const msg = `[cp-worker-error] ${err.message}`
    cp.stdout.emit('data', Buffer.from(msg))
    cp.stdout.emit('end')
    cp.stderr.emit('end')
    cp.exitCode = -2
    cp.emit('exit', -2, null)
    cp.emit('close', -2, null)
  }

  worker.postMessage(
    {
      type: 'init',
      mode: 'fork',
      port: port2,
      ipcPort: ipcPort2,
      modulePath,
      args: cmdArgs,
      cwd,
      env: opts?.env ?? undefined,
      vfsSnapshot: snapshot,
    },
    [port2, ipcPort2]
  )

  _pm._register(cp)
  return cp
}
