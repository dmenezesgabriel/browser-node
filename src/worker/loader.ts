import { memfsInstance, isFileInVfs, writeFileToVfs } from './vfs'
import { shimMap } from './shims/index'
import { path } from './shims/path'
import { ExitSignal } from './shims/process'
import { trace, isTraceEnabled } from './log'
import { initLexers, rewriteDynamicImports, replaceImportMeta } from './lexer'
import { resolveModule, resolveModuleInVfs, VFS_FIRST_SHIMS } from './resolve'
// Re-exported so existing importers (index.ts, process-worker.ts, tests) keep
// getting resolution from the loader's public API.
export { resolveModule, resolveModuleInVfs } from './resolve'

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



// Probe resolved exports/imports candidates against the VFS, trying the same
// extension list the old resolver used.
// shimMap is already synchronous — just expose it as shimCache
const shimCache = shimMap

export async function preloadShims() {
  // Init the wasm lexers so rewriteDynamicImports/cjsNamedExports can run
  // synchronously during module load. shimMap is populated at import time.
  await initLexers()
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
  // Fingerprint node_modules files so resetForNewRun can keep them cached across
  // runs until they actually change.
  if (filePath.includes('/node_modules/')) {
    const fp = fileFingerprint(filePath)
    if (fp) _cachedFingerprints.set(filePath, fp)
  }

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
  let esmTransformed = false

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
      esmTransformed = true
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

    // Map real import.meta references to the injected __import_meta binding.
    // Uses es-module-lexer (not a blind regex) so import.meta inside string/
    // template literals is left intact — e.g. @vitejs/plugin-react's HMR wrapper
    // templates, whose corruption previously broke every served .tsx.
    source = replaceImportMeta(source);

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
    // Route dynamic import() calls through VFS-aware __import_fn (defined at global
    // scope in index.ts). es-module-lexer (what Vite uses) locates them precisely;
    // the hand-rolled char scanner is the fallback if the lexer can't parse the source.
    try {
      src = rewriteDynamicImports(src)
    } catch {
      src = replaceDynamicImportCalls(src)
    }
    // ESM may legally declare its own module-scope `var exports` (it's just an
    // identifier there), which under this CJS-style wrapper rebinds the param
    // and splits Sucrase's export assignments across two objects (vite@5 dist
    // chunks do this). Sucrase is not scope-aware, so reconcile at the end:
    // merge a diverged `exports` binding back onto module.exports, keeping the
    // cached object's identity (circular-dep safe).
    const epilogue = esmTransformed
      ? `\n;if (module.exports !== exports) { Object.assign(module.exports, exports); }`
      : ''
    const wrapped = `(async function(require, module, exports, __dirname, __filename) {
const __filename_url = 'file://' + __filename;
const __import_meta = { url: __filename_url, dirname: __dirname, filename: __filename, env: {} };
${src}${epilogue}
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
            // process.exit() unwinds through the async wrapper as a rejection;
            // the exit code travels via process.exitCode — not an error.
            if (err instanceof ExitSignal) return
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
        const fallback = replaceImportMeta(source
          .replace(/^import[\s{*"'`].*?$/gm, '')
          .replace(/^export\s/gm, '')
          .replace(/exports\.'([^']+)'/g, "exports['$1']")
          .replace(/exports\.\s+default\b/g, 'exports.default'))
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

  // Built-in shim, except VFS-first packages (typescript, chokidar) where a
  // real installation should win — see VFS_FIRST_SHIMS.
  if (specifier in shimCache && !VFS_FIRST_SHIMS.has(specifier)) {
    return shimCache[specifier]
  }

  try {
    const resolved = resolveModule(specifier, fromDir)

    if (!resolved) {
      if (VFS_FIRST_SHIMS.has(specifier)) {
        // Fall back to the built-in shim when not installed in the VFS
        return shimCache[specifier]
      }
      throw new Error(`Cannot find module '${specifier}' from '${fromDir}'`)
    }

    if (resolved.startsWith('__shim__:')) {
      return shimCache[resolved.slice(9)]
    }

    trace('trace', `requireSync calling executeModule for ${specifier} (${resolved})`)
    const _exports = executeModule(resolved, fromDir).exports
    trace('trace', `requireSync: ${specifier} loaded, exports keys: ${Object.keys(_exports as object).slice(0, 5).join(', ')}`)
    return _exports
  } catch (err: any) {
    // Rethrown for the caller to handle (packages try/catch optional deps like
    // fsevents/bufferutil); the stack is debug-only noise otherwise.
    if (isTraceEnabled()) {
      self.postMessage({ type: 'stderr', text: `[requireSync error] ${specifier} from ${fromDir}: ${err.message}\n${err.stack}\n` })
    }
    throw err
  }
}

export function clearModuleCache() {
  moduleCache.clear()
}

// Fingerprint (mtime + size) of each cached node_modules file, so resetForNewRun
// can tell which dependency files changed since they were cached.
const _cachedFingerprints = new Map<string, string>()

function fileFingerprint(filePath: string): string | null {
  try {
    const st = memfsInstance.statSync(filePath) as { mtimeMs: number; size: number }
    return `${st.mtimeMs}:${st.size}`
  } catch { return null }
}

/**
 * Prepare the module cache for a new `node`/dev-server run. User code (outside
 * node_modules) is always evicted so each run gets fresh-process semantics; the
 * immutable node_modules tree stays cached except for files that changed since
 * they were loaded (npm install, edits), avoiding a full re-transpile every run.
 */
export function resetForNewRun(): void {
  for (const key of moduleCache.keys()) {
    if (!key.includes('/node_modules/')) {
      moduleCache.delete(key)
      continue
    }
    if (fileFingerprint(key) !== _cachedFingerprints.get(key)) {
      moduleCache.delete(key)
      _cachedFingerprints.delete(key)
    }
  }
}
