import { describe, it, expect, beforeEach } from 'vitest'
import { vol, mkdirpSync, writeFileToVfs } from '../src/worker/vfs'
import { requireSync, getSucraseTransform, clearModuleCache } from '../src/worker/loader'

// Execution-semantics regressions for the real loader (ESM run through the
// CJS-style async wrapper after Sucrase).

beforeEach(async () => {
  vol.reset()
  mkdirpSync('/app')
  mkdirpSync('/node_modules')
  clearModuleCache()
  await getSucraseTransform()
})

describe('ESM executed through the CJS wrapper', () => {
  it('keeps all exports when the module declares its own `var exports` binding', () => {
    // vite@5's dist chunk bundles a dep with a module-scope `var exports = {…}`
    // — legal ESM, but it rebinds our wrapper's `exports` param, splitting
    // Sucrase's export assignments across two objects (react/vue-todo failure).
    writeFileToVfs('/node_modules/esmvarexports/package.json', JSON.stringify({
      name: 'esmvarexports', type: 'module', main: 'index.js',
    }))
    writeFileToVfs('/node_modules/esmvarexports/index.js', [
      'export function early() { return "early" }',
      'var exports = { privateOfDep: 1 };',
      'exports.privateOfDep = 2;',
      'export const late = 42;',
    ].join('\n'))
    const m = requireSync('esmvarexports', '/app') as Record<string, unknown>
    expect(typeof m.early).toBe('function')
    expect(m.late).toBe(42)
  })

  it('keeps exports for plain ESM without collisions (control)', () => {
    writeFileToVfs('/node_modules/esmplain/package.json', JSON.stringify({
      name: 'esmplain', type: 'module', main: 'index.js',
    }))
    writeFileToVfs('/node_modules/esmplain/index.js', 'export const value = 7;')
    const m = requireSync('esmplain', '/app') as Record<string, unknown>
    expect(m.value).toBe(7)
  })
})
