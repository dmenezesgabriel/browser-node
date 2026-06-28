import { memfsInstance, existsInVfs, isFileInVfs } from './vfs'
import { shimMap } from './shims/index'
import { path } from './shims/path'
import * as esbuildWasm from 'esbuild-wasm'

// Cache of resolved modules
const moduleCache = new Map<string, { exports: unknown }>()

// Detect whether a source file uses ESM syntax at the module level.
function isEsmSource(source: string): boolean {
  // Line-start import (with or without space — minified: import{X}from"mod")
  if (/^import[\s{*"'`]/m.test(source)) return true
  // Line-start export
  if (/^export\s/m.test(source)) return true
  // Mid-line static imports in minified files (after ;)
  if (/;\s*import[\s{*"'`]/m.test(source)) return true
  // import.meta
  if (/\bimport\.meta\b/.test(source)) return true
  return false
}

function esmToCjs(source: string, filePath: string): string {
  let result = source;
  let _ctr = 0;
  
  // Replace import.meta.* references
  result = result.replace(/\bimport\.meta\.url\b/g, `'file://${filePath}'`);
  result = result.replace(/\bimport\.meta\.dirname\b/g, `'${path.dirname(filePath)}'`);
  result = result.replace(/\bimport\.meta\.filename\b/g, `'${filePath}'`);
  result = result.replace(/\bimport\.meta\b/g, `({ url: 'file://${filePath}', dirname: '${path.dirname(filePath)}', filename: '${filePath}', env: {} })`);

  // Drop const/let redeclarations of runtime-injected CJS globals
  result = result.replace(/\b(const|let)\s+(__dirname|__filename|require)\s*=/g, '$2 =');

  // Strip import attributes (with { type: "json" } or assert { type: "json" })
  result = result.replace(/(?<!['"`])\b(?:with|assert)\s*\{\s*type\s*:\s*['"`]json['"`]\s*\}/g, '');

  const _mkNamedReplace = (pre: string, names: string, mod: string) => {
    const mapped = names.trim().split(',').filter(Boolean).map((n: string) => {
      const [src, dst] = n.trim().split(/\s+as\s+/)
      return dst ? `${src.trim()}: ${dst.trim()}` : src.trim()
    }).join(', ')
    return `${pre}var { ${mapped} } = require('${mod}'); `
  }
  const _mkDefaultReplace = (pre: string, name: string, mod: string) =>
    `${pre}var ${name} = ((_m) => _m && _m.__esModule && _m.default !== undefined ? _m.default : _m)(require('${mod}')); `
  const _mkCombinedReplace = (pre: string, defaultName: string, names: string, mod: string) => {
    const tmp = `_esm${_ctr++}`
    const mapped = names.trim().split(',').filter(Boolean).map((n: string) => {
      const [src, dst] = n.trim().split(/\s+as\s+/)
      return dst ? `${src.trim()}: ${dst.trim()}` : src.trim()
    }).join(', ')
    return `${pre}var ${tmp} = require('${mod}'); var ${defaultName} = ((_m) => _m && _m.__esModule && _m.default !== undefined ? _m.default : _m)(${tmp}); var { ${mapped} } = ${tmp}; `
  }

  result = result.replace(/(?<!['"`])\bimport\s+([$\w]+)\s*,\s*\{([^{}]*?)\}\s*from\s*(['"`])(.*?)\3/g, (_, dn, ns, __, mod) => _mkCombinedReplace('', dn, ns, mod));
  result = result.replace(/(?<!['"`])\bimport\s*\{([^{}]*?)\}\s*from\s*(['"`])(.*?)\2/g, (_, names, __, mod) => _mkNamedReplace('', names, mod));
  result = result.replace(/(?<!['"`])\bimport\s+([$\w]+)\s+from\s*(['"`])(.*?)\2/g, (_, name, __, mod) => _mkDefaultReplace('', name, mod));
  result = result.replace(/(?<!['"`])\bimport\s*\*\s*as\s+([$\w]+)\s+from\s*(['"`])(.*?)\2/g, (_, name, __, mod) => `var ${name} = require('${mod}'); `);
  result = result.replace(/(?<!['"`])\bimport\s*(['"`])(.*?)\1/g, (_, __, mod) => `require('${mod}'); `);
  
  result = result.replace(/(?<!\.)(?<!['"`])\b(?<!async\s)import\s*\((?!\?)/g, '((__dynArg)=>Promise.resolve(require(__dynArg)))(');

  result = result.replace(/(?<!['"`])\bexport\s+\*\s+from\s*(['"`])(.*?)\1/g, (_, __, mod) => `Object.assign(exports, require('${mod}')); `);
  result = result.replace(/(?<!['"`])\bexport\s+\*\s+as\s+([$\w]+)\s+from\s*(['"`])(.*?)\2/g, (_, name, __, mod) => `exports.${name} = require('${mod}'); `);
  
  result = result.replace(/(?<!['"`])\bexport\s*\{([^{}]*?)\}\s*from\s*(['"`])(.*?)\2/g, (_, names, __, mod) => {
    const parts = names.trim().split(',').filter(Boolean).map((n: string) => {
      const [src, dst] = n.trim().split(/\s+as\s+/)
      const s = src.trim(), d = (dst || src).trim()
      const dSafe = (d.startsWith('"') || d.startsWith("'")) ? `[${d}]` : `.${d}`
      const sSafe = (s.startsWith('"') || s.startsWith("'")) ? `[${s}]` : `.${s}`
      return `exports${dSafe} = require('${mod}')${sSafe}`
    }).join('; ')
    return parts ? `${parts}; ` : ''
  });

  result = result.replace(/(?<!['"`])\bexport\s*\{([^{}]*?)\}/g, (_, names) => {
    const parts = names.trim().split(',').filter(Boolean).map((n: string) => {
      const [src, dst] = n.trim().split(/\s+as\s+/)
      const s = src.trim(), d = (dst || src).trim()
      const dSafe = (d.startsWith('"') || d.startsWith("'")) ? `[${d}]` : `.${d}`
      return `exports${dSafe} = ${s}`
    }).join('; ')
    return parts ? `${parts}; ` : ''
  });

  result = result.replace(/(?<!['"`])\bexport\s+default\s+(function|class|async\s+function)\s+([$\w]+)/g, (_, kw, name) => `var ${name} = exports.default = module.exports.default = ${kw} ${name}`);
  result = result.replace(/(?<!['"`])\bexport\s+default\s+/g, 'exports.default = module.exports.default = ');

  const exportedFns: string[] = [];
  result = result.replace(/(?<!['"`])\bexport\s+(function|class|async\s+function)\s+([$\w]+)(?=\s*(\(|{|extends|\n|$))/g, (_, kw, name) => { exportedFns.push(name); return `${kw} ${name}` });

  const exportedVars: string[] = [];
  result = result.replace(/(?<!['"`])\bexport\s+(const|let|var)\s+([$\w]+)(?=\s*(=|,|;|\n|$))/g, (_, kw, name) => { exportedVars.push(name); return `${kw} ${name}` });

  const deferred = [...exportedFns, ...exportedVars].map(n => `Object.defineProperty(exports, '${n}', { get: () => ${n}, set: (v) => ${n} = v, enumerable: true })`).join('; ');

  result = `'use strict'; Object.defineProperty(exports, '__esModule', { value: true });\n` + (deferred ? `${deferred};\n` : '') + result;

  return result;
}

// Resolve the CJS entry point from a package.json exports field.
// Handles nested patterns: string | { require: string | { default: string } | ... }
function resolveExportsMain(exportsRoot: unknown): string | undefined {
  if (typeof exportsRoot === 'string') return exportsRoot
  if (typeof exportsRoot !== 'object' || exportsRoot === null) return undefined
  const obj = exportsRoot as Record<string, unknown>
  // Prefer 'require' condition (CJS)
  const req = obj.require
  if (typeof req === 'string') return req
  if (typeof req === 'object' && req !== null) {
    const r = req as Record<string, unknown>
    if (typeof r.default === 'string') return r.default
    if (typeof r.node === 'string') return r.node
    // pick first string value
    for (const v of Object.values(r)) if (typeof v === 'string') return v
  }
  // Fall back to 'node' condition
  const node = obj.node
  if (typeof node === 'string') return node
  if (typeof node === 'object' && node !== null) {
    const n = node as Record<string, unknown>
    if (typeof n.require === 'string') return n.require
    if (typeof n.default === 'string') return n.default
  }
  // Fall back to 'default' condition
  const def = obj.default
  if (typeof def === 'string') return def
  if (typeof def === 'object' && def !== null) {
    const d = def as Record<string, unknown>
    if (typeof d.default === 'string') return d.default
    for (const v of Object.values(d)) if (typeof v === 'string') return v
  }
  return undefined
}

// Resolve a package.json #imports condition entry to a file path string.
// Prefers 'require' → 'node' → 'default' conditions; skips 'import'/'browser'.
function resolveImportsCondition(entry: unknown): string | undefined {
  if (typeof entry === 'string') return entry
  if (typeof entry !== 'object' || entry === null) return undefined
  const obj = entry as Record<string, unknown>
  for (const cond of ['require', 'node', 'default']) {
    const v = obj[cond]
    if (typeof v === 'string') return v
    if (typeof v === 'object' && v !== null) {
      const r = resolveImportsCondition(v)
      if (r) return r
    }
  }
  return undefined
}

// shimMap is already synchronous — just expose it as shimCache
const shimCache = shimMap

export async function preloadShims() {
  // shimMap is populated at import time; nothing async to do
}

export function resolveModule(specifier: string, fromDir: string): string | null {
  const bareSpecifier = specifier.startsWith('node:') ? specifier.slice(5) : specifier
  // Built-in shims (except typescript — check VFS first for real installed TypeScript
  // used by @angular/compiler-cli which needs full exports like SyntaxKind)
  if (bareSpecifier in shimCache && bareSpecifier !== 'typescript') return `__shim__:${bareSpecifier}`

  // Package #imports (private package imports — e.g. "#module-sync-enabled")
  if (specifier.startsWith('#')) {
    let dir = fromDir
    while (true) {
      const pkgJsonPath = path.join(dir, 'package.json')
      if (isFileInVfs(pkgJsonPath)) {
        try {
          const pkg = JSON.parse(memfsInstance.readFileSync(pkgJsonPath, 'utf8') as string) as Record<string, unknown>
          const imports = pkg.imports as Record<string, unknown> | undefined
          if (imports && specifier in imports) {
            const entry = imports[specifier]
            const resolved = resolveImportsCondition(entry)
            if (resolved) {
              const abs = path.join(dir, resolved)
              for (const ext of ['', '.js', '.cjs', '.mjs']) {
                if (isFileInVfs(abs + ext)) return abs + ext
              }
            }
          }
        } catch {}
      }
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    return null
  }

  // Relative or absolute path
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    const abs = specifier.startsWith('/') ? specifier : path.join(fromDir, specifier)
    for (const ext of ['', '.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.json', '/index.js', '/index.cjs', '/index.mjs', '/index.ts', '/index.tsx', '/index.jsx']) {
      const candidate = abs + ext
      if (isFileInVfs(candidate)) return candidate
    }
    return null
  }

  // node_modules lookup — walk up from fromDir
  const parts = specifier.split('/')
  const pkgName = parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
  const subpath = parts[0].startsWith('@') ? parts.slice(2).join('/') : parts.slice(1).join('/')

  let dir = fromDir
  while (true) {
    const nmDir = path.join(dir, 'node_modules', pkgName)
    if (existsInVfs(nmDir)) {
      // Try package.json exports field first (covers both '.' and subpath cases)
      const pkgJsonPath = path.join(nmDir, 'package.json')
      let pkg: Record<string, unknown> | null = null
      if (isFileInVfs(pkgJsonPath)) {
        try { pkg = JSON.parse(memfsInstance.readFileSync(pkgJsonPath, 'utf8') as string) } catch {}
      }

      if (subpath) {
        // Try exports field subpath first
        if (pkg?.exports) {
          const subpathKey = `./${subpath}`
          const exportsEntry = (pkg.exports as Record<string, unknown>)[subpathKey]
          const resolved = resolveExportsMain(exportsEntry)
          if (resolved) {
            const resolvedPath = path.join(nmDir, resolved)
            for (const ext of ['', '.js', '.cjs', '.mjs']) {
              if (isFileInVfs(resolvedPath + ext)) return resolvedPath + ext
            }
          }
        }
        // Direct file path fallback — also read inner package.json (e.g. next/dist/compiled/watchpack)
        const candidate = path.join(nmDir, subpath)
        for (const ext of ['', '.js', '.cjs', '.mjs', '/index.js', '/index.cjs']) {
          if (isFileInVfs(candidate + ext)) return candidate + ext
        }
        // If the candidate is a directory with its own package.json, follow its main field
        const innerPkgPath = candidate + '/package.json'
        if (isFileInVfs(innerPkgPath)) {
          try {
            const innerPkg = JSON.parse(memfsInstance.readFileSync(innerPkgPath, 'utf8') as string) as Record<string, unknown>
            const innerMain = (innerPkg.main as string | undefined) ?? 'index.js'
            const innerPath = path.join(candidate, innerMain)
            for (const ext of ['', '.js', '.cjs', '.mjs', '/index.js', '/index.cjs', '/index.mjs']) {
              if (isFileInVfs(innerPath + ext)) return innerPath + ext
            }
          } catch {}
        }
      } else {
        // Root package — use exports['.'] then main
        if (pkg) {
          const exportsRoot = (pkg.exports as Record<string, unknown>)?.['.'] ?? pkg.exports
          const mainStr = resolveExportsMain(exportsRoot) ?? (pkg.main as string | undefined) ?? 'index.js'
          const mainPath = path.join(nmDir, mainStr)
          for (const ext of ['', '.js', '.cjs', '.mjs', '/index.js', '/index.cjs', '/index.mjs']) {
            if (isFileInVfs(mainPath + ext)) return mainPath + ext
          }
        }
        // Fallback to index files
        for (const idx of ['/index.js', '/index.cjs', '/index.mjs']) {
          if (isFileInVfs(nmDir + idx)) return nmDir + idx
        }
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return null
}

// Walk up from filePath to find the nearest package.json and check if type === 'module'
function isInModulePackage(filePath: string): boolean {
  let dir = path.dirname(filePath)
  while (true) {
    const pkgPath = path.join(dir, 'package.json')
    if (isFileInVfs(pkgPath)) {
      try {
        const pkg = JSON.parse(memfsInstance.readFileSync(pkgPath, 'utf8') as string) as Record<string, unknown>
        return pkg.type === 'module'
      } catch {}
      return false
    }
    const parent = path.dirname(dir)
    if (parent === dir) return false
    dir = parent
  }
}

// Map from resolved file paths to override implementations.
// Used to stub heavy native modules (e.g., Next.js SWC) without touching the VFS.
const filePathOverrides = new Map<string, () => unknown>()
export function registerFileOverride(filePath: string, factory: () => unknown) {
  filePathOverrides.set(filePath, factory)
}

function executeModule(filePath: string, fromDir: string): { exports: unknown } {
  if (moduleCache.has(filePath)) return moduleCache.get(filePath)!

  // Check if this file path has a registered override (e.g., native-binary stubs)
  let override: (() => unknown) | undefined
  for (const [pattern, factory] of filePathOverrides.entries()) {
    if (filePath === pattern || filePath.endsWith(pattern)) {
      override = factory
      break
    }
  }
  
  if (override) {
    const mod = { exports: override() }
    moduleCache.set(filePath, mod)
    return mod
  }

  const mod = { exports: {} as Record<string, unknown> }
  moduleCache.set(filePath, mod) // set before execution to handle circular deps

  let source = memfsInstance.readFileSync(filePath, 'utf8') as string
  const dir = path.dirname(filePath)

  if (filePath.endsWith('.json')) {
    mod.exports = JSON.parse(source)
    return mod
  }

  // Strip hashbang before parsing/execution
  if (source.startsWith('#!')) {
    source = source.replace(/^#![^\n]*\n/, '\n')
  }

  // Transpile TypeScript / JSX files if needed
  const ext = path.extname(filePath).slice(1)
  if (['ts', 'tsx', 'jsx', 'cts', 'mts'].includes(ext)) {
    try {
      let transpiled = false
      try {
        const ts = requireSync('typescript', dir) as any
        if (ts && ts.transpileModule) {
          // jsx: 2 = React (classic) → compiles <Foo /> to React.createElement calls (needed for JSX files)
          // jsx: 4 = Preserve        → leaves JSX syntax intact (WRONG — causes parse errors)
          // jsx: 1 = None            → strips JSX tags from .ts files
          const isJsx = ext === 'jsx' || ext === 'tsx'
          source = ts.transpileModule(source, { compilerOptions: { target: 99, jsx: isJsx ? 2 : 1 } }).outputText
          transpiled = true
        }
      } catch {}
      if (!transpiled) {
        // Regex fallback: strip common TS-only syntax
        source = source
          .replace(/:\s*[A-Za-z][A-Za-z0-9_<>, [\]|&.()]*(?=\s*[=,);{])/g, '') // : TypeAnnotation
          .replace(/\binterface\s+\w+[^{]*\{[^}]*\}/gs, '')                      // interface declarations
          .replace(/\btype\s+\w+\s*=\s*[^;\n]+;?/g, '')                          // type aliases
          .replace(/<[A-Za-z][A-Za-z0-9_, ]*>/g, '')                             // <T> generics (simple)
          .replace(/\s+as\s+[A-Za-z][A-Za-z0-9_<>, [\]|&.()]+/g, '')            // x as Type
      }
    } catch (err) {
      self.postMessage({ type: 'stdout', text: `[loader] Transpilation error in ${filePath}: ${(err as Error).message}\n` })
      throw err
    }
  }

  // Transpile ESM to CJS if needed (handles Vite 8.x+ which ships ESM-only dist)
  // Treat .mjs files as ESM regardless of content, and .js files in "type":"module" packages
  const originalSource = source
  const isMjs = filePath.endsWith('.mjs')
  const isModulePackage = !isMjs && filePath.endsWith('.js') && isInModulePackage(filePath)
  if (!filePath.includes('/typescript/lib/')) {
    const definitelyCjs = /\bObject\.defineProperty\(exports,\s*['"]__esModule['"]/.test(source) || 
                          (!isMjs && !isModulePackage && (/\bmodule\.exports\b/.test(source) || /\bexports\.\w+/.test(source)));
    
    if (!definitelyCjs && (isMjs || isModulePackage || isEsmSource(source))) {
      source = esmToCjs(source, filePath)
    } else if (/(?<!\.)(?<!['"`])\b(?<!async\s)import\s*\((?!\?)/.test(source)) {
      source = source.replace(/(?<!\.)(?<!['"`])\b(?<!async\s)import\s*\((?!\?)/g, '((__dynArg)=>Promise.resolve(require(__dynArg)))(')
    }
  }

  const requireFn = Object.assign(
    (specifier: string) => requireSync(specifier, dir),
    {
      resolve: (spec: string) => {
        const r = resolveModule(spec, dir)
        if (!r || r.startsWith('__shim__:')) return spec
        return r
      },
      cache: moduleCache,
      main: undefined,
      extensions: { '.js': true, '.cjs': true, '.mjs': true, '.json': true },
    }
  )
  const execSource = (src: string) => {
    const wrapped = `(function(require, module, exports, __dirname, __filename) {
const __filename_url = 'file://' + __filename;
const __import_meta = { url: __filename_url, dirname: __dirname, filename: __filename, env: {} };
${src}
\n})`
    // Indirect eval so the function executes in global scope, not module scope
    const fn = (0, eval)(wrapped)
    try {
      fn(requireFn, mod, mod.exports, dir, filePath)
    } catch (err) {
      console.error(`[loader] Error executing module ${filePath}:`, err)
      throw err
    }
  }
  try {
    execSource(source)
  } catch (e) {
    if (e instanceof SyntaxError) {
      try {
        const CJS_RE = /exports\.|module\.exports/
        execSource(esmToCjs(originalSource, filePath))
        return mod
      } catch (err: any) {
        if (err instanceof SyntaxError) {
          self.postMessage({ type: 'stdout', text: `[loader] SyntaxError in: ${filePath}: ${err.message}\n` })
          self.postMessage({ type: 'stdout', text: `[loader] Source excerpt:\n${source.substring(0, 1000)}\n` })
        }
        throw err;
      }
    }
    moduleCache.delete(filePath)
    throw e
  }

  return mod
}

export function requireSync(specifier: string, fromDir = '/app'): unknown {
  // Virtual module IDs (rolldown/rollup internal) — return empty object
  if (specifier.startsWith('\0')) return {}

  // file:// URLs — strip the protocol prefix and treat as absolute path
  if (specifier.startsWith('file://')) {
    specifier = specifier.replace(/^file:\/\//, '')
  }

  // Built-in shim (except typescript — check VFS first so real installed TypeScript
  // is used by packages like @angular/compiler-cli that need full exports like SyntaxKind)
  if (specifier in shimCache && specifier !== 'typescript') {
    return shimCache[specifier]
  }

  const resolved = resolveModule(specifier, fromDir)

  if (!resolved) {
    if (specifier === 'typescript') {
      // Fallback to built-in shim when TypeScript is not installed (e.g. JS-only projects)
      return shimCache['typescript']
    }
    throw new Error(`Cannot find module '${specifier}' from '${fromDir}'`)
  }

  if (resolved.startsWith('__shim__:')) {
    return shimCache[resolved.slice(9)]
  }

  return executeModule(resolved, fromDir).exports
}

export function clearModuleCache() {
  moduleCache.clear()
}
