import * as esbuild from 'esbuild-wasm/esm/browser.js'
import { memfsInstance, existsInVfs } from './vfs'
import { path } from './shims/path'

let initialized = false

export async function initBuild() {
  if (initialized) return
  const esbuildInitialize = esbuild.initialize || (esbuild as any).default?.initialize
  if (typeof esbuildInitialize !== 'function') {
    const keys = Object.keys(esbuild).join(', ')
    const defKeys = (esbuild as any).default ? Object.keys((esbuild as any).default).join(', ') : 'no-default'
    throw new Error(`esbuild initialize function not found. esbuild keys: ${keys}. default keys: ${defKeys}.`)
  }
  await esbuildInitialize({
    wasmURL: '/node_modules/esbuild-wasm/esbuild.wasm',
    worker: false, // We're already in a Worker
  })
  initialized = true
}

// esbuild API match
export async function build(opts: any): Promise<any> {
  const esbuildBuild = esbuild.build || (esbuild as any).default?.build
  if (typeof esbuildBuild !== 'function') throw new Error('esbuild build function not found')
  
  // Inject our VFS plugin
  const plugins = opts.plugins || []
  if (!plugins.find((p: any) => p.name === 'vfs')) {
    plugins.push(vfsPlugin())
  }

  // Ensure write is false so we get outputFiles
  return await esbuildBuild({
    ...opts,
    plugins,
    write: false,
  })
}

// Transform a single file (no bundling — just transpile TS/JSX)
export async function transform(
  source: string,
  opts: any = {}
): Promise<any> {
  const esbuildTransform = esbuild.transform || (esbuild as any).default?.transform
  if (typeof esbuildTransform !== 'function') throw new Error('esbuild transform function not found')
  return await esbuildTransform(source, opts)
}

// esbuild plugin that reads from the VFS
function vfsPlugin(): esbuild.Plugin {
  return {
    name: 'vfs',
    setup(build) {
      // Resolve all imports through the VFS
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.path.startsWith('node:')) {
          return { path: args.path.replace('node:', ''), namespace: 'shim' }
        }

        // Relative path
        if (args.path.startsWith('.') || args.path.startsWith('/')) {
          const abs = args.path.startsWith('/')
            ? args.path
            : path.join(args.resolveDir || '/', args.path)

          for (const ext of ['', '.js', '.ts', '.jsx', '.tsx', '.cjs', '.json', '/index.js', '/index.ts']) {
            if (existsInVfs(abs + ext)) return { path: abs + ext, namespace: 'vfs' }
          }
          return { errors: [{ text: `Cannot resolve ${args.path} from ${args.resolveDir}` }] }
        }

        // node_modules
        const parts = args.path.split('/')
        const pkgName = parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
        const subpath = parts[0].startsWith('@') ? parts.slice(2).join('/') : parts.slice(1).join('/')
        const nmPath = path.join('/node_modules', pkgName)

        if (existsInVfs(nmPath)) {
          if (subpath) {
            const candidate = path.join(nmPath, subpath)
            for (const ext of ['', '.js', '.cjs', '/index.js']) {
              if (existsInVfs(candidate + ext)) return { path: candidate + ext, namespace: 'vfs' }
            }
          }
          const pkgJsonPath = path.join(nmPath, 'package.json')
          if (existsInVfs(pkgJsonPath)) {
            const pkg = JSON.parse(memfsInstance.readFileSync(pkgJsonPath, 'utf8') as string)
            const main = pkg.main || pkg.exports?.['.']?.require || 'index.js'
            const mainStr = typeof main === 'string' ? main : 'index.js'
            const mainPath = path.join(nmPath, mainStr)
            for (const ext of ['', '.js', '.cjs']) {
              if (existsInVfs(mainPath + ext)) return { path: mainPath + ext, namespace: 'vfs' }
            }
          }
        }

        return { path: args.path, namespace: 'shim' }
      })

      // Load from VFS
      build.onLoad({ filter: /.*/, namespace: 'vfs' }, (args) => {
        const content = memfsInstance.readFileSync(args.path, 'utf8') as string
        const ext = path.extname(args.path).slice(1)
        const loader = (['ts', 'tsx', 'jsx', 'json', 'css'] as const).find(e => e === ext) ?? 'js' as esbuild.Loader
        return { contents: content, loader }
      })

      // Shims — return empty for browser-irrelevant node built-ins
      build.onLoad({ filter: /.*/, namespace: 'shim' }, (args) => {
        return { contents: `// shim: ${args.path}`, loader: 'js' }
      })
    },
  }
}
