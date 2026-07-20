// Thin wrappers around the maintained lexers Vite/Node themselves use:
//  - es-module-lexer: locates dynamic import() calls (handles strings, comments,
//    template literals, and the division-vs-regex ambiguity a char scanner cannot).
//  - cjs-module-lexer: discovers a CJS module's named exports statically, without
//    executing it (finds transpiler getter exports too).
// Both need a one-time wasm init, awaited in the loader's preloadShims().
import { init as initEsmLexer, parse as parseEsm } from 'es-module-lexer'
import * as cjsLexer from 'cjs-module-lexer'

const DYNAMIC_IMPORT_WRAP = '(s => __import_fn(s, __dirname))'

let _ready: Promise<void> | null = null

export function initLexers(): Promise<void> {
  if (!_ready) {
    _ready = Promise.all([initEsmLexer, cjsLexer.init()]).then(() => undefined)
  }
  return _ready
}

/**
 * Rewrite every dynamic `import(spec)` to `(s => __import_fn(s, __dirname))(spec)`
 * so it routes through the VFS-aware loader. Applied to post-Sucrase source, where
 * only dynamic imports remain. import.meta and static import statements are left
 * alone. Returns the input unchanged if the lexer can't parse it (caller falls
 * back to the char scanner).
 *
 * @example rewriteDynamicImports("await import('./x')") // "await (s => __import_fn(s, __dirname))('./x')"
 */
export function rewriteDynamicImports(code: string): string {
  const [imports] = parseEsm(code)
  // Dynamic imports have d > -1 (d is the index of the opening paren). Rewrite
  // right-to-left so earlier edits don't shift later positions.
  const dynamic = imports.filter(i => i.d > -1).sort((a, b) => b.ss - a.ss)
  if (dynamic.length === 0) return code
  let out = code
  for (const imp of dynamic) {
    // [ss, d) spans the `import` keyword (and any trailing whitespace); the
    // paren at d and the argument list are preserved.
    out = out.slice(0, imp.ss) + DYNAMIC_IMPORT_WRAP + out.slice(imp.d)
  }
  return out
}

/**
 * True if the source has real ESM syntax — a static import/export statement or
 * `import.meta` — as opposed to the words "import"/"export" appearing in strings
 * or comments (e.g. react.development.js's error messages). A dynamic `import()`
 * alone does NOT count (CJS may use it). Used to decide whether a node_modules
 * file needs CJS→ESM conversion. Falls back to true (leave as-is) on parse error.
 */
export function hasEsmSyntax(code: string): boolean {
  try {
    const [imports, exports] = parseEsm(code)
    if (exports.length > 0) return true
    // d === -1: static import statement; d === -2: import.meta. d > -1: dynamic.
    return imports.some(i => i.d === -1 || i.d === -2)
  } catch {
    return true
  }
}

/**
 * Replace real `import.meta` references with `__import_meta` (the binding the
 * loader's module wrapper injects), leaving occurrences inside strings/comments
 * alone. A blind regex corrupts code-as-data — notably @vitejs/plugin-react's HMR
 * wrapper templates, which contain `import.meta.hot` as a string and would break
 * every served .tsx with "__import_meta is not defined". es-module-lexer reports
 * import.meta as an import with d === -2 (ss..se spans "import.meta"). Falls back
 * to the blind regex only if the lexer can't parse the source.
 */
export function replaceImportMeta(code: string): string {
  try {
    const [imports] = parseEsm(code)
    const metas = imports.filter(i => i.d === -2).sort((a, b) => b.ss - a.ss)
    let out = code
    for (const m of metas) out = out.slice(0, m.ss) + '__import_meta' + out.slice(m.se)
    return out
  } catch {
    return code.replace(/\bimport\.meta\b/g, '__import_meta')
  }
}

/** Named exports of a CJS module, discovered statically. Empty on parse failure. */
export function cjsNamedExports(code: string): string[] {
  try {
    return cjsLexer.parse(code).exports.filter(name => name !== '__esModule')
  } catch {
    return []
  }
}

/** Reexport specifiers (`module.exports = require('x')` / star reexports). */
export function cjsReexports(code: string): string[] {
  try {
    return cjsLexer.parse(code).reexports
  } catch {
    return []
  }
}
