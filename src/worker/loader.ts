import { memfsInstance, existsInVfs, isFileInVfs, writeFileToVfs } from './vfs'
import { shimMap } from './shims/index'
import { path } from './shims/path'

let _sucraseTransform: ((code: string, opts: Record<string, unknown>) => { code: string }) | null = null
export async function getSucraseTransform(): Promise<typeof _sucraseTransform> {
  if (!_sucraseTransform) {
    const m = await import('sucrase')
    _sucraseTransform = m.transform as typeof _sucraseTransform
  }
  return _sucraseTransform
}

// Cache of resolved modules
const moduleCache = new Map<string, { exports: unknown }>()

/**
 * Replace `import(...)` calls with `__import_fn(...)` while skipping string
 * literals, template-literal *text* portions (but not `${...}` expressions),
 * single-/multi-line comments, and regex literals.
 *
 * A naive regex like /\bimport\s*\(/g matches inside code-generation strings
 * (e.g. template literals that build `import('…')` for the browser), which
 * corrupts the generated code. This scanner tracks context to avoid that.
 */
function replaceDynamicImportCalls(src: string): string {
  let out = ''
  let i = 0
  const len = src.length
  while (i < len) {
    const ch = src[i]
    const next = i + 1 < len ? src[i + 1] : ''

    // ── Single-line comment ──
    if (ch === '/' && next === '/') {
      const end = src.indexOf('\n', i)
      out += end === -1 ? src.slice(i) : src.slice(i, end + 1)
      i = end === -1 ? len : end + 1
      continue
    }
    // ── Multi-line comment ──
    if (ch === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2)
      out += end === -1 ? src.slice(i) : src.slice(i, end + 2)
      i = end === -1 ? len : end + 2
      continue
    }
    // ── String literal ──
    if (ch === '"' || ch === "'") {
      let j = i + 1
      while (j < len) {
        if (src[j] === '\\') { j += 2; continue }
        if (src[j] === ch) break
        j++
      }
      out += src.slice(i, j + 1)
      i = j + 1
      continue
    }
    // ── Regex literal heuristic ──
    // '/' starts a regex when the preceding token is an operator, keyword, etc.
    if (ch === '/' && i > 0) {
      const prev = out.trimEnd().slice(-1)
      if ('=(:,;!&|?+~^%{}[];'.includes(prev) ||
          out.trimEnd().endsWith('return') ||
          out.trimEnd().endsWith('case') ||
          out.trimEnd().endsWith('typeof') ||
          out.trimEnd().endsWith('void')) {
        let j = i + 1
        while (j < len && src[j] !== '/') {
          if (src[j] === '\\') j++
          if (src[j] === '[') {
            j++
            while (j < len && src[j] !== ']') {
              if (src[j] === '\\') j++
              j++
            }
          }
          j++
        }
        out += src.slice(i, j + 1)
        i = j + 1
        continue
      }
    }
    // ── Template literal ──
    if (ch === '`') {
      out += '`'
      i++
      while (i < len && src[i] !== '`') {
        if (src[i] === '\\') { out += src[i]; out += src[i + 1] || ''; i += 2; continue }
        if (src[i] === '$' && src[i + 1] === '{') {
          out += '${'
          i += 2
          // Walk the expression, tracking brace depth, so we skip back into text
          let depth = 1
          while (i < len && depth > 0) {
            const ec = src[i]
            const en = i + 1 < len ? src[i + 1] : ''
            if (ec === '/' && en === '/') {
              const end = src.indexOf('\n', i)
              out += end === -1 ? src.slice(i) : src.slice(i, end + 1)
              i = end === -1 ? len : end + 1
              continue
            }
            if (ec === '/' && en === '*') {
              const end = src.indexOf('*/', i + 2)
              out += end === -1 ? src.slice(i) : src.slice(i, end + 2)
              i = end === -1 ? len : end + 2
              continue
            }
            if (ec === '"' || ec === "'") {
              let j = i + 1
              while (j < len) {
                if (src[j] === '\\') { j += 2; continue }
                if (src[j] === ec) break
                j++
              }
              out += src.slice(i, j + 1)
              i = j + 1
              continue
            }
            if (ec === '`') {
              // Nested template literal — recurse the template scanner
              out += '`'
              i++
              while (i < len && src[i] !== '`') {
                if (src[i] === '\\') { out += src[i]; out += src[i + 1] || ''; i += 2; continue }
                if (src[i] === '$' && src[i + 1] === '{') {
                  // Nested expression inside nested template — just copy for simplicity
                  out += '${'
                  i += 2
                  let nd = 1
                  while (i < len && nd > 0) {
                    if (src[i] === '{') nd++
                    if (src[i] === '}') nd--
                    if (nd > 0) out += src[i]
                    i++
                  }
                  out += '}'
                  continue
                }
                out += src[i]
                i++
              }
              if (i < len) { out += '`'; i++ }
              continue
            }
            if (ec === '{') depth++
            if (ec === '}') { depth--; if (depth === 0) { out += '}'; i++; continue } }
            // Inside template expression — delegate to main import() replacement
            if (ec === 'i' && src.slice(i, i + 7) === 'import' &&
                /\s*\(/.test(src.slice(i + 7, i + 12)) &&
                (i === 0 || /[^a-zA-Z0-9_$]/.test(src[i - 1]))) {
              out += '(s => __import_fn(s, __dirname))('
              i += 7
              while (i < len && /\s/.test(src[i])) { out += src[i]; i++ }
              i++ // skip '('
              continue
            }
            out += ec
            i++
          }
          continue
        }
        out += src[i]
        i++
      }
      if (i < len) { out += '`'; i++ }
      continue
    }

    // ── Dynamic import() call ──
    if (ch === 'i' && src.slice(i, i + 7) === 'import' &&
        /\s*\(/.test(src.slice(i + 7, i + 12)) &&
        (i === 0 || /[^a-zA-Z0-9_$]/.test(src[i - 1]))) {
      out += '(s => __import_fn(s, __dirname))('
      i += 7
      while (i < len && /\s/.test(src[i])) { out += src[i]; i++ }
      i++ // skip '('
      continue
    }

    out += ch
    i++
  }
  return out
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
    source = source.replace(/^#![^\n]*\n?/, '')
  }

  // Rollup/Next.js _export and __exportStar helpers use Object.defineProperty with
  // `get: exports[name]` where exports[name] is expected to be a getter function.
  // In our CJS loader, exports are plain values, not getter functions, so `get: 42` throws.
  // We intercept Object.defineProperty during module execution to auto-wrap non-function
  // getters, which is more robust than regex-patching source code.
  const origDefineProperty = Object.defineProperty
  const interceptedDefineProperty = function(obj: any, prop: PropertyKey, desc: any) {
    // Vite/Rolldown bundles can emit `Object.defineProperty(all, name, { get: all[name] })`
    // where `all[name]` is a plain value (not a function).  A non-callable getter throws,
    // so we wrap it in a function.  Normal CJS `__createBinding` already provides a
    // function getter (`get: function() { return m[k]; }`) — those must be left alone,
    // otherwise the return value gets double-wrapped and breaks module type enums.
    if (desc && 'get' in desc && typeof desc.get !== 'function') {
      const val = desc.get
      desc.get = () => () => val
    }
    return origDefineProperty.call(this, obj, prop, desc)
  }

  const ext = path.extname(filePath).slice(1)
  const isTs = ['ts', 'tsx', 'cts', 'mts'].includes(ext)
  const isJsx = ['jsx', 'tsx'].includes(ext)

  if (!filePath.includes('/typescript/lib/')) {
    let transpiled = false
    if (isTs || isJsx) {
      try {
        const ts = requireSync('typescript', dir) as any
        if (ts && ts.transpileModule && !ts._isBuiltinShim) {
          const isJsxFile = ext === 'jsx' || ext === 'tsx'
          source = ts.transpileModule(source, {
            compilerOptions: {
              target: 99, // ESNext
              module: 99, // ESNext
              jsx: isJsxFile ? 2 : 1,
            }
          }).outputText
          transpiled = true
        }
      } catch {}
    }

    const isMjs = filePath.endsWith('.mjs')
    const isModulePackage = !isMjs && filePath.endsWith('.js') && isInModulePackage(filePath)
    let isEsm = isMjs || isModulePackage || 
                /^import[\s{*"'`]/m.test(source) || 
                /^export\s/m.test(source) || 
                /;\s*import[\s{*"'`]/m.test(source) || 
                /\bimport\.meta\b/.test(source) || 
                /(?<!\.)(?<!['"`])\b(?<!async\s)import\s*\(/.test(source)

    // CommonJS detection fallback to avoid ESM transformations on massive CJS bundles (like typescript.js)
    const definitelyCjs = /\bObject\.defineProperty\(exports,\s*['"]__esModule['"]/.test(source) || 
                          (!isMjs && !isModulePackage && (/\bmodule\.exports\b/.test(source) || /\bexports\.\w+/.test(source)))
    if (definitelyCjs && !/(?<!\.)(?<!['"`])\b(?<!async\s)import\s*\(/.test(source)) {
      isEsm = false
    }

    const transforms: string[] = []
    if ((isTs || isJsx) && !transpiled) {
      if (isTs) transforms.push('typescript')
      if (isJsx) transforms.push('jsx')
    }
    if (isEsm || isTs || isJsx) {
      transforms.push('imports')
    }

    if (transforms.length > 0 && _sucraseTransform) {
      try {
        source = _sucraseTransform(source, {
          transforms: transforms as any,
          filePath,
          production: false
        }).code
      } catch (err) {
        console.error(`[loader] Sucrase transpilation error in ${filePath}:`, err)
        // Fall through with untransformed source; if it has ESM syntax the
        // async wrapper will still work, and the SyntaxError retry below
        // will attempt a basic regex fallback
      }
    }

    // Replace import.meta references safely by mapping to injected __import_meta
    source = source.replace(/\bimport\.meta\b/g, '__import_meta');

    // Drop const/let redeclarations of runtime-injected CJS globals
    source = source.replace(/\b(const|let)\s+(__dirname|__filename|require)\s*=/g, '$2 =');
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
    if (filePath.endsWith('route-types-utils.js') || filePath.endsWith('typegen.js')) {
      console.log('--- REPLACED SOURCE ---')
      console.log(src.substring(0, 1000))
      console.log('--- END REPLACED SOURCE ---')
    }
    // Route dynamic import() calls through VFS-aware __import_fn (defined at global scope in index.ts).
    // We use a character-level scanner instead of a naive regex so that import() inside
    // string literals, template-literal text, and comments is left untouched.
    src = replaceDynamicImportCalls(src)
    const wrapped = `(async function(require, module, exports, __dirname, __filename) {
const __filename_url = 'file://' + __filename;
const __import_meta = { url: __filename_url, dirname: __dirname, filename: __filename, env: {} };
${src}
\n})`
    // Indirect eval so the function executes in global scope, not module scope
    let fn: any;
    try {
      fn = (0, eval)(wrapped)
    } catch (err: any) {
      if (err?.name === 'SyntaxError') {
        console.error(`[loader] Parse SyntaxError in ${filePath}: ${err.message}`)
        // Extract line:col from the SyntaxError stack (e.g. "<anonymous>:1234:56")
        const synMatch = err.stack?.match(/<anonymous>:(\d+):(\d+)/)
        if (synMatch) {
          const lineNum = parseInt(synMatch[1], 10)
          const colNum = parseInt(synMatch[2], 10)
          const wrappedLines = wrapped.split('\n')
          const errLine = wrappedLines[lineNum - 1] ?? ''
          const start = Math.max(0, colNum - 40)
          const end = Math.min(errLine.length, colNum + 40)
          console.error(`[loader] At line ${lineNum}, col ${colNum}:`)
          console.error(`[loader] Context: ...${errLine.substring(start, end)}...`)
          console.error(`[loader] Arrow:    ${' '.repeat(40)}^`)
        }
        console.error(`[loader] Code snippet:\n`, wrapped.split('\n').map((l: string, i: number) => `${i+1}: ${l}`).join('\n').substring(0, 3000))
      }
      throw err;
    }

    try {
      // Temporarily intercept Object.defineProperty to handle Rollup's _export helper
      // which uses `get: exports[name]` — when exports are plain values (not getter
      // functions), this throws. Wrap non-function getters automatically.
      Object.defineProperty = interceptedDefineProperty as any
      try {
        const result = fn(requireFn, mod, mod.exports, dir, filePath)
        if (result && typeof result.then === 'function') {
          result.catch((err: Error) => {
            console.error(`[loader] Async error in ${filePath}:`, err)
            moduleCache.delete(filePath)
          })
        }
      } finally {
        Object.defineProperty = origDefineProperty
      }
    } catch (err) {
      Object.defineProperty = origDefineProperty
      const lines = src.split('\n')
      // Write error details to a temp file for debugging
      const errLines: string[] = []
      errLines.push(`Error in ${filePath}: ${err}`)
      const stackMatch = (err as Error)?.stack?.match(/<anonymous>:(\d+):(\d+)/)
      if (stackMatch) {
        const lineNum = parseInt(stackMatch[1], 10)
        const srcLine = lineNum - 4
        const start = Math.max(0, srcLine - 3)
        const end = Math.min(lines.length, srcLine + 4)
        errLines.push(`Stack line: ${lineNum}, source line: ${srcLine}`)
        for (let i = start; i < end; i++) {
          errLines.push(`  ${i === srcLine ? '>>>' : '   '} ${i + 1}: ${lines[i]}`)
        }
      }
      try { writeFileToVfs('/tmp/loader-error.txt', errLines.join('\n')) } catch {}
      throw err
    }
  }

  try {
    execSource(source)
  } catch (e: any) {
    moduleCache.delete(filePath)
    if (e?.name === 'SyntaxError') {
      // Retry with basic regex fallback for edge cases Sucrase can't handle
      try {
        const fallback = source
          .replace(/^import[\s{*"'`].*?$/gm, '')
          .replace(/^export\s/gm, '')
          .replace(/\bimport\.meta\b/g, '__import_meta')
          .replace(/exports\.'([^']+)'/g, "exports['$1']")
          .replace(/exports\.\s+default\b/g, 'exports.default')
        execSource(fallback)
        return mod
      } catch {}
      self.postMessage({ type: 'stdout', text: `[loader] SyntaxError in: ${filePath}: ${e.message}\n` })
      self.postMessage({ type: 'stdout', text: `[loader] Source excerpt:\n${source.substring(0, 1000)}\n` })
    }
    throw e
  }

  return mod
}

export function requireSync(specifier: string, fromDir = '/app'): unknown {
  if (specifier && typeof specifier === 'object') {
    if ('href' in specifier) {
      specifier = (specifier as any).href;
    } else if ('toString' in specifier) {
      specifier = (specifier as any).toString();
    }
  }
  if (typeof specifier !== 'string') {
    specifier = String(specifier);
  }

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

  try {
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

    self.postMessage({ type: 'stdout', text: `[trace] requireSync calling executeModule for ${specifier} (${resolved})\n` })
    const _exports = executeModule(resolved, fromDir).exports
    self.postMessage({ type: 'stdout', text: `[trace] requireSync: ${specifier} loaded, exports keys: ${Object.keys(_exports as object).slice(0, 5).join(', ')}\n` })
    return _exports
  } catch (err: any) {
    self.postMessage({ type: 'stderr', text: `[requireSync error] ${specifier} from ${fromDir}: ${err.message}\n${err.stack}\n` })
    throw err
  }
}

export function clearModuleCache() {
  moduleCache.clear()
}
