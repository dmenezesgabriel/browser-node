import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Volume, createFsFromVolume } from 'memfs'
import { nodeToFsa } from 'memfs/lib/node-to-fsa'
import { hydrate, startMirror, reset, isAvailable } from '../src/worker/persist'

// The OPFS mirror is exercised against memfs's node-to-fsa adapter, which gives
// a real FileSystem*Handle shape backed by an in-memory volume (mock external
// I/O with a named fake, no real OPFS).

type Fs = ReturnType<typeof createFsFromVolume>

function makeOpfs() {
  const vol = new Volume()
  const fs = createFsFromVolume(vol)
  fs.mkdirSync('/opfs', { recursive: true })
  return nodeToFsa(fs, '/opfs', { mode: 'readwrite' }) as any
}

let workspace: Fs

beforeEach(() => {
  const vol = new Volume()
  workspace = createFsFromVolume(vol)
  workspace.mkdirSync('/app', { recursive: true })
  workspace.mkdirSync('/node_modules', { recursive: true })
  workspace.mkdirSync('/tmp', { recursive: true })
})

const tick = () => new Promise(r => setTimeout(r, 0))

describe('persist.hydrate', () => {
  it('restores files and directories from OPFS into the volume', async () => {
    const opfs = makeOpfs()
    const appDir = await opfs.getDirectoryHandle('app', { create: true })
    const fh = await appDir.getFileHandle('index.js', { create: true })
    const w = await fh.createWritable(); await w.write('console.log(1)'); await w.close()

    const n = await hydrate(workspace as any, opfs)
    expect(n).toBe(1)
    expect(workspace.readFileSync('/app/index.js', 'utf8')).toBe('console.log(1)')
  })
})

describe('persist.startMirror', () => {
  it('mirrors a written file to OPFS after the debounce', async () => {
    vi.useFakeTimers()
    const opfs = makeOpfs()
    const stop = startMirror(workspace as any, opfs, { debounceMs: 50 })
    workspace.writeFileSync('/app/new.js', 'x')
    await vi.advanceTimersByTimeAsync(60)
    vi.useRealTimers()
    await tick()

    const roundtrip = createFsFromVolume(new Volume())
    roundtrip.mkdirSync('/r', { recursive: true })
    const restored = await hydrate(roundtrip as any, opfs)
    expect(restored).toBeGreaterThanOrEqual(1)
    stop()
  })

  it('excludes /node_modules and /tmp from the mirror', async () => {
    vi.useFakeTimers()
    const opfs = makeOpfs()
    const stop = startMirror(workspace as any, opfs, { debounceMs: 50 })
    workspace.writeFileSync('/node_modules/dep.js', 'skip')
    workspace.writeFileSync('/tmp/scratch.txt', 'skip')
    workspace.writeFileSync('/app/keep.js', 'keep')
    await vi.advanceTimersByTimeAsync(60)
    vi.useRealTimers()
    await tick()

    // OPFS should have app/keep.js but not node_modules or tmp
    const names: string[] = []
    for await (const [name] of opfs.entries()) names.push(name)
    expect(names).toContain('app')
    expect(names).not.toContain('node_modules')
    expect(names).not.toContain('tmp')
    stop()
  })

  it('coalesces a burst of writes into one flush', async () => {
    vi.useFakeTimers()
    const opfs = makeOpfs()
    const spy = vi.spyOn(opfs, 'getDirectoryHandle')
    const stop = startMirror(workspace as any, opfs, { debounceMs: 50 })
    for (let i = 0; i < 5; i++) workspace.writeFileSync(`/app/f${i}.js`, 'x')
    await vi.advanceTimersByTimeAsync(30) // still within debounce window
    expect(spy).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(40) // debounce elapsed
    vi.useRealTimers()
    await tick()
    expect(spy).toHaveBeenCalled()
    stop()
  })
})

describe('persist.reset', () => {
  it('removes every persisted entry', async () => {
    const opfs = makeOpfs()
    const appDir = await opfs.getDirectoryHandle('app', { create: true })
    const fh = await appDir.getFileHandle('a.js', { create: true })
    const w = await fh.createWritable(); await w.write('x'); await w.close()

    await reset(opfs)
    const names: string[] = []
    for await (const [name] of opfs.entries()) names.push(name)
    expect(names).toEqual([])
  })
})

describe('persist.isAvailable', () => {
  it('returns false when navigator.storage.getDirectory is absent', () => {
    expect(isAvailable()).toBe(false)
  })
})
