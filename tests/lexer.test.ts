import { describe, it, expect, beforeAll } from 'vitest'
import { initLexers, rewriteDynamicImports, cjsNamedExports, hasEsmSyntax, replaceImportMeta } from '../src/worker/lexer'

beforeAll(async () => { await initLexers() })

describe('rewriteDynamicImports', () => {
  const wrap = '(s => __import_fn(s, __dirname))'

  it('rewrites a bare dynamic import', () => {
    expect(rewriteDynamicImports(`const p = import('./real')`))
      .toBe(`const p = ${wrap}('./real')`)
  })

  it('rewrites await import', () => {
    expect(rewriteDynamicImports(`async function f(){ return await import("x") }`))
      .toBe(`async function f(){ return await ${wrap}("x") }`)
  })

  it('leaves import() inside string literals untouched', () => {
    const code = `const s = "import('./fake')"; const r = import('./real')`
    const out = rewriteDynamicImports(code)
    expect(out).toContain(`"import('./fake')"`)
    expect(out).toBe(`const s = "import('./fake')"; const r = ${wrap}('./real')`)
  })

  it('leaves import() inside comments untouched', () => {
    const code = `// import('./fake')\nconst r = import('./real')`
    const out = rewriteDynamicImports(code)
    expect(out).toBe(`// import('./fake')\nconst r = ${wrap}('./real')`)
  })

  it('leaves import() inside template text untouched but rewrites in expressions', () => {
    const code = 'const t = `import(x)`; const q = `a${import("./real")}b`'
    const out = rewriteDynamicImports(code)
    expect(out).toContain('`import(x)`')
    expect(out).toContain(`${wrap}("./real")`)
  })

  it('does not touch static import statements (already require after Sucrase)', () => {
    const code = `const x = require('a'); exports.y = 1`
    expect(rewriteDynamicImports(code)).toBe(code)
  })

  it('resolves the division-vs-regex ambiguity that the char scanner heuristic cannot', () => {
    // `const re = /import(x)/` is a regex literal; the following import() is real.
    const code = `const re = /import\\(x\\)/g; const r = import('./real')`
    const out = rewriteDynamicImports(code)
    expect(out).toContain('/import\\(x\\)/g')
    expect(out).toBe(`const re = /import\\(x\\)/g; const r = ${wrap}('./real')`)
  })

  it('handles multiple dynamic imports on one line without position drift', () => {
    const code = `import('a'); import('b'); import('c')`
    expect(rewriteDynamicImports(code)).toBe(`${wrap}('a'); ${wrap}('b'); ${wrap}('c')`)
  })

  it('returns input unchanged when there are no dynamic imports', () => {
    const code = `const a = 1 / 2; const b = 3 / 4`
    expect(rewriteDynamicImports(code)).toBe(code)
  })
})

describe('cjsNamedExports', () => {
  it('discovers exports.foo assignments', () => {
    expect(cjsNamedExports(`exports.add = () => {}; exports.sub = () => {}`).sort())
      .toEqual(['add', 'sub'])
  })

  it('discovers getter-backed exports statically, without executing the module', () => {
    // TypeScript/Babel CJS interop output — cjs-module-lexer (what Node uses)
    // recognizes these defineProperty getters via static analysis.
    const code = `Object.defineProperty(exports, "__esModule", { value: true });
      Object.defineProperty(exports, "foo", { enumerable: true, get: function () { return _foo.default; } });
      Object.defineProperty(exports, "bar", { enumerable: true, get: function () { return _bar.default; } });`
    const names = cjsNamedExports(code)
    expect(names).toContain('foo')
    expect(names).toContain('bar')
  })

  it('follows reexport chains via require', () => {
    const code = `module.exports = require('./other')`
    // reexports are returned separately; named exports may be empty but must not throw
    expect(() => cjsNamedExports(code)).not.toThrow()
  })

  it('returns empty for a module with no static exports', () => {
    expect(cjsNamedExports(`const x = 1; doSomething(x)`)).toEqual([])
  })
})

describe('hasEsmSyntax', () => {
  it('detects real static import/export statements', () => {
    expect(hasEsmSyntax(`import x from 'a'`)).toBe(true)
    expect(hasEsmSyntax(`export const y = 1`)).toBe(true)
    expect(hasEsmSyntax(`const u = import.meta.url`)).toBe(true)
  })

  it('is false for CJS even when "export"/"import" appear in strings (react.development.js case)', () => {
    // The old regex /\bexport\s/ matched these strings and wrongly skipped CJS
    // conversion, serving raw CJS that crashed with "exports is not defined".
    const cjs = `'use strict';
      var msg = "You likely forgot to export your component from the file";
      var hint = 'mixed up default and named imports.';
      exports.Foo = function () {};
      module.exports = exports;`
    expect(hasEsmSyntax(cjs)).toBe(false)
  })

  it('does not count a dynamic import() as ESM', () => {
    expect(hasEsmSyntax(`const p = import('./x'); module.exports = {}`)).toBe(false)
  })
})

describe('replaceImportMeta', () => {
  it('replaces a real import.meta reference', () => {
    expect(replaceImportMeta('const u = import.meta.url')).toBe('const u = __import_meta.url')
  })

  it('does NOT touch import.meta inside string/template literals (plugin-react HMR template)', () => {
    // @vitejs/plugin-react stores its HMR wrapper as a code-as-data string.
    const code = 'const refreshFooter = `if (import.meta.hot) { RefreshRuntime.__hmr_import(import.meta.url); }`'
    expect(replaceImportMeta(code)).toBe(code)
  })

  it('replaces real import.meta but leaves a string occurrence alone in the same file', () => {
    const code = 'const hint = "use import.meta.env"; const real = import.meta.env'
    expect(replaceImportMeta(code)).toBe('const hint = "use import.meta.env"; const real = __import_meta.env')
  })
})
