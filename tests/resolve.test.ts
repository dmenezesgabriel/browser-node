import { describe, it, expect, beforeEach } from 'vitest'
import { vol, mkdirpSync, writeFileToVfs } from '../src/worker/vfs'
import { resolveModule, resolveModuleInVfs, requireSync, clearModuleCache } from '../src/worker/loader'
import { shimMap } from '../src/worker/shims/index'
import { bindRequireSync } from '../src/worker/shims/sync-registry'

interface NodeRequireLike {
  resolve(spec: string): string
}
interface ModuleShimLike {
  createRequire(base: string): NodeRequireLike
}

// Regression tests for the exports/imports resolver against the REAL loader
// (tests/loader.test.ts exercises a simplified reimplementation and cannot
// catch resolver bugs — see the vite/runtime failure these tests pin down).

function writePkg(name: string, pkgJson: Record<string, unknown>, files: Record<string, string>) {
  const root = `/node_modules/${name}`
  writeFileToVfs(`${root}/package.json`, JSON.stringify(pkgJson))
  for (const [rel, content] of Object.entries(files)) {
    writeFileToVfs(`${root}/${rel}`, content)
  }
}

beforeEach(() => {
  vol.reset()
  mkdirpSync('/app')
  mkdirpSync('/node_modules')
  clearModuleCache()
})

describe('package.json exports resolution', () => {
  it('resolves a subpath export with only an "import" condition (vite@5 ./runtime shape)', () => {
    // Exact shape from vite@5.4.x that produced "Cannot find module 'vite/runtime'"
    writePkg('vite', {
      name: 'vite',
      exports: {
        '.': { import: './dist/node/index.js' },
        './runtime': { types: './dist/node/runtime.d.ts', import: './dist/node/runtime.js' },
      },
    }, {
      'dist/node/index.js': 'module.exports = {}',
      'dist/node/runtime.js': 'module.exports = {}',
    })
    expect(resolveModule('vite/runtime', '/app')).toBe('/node_modules/vite/dist/node/runtime.js')
  })

  it('resolves a subpath pattern export ("./*")', () => {
    writePkg('patterned', {
      name: 'patterned',
      exports: { './*': './dist/*.js' },
    }, {
      'dist/feature.js': 'module.exports = "feature"',
    })
    expect(resolveModule('patterned/feature', '/app')).toBe('/node_modules/patterned/dist/feature.js')
  })

  it('resolves a root exports array fallback', () => {
    writePkg('arraypkg', {
      name: 'arraypkg',
      exports: { '.': [{ import: './esm/index.mjs' }, './cjs/index.cjs'] },
    }, {
      'cjs/index.cjs': 'module.exports = "cjs"',
    })
    expect(resolveModule('arraypkg', '/app')).toBe('/node_modules/arraypkg/cjs/index.cjs')
  })

  it('resolves root exports with only an "import" condition', () => {
    writePkg('esmonly', {
      name: 'esmonly',
      exports: { '.': { import: './dist/index.mjs' } },
    }, {
      'dist/index.mjs': 'export default "esm"',
    })
    expect(resolveModule('esmonly', '/app')).toBe('/node_modules/esmonly/dist/index.mjs')
  })

  it('still prefers the "require" condition over "import" when both exist', () => {
    writePkg('dual', {
      name: 'dual',
      exports: { '.': { require: './index.cjs', import: './index.mjs' } },
    }, {
      'index.cjs': 'module.exports = "cjs"',
      'index.mjs': 'export default "esm"',
    })
    expect(resolveModule('dual', '/app')).toBe('/node_modules/dual/index.cjs')
  })

  it('still resolves plain-string subpath exports (vite@8 ./module-runner shape)', () => {
    writePkg('plainsub', {
      name: 'plainsub',
      exports: { './module-runner': './dist/module-runner.js' },
    }, {
      'dist/module-runner.js': 'module.exports = {}',
    })
    expect(resolveModule('plainsub/module-runner', '/app')).toBe('/node_modules/plainsub/dist/module-runner.js')
  })

  it('falls back to direct file paths when a subpath is not in exports (next/dist/compiled shape)', () => {
    writePkg('nextlike', {
      name: 'nextlike',
      exports: { '.': './index.js' },
    }, {
      'index.js': 'module.exports = {}',
      'dist/compiled/tool/index.js': 'module.exports = "tool"',
      'dist/compiled/tool/package.json': '{"main":"index.js"}',
    })
    expect(resolveModule('nextlike/dist/compiled/tool', '/app')).toBe('/node_modules/nextlike/dist/compiled/tool/index.js')
  })
})

describe('package.json #imports resolution', () => {
  it('resolves a #import with only an "import" condition', () => {
    writePkg('privates', {
      name: 'privates',
      imports: { '#inner': { import: './src/inner.mjs' } },
    }, {
      'src/inner.mjs': 'export default "inner"',
      'index.js': 'module.exports = {}',
    })
    expect(resolveModule('#inner', '/node_modules/privates')).toBe('/node_modules/privates/src/inner.mjs')
  })

  it('still resolves a #import with a "require" condition', () => {
    writePkg('privreq', {
      name: 'privreq',
      imports: { '#dep': { require: './lib/dep.cjs', default: './lib/dep.mjs' } },
    }, {
      'lib/dep.cjs': 'module.exports = "dep"',
    })
    expect(resolveModule('#dep', '/node_modules/privreq')).toBe('/node_modules/privreq/lib/dep.cjs')
  })
})

describe('require.resolve on shimmed packages', () => {
  // vite@5 computes rollup's package.json location from require.resolve('rollup');
  // returning the bare shim name made it read '/package.json' (ENOENT), aborting
  // vite's chunk evaluation with empty exports.
  it('returns the real installed path when a shimmed package exists in the VFS', () => {
    bindRequireSync(requireSync, resolveModule, resolveModuleInVfs)
    writePkg('rollup', { name: 'rollup', main: 'dist/rollup.js' }, {
      'dist/rollup.js': 'module.exports = {}',
    })
    const moduleShim = shimMap['module'] as ModuleShimLike
    expect(moduleShim.createRequire('/app/index.js').resolve('rollup'))
      .toBe('/node_modules/rollup/dist/rollup.js')
  })

  it('returns the bare name for true builtins', () => {
    bindRequireSync(requireSync, resolveModule, resolveModuleInVfs)
    const moduleShim = shimMap['module'] as ModuleShimLike
    expect(moduleShim.createRequire('/app/index.js').resolve('fs')).toBe('fs')
  })
})
