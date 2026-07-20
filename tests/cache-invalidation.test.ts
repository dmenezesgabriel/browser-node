import { describe, it, expect, beforeEach } from 'vitest'
import { vol, mkdirpSync, writeFileToVfs } from '../src/worker/vfs'
import { requireSync, resolveModule, resolveModuleInVfs, clearModuleCache, resetForNewRun, getSucraseTransform } from '../src/worker/loader'
import { bindRequireSync } from '../src/worker/shims/sync-registry'

// resetForNewRun gives user code fresh-process semantics on each run while
// keeping the immutable node_modules tree cached across runs — evicting only
// dependency modules whose files actually changed (npm install, edits).

const settle = () => new Promise(r => setTimeout(r, 30))

beforeEach(async () => {
  vol.reset()
  mkdirpSync('/app')
  mkdirpSync('/node_modules')
  bindRequireSync(requireSync, resolveModule, resolveModuleInVfs)
  await getSucraseTransform()
  clearModuleCache()
})

describe('resetForNewRun', () => {
  it('re-executes user (non-node_modules) modules on the next run', async () => {
    writeFileToVfs('/app/counter.js', 'module.exports = { n: (globalThis.__c = (globalThis.__c || 0) + 1) }')
    const first = requireSync('/app/counter.js', '/app') as { n: number }
    resetForNewRun()
    const second = requireSync('/app/counter.js', '/app') as { n: number }
    // Fresh execution → module body ran again → counter incremented.
    expect(second.n).toBe(first.n + 1)
  })

  it('keeps an unchanged node_modules module cached across runs (same instance)', async () => {
    writeFileToVfs('/node_modules/dep/package.json', '{"name":"dep","main":"index.js"}')
    writeFileToVfs('/node_modules/dep/index.js', 'module.exports = { marker: {} }')
    await settle() // let the initial-write watch event drain before first load
    const a = requireSync('dep', '/app') as { marker: object }
    resetForNewRun()
    const b = requireSync('dep', '/app') as { marker: object }
    expect(b.marker).toBe(a.marker) // not re-executed → same object identity
  })

  it('evicts a node_modules module whose file changed since the last run', async () => {
    writeFileToVfs('/node_modules/dep2/package.json', '{"name":"dep2","main":"index.js"}')
    writeFileToVfs('/node_modules/dep2/index.js', 'module.exports = { v: 1 }')
    await settle()
    const a = requireSync('dep2', '/app') as { v: number }
    expect(a.v).toBe(1)
    writeFileToVfs('/node_modules/dep2/index.js', 'module.exports = { v: 2 }')
    await settle() // watch records the change as dirty
    resetForNewRun()
    const b = requireSync('dep2', '/app') as { v: number }
    expect(b.v).toBe(2)
  })
})
