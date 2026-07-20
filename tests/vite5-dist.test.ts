import { describe, it, expect } from 'vitest'
import { mkdirpSync } from '../src/worker/vfs'
import { requireSync, resolveModule, resolveModuleInVfs, getSucraseTransform } from '../src/worker/loader'
import { bindRequireSync } from '../src/worker/shims/sync-registry'
import { install } from '../src/worker/npm'

// Integration regression for react-todo/vue-todo: install vite@5 into the real
// VFS via the project's npm installer, then require its dist through the real
// loader — the same path `npm run dev` takes in the browser worker. Pins the
// resolver fix (vite/runtime import-only condition) and the `var exports`
// rebinding fix in the dist chunk.
// Network-dependent (npm registry); opt in with VITE5_INTEGRATION=1.
// hostEnv: real Node env snapshotted in tests/setup.ts before the process shim
// replaces globalThis.process.
const hostEnv = (globalThis as unknown as { hostEnv?: Record<string, string> }).hostEnv
describe.runIf(hostEnv?.VITE5_INTEGRATION === '1')('vite@5 dist through the real loader', () => {
  it('loads with createServer exported', { timeout: 300000 }, async () => {
    bindRequireSync(requireSync, resolveModule, resolveModuleInVfs)
    await getSucraseTransform()
    mkdirpSync('/app')
    await install({ vite: '5.4.21' }, '/node_modules')
    const viteApi = requireSync('vite/dist/node/index.js', '/app') as Record<string, unknown>
    expect(Object.keys(viteApi)).toContain('createServer')
    expect(typeof viteApi.createServer).toBe('function')
  })
})
