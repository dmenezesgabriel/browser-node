/// <reference lib="webworker" />
// Bootstrap Node.js globals FIRST so packages that rely on them as globals find them.
import * as _bufMod from 'buffer'
import { process as _process } from './shims/process'
const _g = globalThis as unknown as Record<string, unknown>
const _Buffer = _bufMod.Buffer
// buffer npm package doesn't export MAX_STRING_LENGTH; pino/fastify need it
;(_Buffer as Record<string, unknown>).MAX_STRING_LENGTH = 4294967296
_g.Buffer = _Buffer
_g.process = _process
_g.global = _g
// Node.js globals not present in browsers
_g.setImmediate = (fn: (...args: unknown[]) => void, ...args: unknown[]) => setTimeout(() => fn(...args), 0)
_g.clearImmediate = (id: ReturnType<typeof setTimeout>) => clearTimeout(id)

// Wrap setTimeout/setInterval to return Node.js-compatible Timeout objects with .unref()/.ref()
// Vite and other packages call timer.unref() to allow process exit; browsers return bare numbers.
class _TimerHandle {
  _id: ReturnType<typeof _origSetTimeout>
  constructor(id: ReturnType<typeof _origSetTimeout>) { this._id = id }
  unref(): this { return this }
  ref(): this { return this }
  [Symbol.toPrimitive]() { return this._id }
}
const _origSetTimeout = globalThis.setTimeout.bind(globalThis)
const _origSetInterval = globalThis.setInterval.bind(globalThis)
const _origClearTimeout = globalThis.clearTimeout.bind(globalThis)
const _origClearInterval = globalThis.clearInterval.bind(globalThis)
;(globalThis as unknown as Record<string, unknown>).setTimeout = (fn: TimerHandler, ms?: number, ...args: unknown[]) =>
  new _TimerHandle(_origSetTimeout(fn, ms, ...args))
;(globalThis as unknown as Record<string, unknown>).setInterval = (fn: TimerHandler, ms?: number, ...args: unknown[]) =>
  new _TimerHandle(_origSetInterval(fn, ms, ...args))
;(globalThis as unknown as Record<string, unknown>).clearTimeout = (h: _TimerHandle | number | undefined) =>
  _origClearTimeout(h instanceof _TimerHandle ? h._id : h as number)
;(globalThis as unknown as Record<string, unknown>).clearInterval = (h: _TimerHandle | number | undefined) =>
  _origClearInterval(h instanceof _TimerHandle ? h._id : h as number)

// Redirect console output to the shell terminal so npm/Vite logs are visible
const _fmtArgs = (...args: unknown[]) => args.map(a => typeof a === 'string' ? a : (a instanceof Error ? a.stack ?? a.message : JSON.stringify(a, null, 2))).join(' ') + '\n'
console.log = (...args: unknown[]) => self.postMessage({ type: 'stdout', text: _fmtArgs(...args) })
console.info = console.log
console.warn = (...args: unknown[]) => self.postMessage({ type: 'stderr', text: _fmtArgs(...args) })
console.error = (...args: unknown[]) => self.postMessage({ type: 'stderr', text: _fmtArgs(...args) })
console.debug = console.log

self.addEventListener('unhandledrejection', (event) => {
  console.error('[worker:unhandledRejection]', event.reason?.message || event.reason)
  if (event.reason?.stack) console.error(event.reason.stack)
})
self.addEventListener('error', (event) => {
  console.error('[worker:uncaughtException]', event.error?.message || event.error)
  if (event.error?.stack) console.error(event.error.stack)
})

import { preloadShims, requireSync, resolveModule, clearModuleCache, registerFileOverride } from './loader'
import { bindRequireSync } from './shims/index'
import { install } from './npm'
import { writeFileToVfs, dumpVfs, memfsInstance } from './vfs'
import { getServer } from './shims/http'
import { bindTerminalDeps, runCommand, getCwd } from './terminal-cmd'
import { initExamples } from './examples'

// Override Function constructor to support dynamic imports (bare specifiers) inside evaluated code
const OriginalFunction = globalThis.Function
function CustomFunction(this: any, ...args: string[]) {
  const body = args[args.length - 1]
  if (typeof body === 'string' && (body.includes('return import(') || body.includes('return import(modulePath)'))) {
    return function(modulePath: string) {
      try {
        const cwd = getCwd ? getCwd() : '/app'
        const res = requireSync(modulePath, cwd)
        return Promise.resolve(res)
      } catch (err) {
        return Promise.reject(err)
      }
    }
  }
  
  if (!(this instanceof CustomFunction)) {
    return OriginalFunction(...args)
  }
  return Reflect.construct(OriginalFunction, args, new.target)
}
CustomFunction.prototype = OriginalFunction.prototype
globalThis.Function = CustomFunction as any

// Wire up createRequire in the node:module shim (can't import requireSync there — circular)
bindRequireSync(requireSync, resolveModule)

function log(text: string) { self.postMessage({ type: 'stdout', text }) }
function err(text: string) { self.postMessage({ type: 'stderr', text }) }

async function init() {
  log('[runtime] Initializing shims...\n')
  await preloadShims()
  bindTerminalDeps(requireSync, install)
  _registerPostInstallOverrides()
  initExamples()
  try {
    const { initBuild } = await import('./build')
    await initBuild()
  } catch (e) {
    err(`[runtime] esbuild init failed: ${(e as Error).message}\n`)
  }
  log('[runtime] Ready.\n')
  self.postMessage({ type: 'ready' })
}

// Set up a MessagePort from the shell so the SW can send HTTP requests here
function attachSwPort(port: MessagePort) {
  port.addEventListener('message', (e: MessageEvent) => {
    const msg = e.data
    if (msg?.type !== 'http-request') return
    const server = getServer(msg.listenPort ?? 3000)
    if (!server) {
      msg.replyPort.postMessage({
        status: 503,
        headers: { 'content-type': 'text/html' },
        body: `<p>No server on port ${msg.listenPort}. Run your code first.</p>`,
      })
      return
    }
    server.handleRequest({
      method: msg.method,
      url: msg.url,
      headers: msg.headers ?? {},
      body: msg.body,
      replyPort: msg.replyPort,
    })
  })
  port.start()
}

function _registerPostInstallOverrides() {
  // Next.js SWC stub: intercept the SWC binary loader so Next.js starts without native binaries.
  // We provide a minimal API sufficient for the dev server to start and handle requests.
  const swcStub = () => {
    const noop = () => {}
    const asyncNoop = () => Promise.resolve(null)
    const stub = {
      getTargetTriple: () => 'x86_64-unknown-linux-gnu',
      transform: (_src: unknown, _isModule: unknown, _opts: unknown) =>
        Promise.resolve({ code: typeof _src === 'string' ? _src : '' }),
      transformSync: (_src: unknown, _isModule: unknown, _opts: unknown) => {
        const code = typeof _src === 'string' ? _src : ''
        const enc = new TextEncoder()
        const bytes = enc.encode(JSON.stringify({ code }))
        return bytes
      },
      minify: asyncNoop,
      minifySync: noop,
      parse: asyncNoop,
      mdxCompile: asyncNoop,
      mdxCompileSync: noop,
      lightningCssTransform: asyncNoop,
      lightningCssTransformStyleAttribute: asyncNoop,
      lightningcssFeatureNamesToMaskNapi: asyncNoop,
      isReactCompilerRequired: () => false,
      getModuleNamedExports: asyncNoop,
      warnForEdgeRuntime: asyncNoop,
      expandNextJsTemplate: asyncNoop,
      lockfileTryAcquire: (_path: unknown, _content: unknown) => Promise.resolve(42 as unknown), // 42 = fake lock handle
      lockfileTryAcquireSync: (_path: unknown, _content: unknown) => 42 as unknown, // non-null = lock acquired
      lockfileUnlock: asyncNoop,
      lockfileUnlockSync: noop,
      codeFrameColumns: () => null,
      initCustomTraceSubscriber: noop,
      teardownTraceSubscriber: noop,
      // Turbopack stubs — project lifecycle methods
      projectNew: (_opts: unknown) => Promise.resolve(1 as unknown), // fake project handle
      projectUpdate: asyncNoop,
      projectWriteAnalyzeData: asyncNoop,
      projectWriteAllEntrypointsToDisk: asyncNoop,
      projectEntrypointsSubscribe: (_proj: unknown, cb: (err: null, data: unknown) => void) => {
        setTimeout(() => cb(null, { type: 'SubscriptionResult', result: { pages: [] } }), 100)
        return { dispose: noop }
      },
      projectHmrEvents: asyncNoop,
      projectHmrChunkNamesSubscribe: asyncNoop,
      projectTraceSource: asyncNoop,
      projectGetSourceForAsset: asyncNoop,
      projectGetSourceMap: asyncNoop,
      projectGetSourceMapSync: noop,
      projectUpdateInfoSubscribe: asyncNoop,
      projectCompilationEventsSubscribe: asyncNoop,
      projectInvalidateFileSystemCache: asyncNoop,
      projectShutdown: asyncNoop,
      projectOnExit: asyncNoop,
      endpointWriteToDisk: asyncNoop,
      endpointClientChangedSubscribe: asyncNoop,
      endpointServerChangedSubscribe: asyncNoop,
      rootTaskDispose: noop,
      registerWorkerScheduler: noop,
      startTurbopackTraceServer: noop,
    }
    return stub
  }

  // createDefineEnv — exported from next/dist/build/swc; used by Turbopack to define env vars
  const createDefineEnvStub = (_opts: unknown) => ({})

  const swcLoaderStub = () => {
    const binding = swcStub()
    const loadedBindings: unknown = {
      isWasm: false,  // set false so Turbopack can run (turbopack disabled via next.config.js)
      target: 'x86_64-unknown-linux-gnu',
      transform: binding.transform,
      transformSync: binding.transformSync,
      minify: binding.minify,
      minifySync: binding.minifySync,
      parse: binding.parse,
      getTargetTriple: binding.getTargetTriple,
      initCustomTraceSubscriber: binding.initCustomTraceSubscriber,
      teardownTraceSubscriber: binding.teardownTraceSubscriber,
      mdx: { compile: binding.mdxCompile, compileSync: binding.mdxCompileSync },
      css: {
        lightning: {
          transform: binding.lightningCssTransform,
          transformStyleAttr: binding.lightningCssTransformStyleAttribute,
          featureNamesToMask: binding.lightningcssFeatureNamesToMaskNapi,
        },
      },
      reactCompiler: { isReactCompilerRequired: binding.isReactCompilerRequired },
      rspack: { getModuleNamedExports: binding.getModuleNamedExports, warnForEdgeRuntime: binding.warnForEdgeRuntime },
      lockfileTryAcquire: binding.lockfileTryAcquire,
      lockfileTryAcquireSync: binding.lockfileTryAcquireSync,
      lockfileUnlock: binding.lockfileUnlock,
      lockfileUnlockSync: binding.lockfileUnlockSync,
      expandNextJsTemplate: binding.expandNextJsTemplate,
      codeFrameColumns: binding.codeFrameColumns,
      turbo: {
        createProject: (_opts: unknown, _turboOpts: unknown, _callbacks: unknown) => {
          // Subscription that yields one empty "no issues, no routes" event to unblock
          // Next.js's `await currentEntriesHandling`, then blocks forever.
          const blockingSubscription = (firstEvent?: unknown) => () => {
            let step = 0
            return {
              next: (): Promise<IteratorResult<unknown>> => {
                if (firstEvent !== undefined && step === 0) {
                  step = 1
                  return Promise.resolve({ done: false as const, value: firstEvent })
                }
                return new Promise<IteratorResult<unknown>>(() => {}) // block forever
              },
              return: () => Promise.resolve({ done: true as const, value: undefined }),
              [Symbol.asyncIterator]() { return this as unknown as AsyncIterator<unknown> },
            }
          }
          const project = {
            update: () => Promise.resolve(null),
            writeAnalyzeData: () => Promise.resolve(null),
            writeAllEntrypointsToDisk: () => Promise.resolve(null),
            // Yield { issues: [] } (no `routes` key) so Next.js calls currentEntriesHandlingResolve()
            entrypointsSubscribe: blockingSubscription({ issues: [] }),
            compilationEventsSubscribe: blockingSubscription(),
            hmrEvents: blockingSubscription(),
            hmrChunkNamesSubscribe: blockingSubscription(),
            traceSource: () => Promise.resolve(null),
            getSourceForAsset: () => Promise.resolve(null),
            getSourceMap: () => Promise.resolve(null),
            getSourceMapSync: () => null,
            updateInfoSubscribe: blockingSubscription(),
            invalidateFileSystemCache: () => Promise.resolve(null),
            shutdown: () => Promise.resolve(null),
            onExit: () => Promise.resolve(null),
          }
          return Promise.resolve(project)
        },
      },
    }
    return {
      loadBindings: () => Promise.resolve(loadedBindings),
      loadBindingsSync: () => loadedBindings,
      getBindings: () => loadedBindings,
      getBindingsSync: () => loadedBindings,
      isWasm: () => false,
      transform: binding.transform,
      transformSync: binding.transformSync,
      minify: binding.minify,
      minifySync: binding.minifySync,
      parse: binding.parse,
      getTargetTriple: binding.getTargetTriple,
      initCustomTraceSubscriber: binding.initCustomTraceSubscriber,
      teardownTraceSubscriber: binding.teardownTraceSubscriber,
      // Named exports used by Turbopack hot reloader
      createDefineEnv: createDefineEnvStub,
      lockfilePatchPromise: { cur: Promise.resolve() },
      getModuleNamedExports: binding.getModuleNamedExports,
      warnForEdgeRuntime: binding.warnForEdgeRuntime,
    }
  }

  registerFileOverride('/node_modules/next/dist/build/swc/index.js', swcLoaderStub)

  // Force Vite to use our esbuild shim instead of the npm package
  registerFileOverride('/node_modules/esbuild/package.json', () => ({ name: 'esbuild', version: '0.24.2', main: 'lib/main.js' }))
  registerFileOverride('/node_modules/esbuild/lib/main.js', () => requireSync('esbuild', '/app'))
}

self.addEventListener('message', async (e: MessageEvent) => {
  const { type, ...payload } = e.data ?? {}

  if (type === 'register-server-port') {
    // Shell gives us a MessagePort per registered server; SW sends requests through it
    attachSwPort(payload.workerPort as MessagePort)
    return
  }

  if (type === 'run') {
    const { code, filename = '/app/index.js' } = payload
    clearModuleCache()
    log('\n')
    try {
      writeFileToVfs(filename, code)
      requireSync(filename, '/app')
    } catch (e) {
      err(`\n[error] ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`)
    }
    return
  }

  if (type === 'npm-install') {
    const { packages } = payload as { packages: Record<string, string> }
    try {
      await install(packages)
    } catch (e) {
      err(`\n[npm error] ${String(e)}\n`)
    }
    // After install, register file-path overrides for packages that require native binaries.
    _registerPostInstallOverrides()
    self.postMessage({ type: 'npm-done' })
    return
  }

  if (e.data.type === 'run-command') {
    runCommand(e.data.cmd).catch((e: any) => err(e.message))
    return
  }
  if (type === 'write-file') {
    writeFileToVfs(payload.path, payload.content)
    return
  }

  if (type === 'vfs-dump') {
    self.postMessage({ type: 'vfs-dump-result', tree: dumpVfs() })
    return
  }

  if (type === 'terminal-cmd') {
    const { cmdline } = payload as { cmdline: string }
    try {
      const exitCode = await runCommand(cmdline)
      self.postMessage({ type: 'terminal-done', exitCode, cwd: getCwd() })
    } catch (e) {
      err(`[terminal] ${(e as Error).message}\n`)
      self.postMessage({ type: 'terminal-done', exitCode: 1, cwd: getCwd() })
    }
    return
  }

  if (type === 'vfs-list') {
    const { path = '/' } = payload as { path?: string }
    try {
      const entries = (memfsInstance.readdirSync(path) as string[]).map(name => {
        const fp = path === '/' ? '/' + name : path + '/' + name
        let isDir = false
        try { isDir = (memfsInstance.statSync(fp) as { isDirectory(): boolean }).isDirectory() } catch {}
        return { name, isDir }
      })
      self.postMessage({ type: 'vfs-list-result', path, entries })
    } catch {
      self.postMessage({ type: 'vfs-list-result', path, entries: [] })
    }
    return
  }

  if (type === 'vfs-read') {
    const { path } = payload as { path: string }
    try {
      const content = memfsInstance.readFileSync(path, 'utf-8') as string
      self.postMessage({ type: 'vfs-read-result', path, content })
    } catch (e) {
      self.postMessage({ type: 'vfs-read-result', path, content: null, error: (e as Error).message })
    }
    return
  }
})

init().catch(e => err(`[fatal] ${e}\n`))
