// esbuild shim backed by esbuild-wasm — intercepts require('esbuild') from Vite
// so Vite's transform/bundling calls go through the WASM build instead of native binary.
import { initBuild } from '../build'
import * as esbuildWasm from 'esbuild-wasm/esm/browser.js'

export const version: string = (esbuildWasm as unknown as Record<string, unknown>).version as string ?? '0.21.5'

let _init: Promise<void> | null = null
function ensureInit(): Promise<void> {
  if (!_init) _init = initBuild()
  return _init
}

import { memfsInstance } from '../vfs'
import { path } from './path'
import { resolveModule } from '../loader'

function injectVfsPlugin(options?: Record<string, unknown>) {
  const opts = (options || {}) as Record<string, any>
  console.log('[esbuild] injectVfsPlugin called with:', JSON.stringify(options))
  if (!opts.plugins) opts.plugins = []
  if (!opts.absWorkingDir) opts.absWorkingDir = '/'
  
  opts.plugins.push({
    name: 'vfs-fallback',
    setup(build: any) {
      build.onResolve({ filter: /.*/ }, (args: any) => {
        if (args.path.startsWith('.') || args.path.startsWith('/')) {
           const p = path.resolve(args.resolveDir || '/', args.path)
           try {
             const stat = memfsInstance.statSync(p)
             if (stat.isDirectory()) {
               if (memfsInstance.existsSync(path.join(p, 'index.js'))) return { path: path.join(p, 'index.js'), namespace: 'file' }
             } else {
               return { path: p, namespace: 'file' }
             }
           } catch {
             if (memfsInstance.existsSync(p + '.js')) return { path: p + '.js', namespace: 'file' }
           }
        } else {
           // Bare import
           try {
             const resolved = resolveModule(args.path, args.resolveDir || '/')
             if (resolved) {
               if (resolved.startsWith('__shim__:')) {
                 return { path: args.path, external: true }
               }
               return { path: resolved, namespace: 'file' }
             }
           } catch (e) {
             // Fall through
           }
           return { errors: [{ text: `Could not resolve "${args.path}" (sandbox vfs)` }] }
        }
        return null
      })
      
      build.onLoad({ filter: /.*/ }, (args: any) => {
        if (args.namespace !== 'file' && args.namespace !== '') return null;
        try {
           console.log('[vfs-fallback] Loading:', args.path);
           const contents = memfsInstance.readFileSync(args.path)
           const ext = path.extname(args.path).toLowerCase()
           let loader = 'js'
           if (ext === '.json') loader = 'json'
           else if (ext === '.jsx') loader = 'jsx'
           else if (ext === '.ts') loader = 'ts'
           else if (ext === '.tsx') loader = 'tsx'
           else if (ext === '.css') loader = 'css'
           return { contents: contents, loader }
        } catch(e) {
           console.log('[vfs-fallback] Load failed:', args.path, e);
           return { errors: [{ text: (e as Error).message }] }
        }
      })
    }
  })
  return opts
}

export async function transform(
  input: string,
  options?: Record<string, unknown>
): Promise<{ code: string; map: string; warnings: unknown[] }> {
  await ensureInit()
  console.log('[esbuild] transform called with options:', options);
  const result = await esbuildWasm.transform(input, options as Parameters<typeof esbuildWasm.transform>[1])
  return result
}

export async function build(
  options?: Record<string, unknown>
): Promise<{ errors: unknown[]; warnings: unknown[]; outputFiles?: unknown[]; metafile?: unknown }> {
  await ensureInit()
  console.log('[esbuild] build called with options:', JSON.stringify(options, null, 2));
  try {
    const result = await esbuildWasm.build(injectVfsPlugin(options) as Parameters<typeof esbuildWasm.build>[0])
    return result as unknown as { errors: unknown[]; warnings: unknown[]; outputFiles?: unknown[]; metafile?: unknown }
  } catch (e) {
    console.error('[esbuild] build failed:', e);
    throw e;
  }
}

export async function context(options?: Record<string, unknown>) {
  await ensureInit()
  console.log('[esbuild] context called with options:', JSON.stringify(options, null, 2));
  const opts = injectVfsPlugin(options)
  if (typeof (esbuildWasm as unknown as Record<string, unknown>).context === 'function') {
    try {
      const ctx = await (esbuildWasm as unknown as Record<string, (...a: unknown[]) => unknown>).context(opts as any)
      return ctx;
    } catch (e) {
      console.error('[esbuild] context failed:', e);
      throw e;
    }
  }
  // Fallback for older esbuild-wasm builds
  return {
    rebuild: () => build(options),
    watch: async () => {},
    dispose: async () => {},
    cancel: async () => {},
    serve: async () => ({ host: 'localhost', port: 0, stop: () => {} }),
  }
}

export function stop(): void {}

export const formatMessages = (msgs: unknown[], opts: unknown) =>
  Promise.resolve((msgs as string[]).map(String))

export const analyzeMetafile = (_meta: unknown, _opts?: unknown) =>
  Promise.resolve('')

export const initialize = async (opts?: unknown) => {
  await ensureInit()
}

// CommonJS-style default export shape so `const esbuild = require('esbuild')` works
const esbuildShim = {
  version,
  transform,
  build,
  context,
  stop,
  formatMessages,
  analyzeMetafile,
  initialize,
  default: undefined as unknown,
}
esbuildShim.default = esbuildShim
export default esbuildShim
