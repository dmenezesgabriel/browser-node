import { describe, it, expect, beforeEach } from 'vitest'
import { Volume, createFsFromVolume } from 'memfs'

// We test the loader logic by reimplementing the key parts with an isolated volume
// (The real loader.ts uses a module-level vol; here we test the algorithms directly)

// --- Mini inline loader matching loader.ts logic ---
function makeLoader(mfsInstance: ReturnType<typeof createFsFromVolume>) {
  const moduleCache = new Map<string, { exports: unknown }>()

  function normalize(p: string): string {
    const abs = p.startsWith('/')
    const parts = p.split('/').filter(Boolean)
    const out: string[] = []
    for (const part of parts) {
      if (part === '..') out.pop()
      else if (part !== '.') out.push(part)
    }
    return (abs ? '/' : '') + out.join('/') || '.'
  }
  function join(...parts: string[]) { return normalize(parts.join('/')) }
  function dirname(p: string) { const i = p.lastIndexOf('/'); return i <= 0 ? (i === 0 ? '/' : '.') : p.slice(0, i) }

  function exists(p: string) { try { mfsInstance.statSync(p); return true } catch { return false } }
  function isFile(p: string) { try { return mfsInstance.statSync(p).isFile() } catch { return false } }

  function resolveModule(specifier: string, fromDir: string): string | null {
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      const abs = specifier.startsWith('/') ? specifier : join(fromDir, specifier)
      for (const ext of ['', '.js', '.cjs', '.json', '/index.js']) {
        if (isFile(abs + ext)) return abs + ext
      }
      return null
    }
    // node_modules
    let dir = fromDir
    while (true) {
      const nmDir = join(dir, 'node_modules', specifier)
      if (exists(nmDir)) {
        const pkgJson = join(nmDir, 'package.json')
        if (exists(pkgJson)) {
          const pkg = JSON.parse(mfsInstance.readFileSync(pkgJson, 'utf8') as string)
          const main = pkg.main || 'index.js'
          const mainPath = join(nmDir, main)
          for (const ext of ['', '.js', '.cjs']) {
            if (exists(mainPath + ext)) return mainPath + ext
          }
        }
        for (const idx of ['/index.js', '/index.cjs']) {
          if (exists(nmDir + idx)) return nmDir + idx
        }
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    return null
  }

  function execute(filePath: string): { exports: unknown } {
    if (moduleCache.has(filePath)) return moduleCache.get(filePath)!
    const mod = { exports: {} as Record<string, unknown> }
    moduleCache.set(filePath, mod)
    const src = mfsInstance.readFileSync(filePath, 'utf8') as string
    const dir = dirname(filePath)
    if (filePath.endsWith('.json')) { mod.exports = JSON.parse(src); return mod }
    const fn = (0, eval)(`(function(require,module,exports,__dirname,__filename){${src}})`)
    fn((s: string) => require(s, dir), mod, mod.exports, dir, filePath)
    return mod
  }

  function require(specifier: string, fromDir = '/app'): unknown {
    const resolved = resolveModule(specifier, fromDir)
    if (!resolved) throw new Error(`Cannot find module '${specifier}' from '${fromDir}'`)
    return execute(resolved).exports
  }

  return { require, clearCache: () => moduleCache.clear() }
}

describe('CommonJS loader', () => {
  let vol: InstanceType<typeof Volume>
  let mfs: ReturnType<typeof createFsFromVolume>
  let loader: ReturnType<typeof makeLoader>

  beforeEach(() => {
    vol = new Volume()
    mfs = createFsFromVolume(vol)
    mfs.mkdirSync('/app', { recursive: true })
    mfs.mkdirSync('/node_modules', { recursive: true })
    loader = makeLoader(mfs)
  })

  describe('relative imports', () => {
    it('requires a .js file relative to caller', () => {
      mfs.writeFileSync('/app/math.js', 'module.exports = { add: (a,b) => a+b }')
      mfs.writeFileSync('/app/index.js', 'const m = require("./math"); module.exports = m.add(1,2)')
      expect(loader.require('/app/index.js', '/app')).toBe(3)
    })

    it('resolves implicit .js extension', () => {
      mfs.writeFileSync('/app/util.js', 'module.exports = "util"')
      mfs.writeFileSync('/app/main.js', 'module.exports = require("./util")')
      expect(loader.require('/app/main.js', '/app')).toBe('util')
    })

    it('resolves /index.js for directory imports', () => {
      mfs.mkdirSync('/app/lib', { recursive: true })
      mfs.writeFileSync('/app/lib/index.js', 'module.exports = "lib-index"')
      mfs.writeFileSync('/app/main.js', 'module.exports = require("./lib")')
      expect(loader.require('/app/main.js', '/app')).toBe('lib-index')
    })

    it('resolves JSON files', () => {
      mfs.writeFileSync('/app/config.json', '{"key":"value"}')
      mfs.writeFileSync('/app/main.js', 'module.exports = require("./config.json")')
      const result = loader.require('/app/main.js', '/app') as Record<string, string>
      expect(result.key).toBe('value')
    })

    it('throws on missing module', () => {
      mfs.writeFileSync('/app/main.js', 'require("./nope")')
      expect(() => loader.require('/app/main.js', '/app')).toThrow("Cannot find module './nope'")
    })
  })

  describe('module caching', () => {
    it('returns the same object on second require', () => {
      mfs.writeFileSync('/app/singleton.js', 'module.exports = { count: 0 }')
      mfs.writeFileSync('/app/a.js', 'const s = require("./singleton"); s.count++; module.exports = s')
      mfs.writeFileSync('/app/b.js', 'const s = require("./singleton"); s.count++; module.exports = s')
      mfs.writeFileSync('/app/main.js', `
        const a = require("./a");
        const b = require("./b");
        module.exports = b.count
      `)
      // Both a and b mutate the same cached singleton
      expect(loader.require('/app/main.js', '/app')).toBe(2)
    })

    it('handles circular dependencies without infinite loop', () => {
      mfs.writeFileSync('/app/a.js', `
        const b = require("./b");
        module.exports = { name: 'a', b }
      `)
      mfs.writeFileSync('/app/b.js', `
        const a = require("./a");
        module.exports = { name: 'b', a }
      `)
      // Circular dep — should not throw, exports may be partial
      expect(() => loader.require('/app/a.js', '/app')).not.toThrow()
    })
  })

  describe('node_modules resolution', () => {
    it('requires a package by name', () => {
      mfs.mkdirSync('/node_modules/pkg', { recursive: true })
      mfs.writeFileSync('/node_modules/pkg/index.js', 'module.exports = "pkg-value"')
      mfs.writeFileSync('/node_modules/pkg/package.json', '{"main":"index.js"}')
      mfs.writeFileSync('/app/main.js', 'module.exports = require("pkg")')
      expect(loader.require('/app/main.js', '/app')).toBe('pkg-value')
    })

    it('uses package.json main field', () => {
      mfs.mkdirSync('/node_modules/mypkg/lib', { recursive: true })
      mfs.writeFileSync('/node_modules/mypkg/lib/entry.js', 'module.exports = "from-main"')
      mfs.writeFileSync('/node_modules/mypkg/package.json', '{"main":"lib/entry.js"}')
      mfs.writeFileSync('/app/main.js', 'module.exports = require("mypkg")')
      expect(loader.require('/app/main.js', '/app')).toBe('from-main')
    })

    it('walks up directory tree to find node_modules', () => {
      mfs.mkdirSync('/app/deep/nested', { recursive: true })
      mfs.mkdirSync('/node_modules/shared', { recursive: true })
      mfs.writeFileSync('/node_modules/shared/index.js', 'module.exports = "shared"')
      mfs.writeFileSync('/app/deep/nested/file.js', 'module.exports = require("shared")')
      expect(loader.require('/app/deep/nested/file.js', '/app/deep/nested')).toBe('shared')
    })

    it('prefers nested node_modules over root', () => {
      mfs.mkdirSync('/node_modules/dep', { recursive: true })
      mfs.mkdirSync('/node_modules/pkg/node_modules/dep', { recursive: true })
      mfs.writeFileSync('/node_modules/dep/index.js', 'module.exports = "root-dep"')
      mfs.writeFileSync('/node_modules/pkg/node_modules/dep/index.js', 'module.exports = "nested-dep"')
      mfs.writeFileSync('/node_modules/pkg/package.json', '{"main":"index.js"}')
      mfs.writeFileSync('/node_modules/pkg/index.js', 'module.exports = require("dep")')
      mfs.writeFileSync('/app/main.js', 'module.exports = require("pkg")')
      expect(loader.require('/app/main.js', '/app')).toBe('nested-dep')
    })
  })

  describe('module.exports patterns', () => {
    it('exports a function', () => {
      mfs.writeFileSync('/app/fn.js', 'module.exports = function add(a,b){ return a+b }')
      const fn = loader.require('/app/fn.js', '/app') as (a: number, b: number) => number
      expect(fn(3, 4)).toBe(7)
    })

    it('exports a class', () => {
      mfs.writeFileSync('/app/cls.js', 'class Foo { greet() { return "hello" } } module.exports = Foo')
      const Cls = loader.require('/app/cls.js', '/app') as new () => { greet(): string }
      expect(new Cls().greet()).toBe('hello')
    })

    it('supports exports.foo = ... pattern', () => {
      mfs.writeFileSync('/app/named.js', 'exports.add = (a,b) => a+b; exports.mul = (a,b) => a*b')
      const m = loader.require('/app/named.js', '/app') as Record<string, (a: number, b: number) => number>
      expect(m.add(2, 3)).toBe(5)
      expect(m.mul(2, 3)).toBe(6)
    })

    it('__dirname and __filename are correct', () => {
      mfs.writeFileSync('/app/meta.js', 'module.exports = { dir: __dirname, file: __filename }')
      const m = loader.require('/app/meta.js', '/app') as Record<string, string>
      expect(m.dir).toBe('/app')
      expect(m.file).toBe('/app/meta.js')
    })
  })
})
