import { describe, it, expect, beforeEach } from 'vitest'
import { vol, mkdirpSync } from '../src/worker/vfs'
import { fs, fsPromises } from '../src/worker/shims/fs'

// Phase 3 regression: the fs shim used to return inert stub watchers even
// though memfs implements real fs.watch — hiding file events from Vite/HMR.

type WatchEvent = { eventType: string; filename: string | null }

function collectEvents(target: string, opts?: { recursive?: boolean }): { events: WatchEvent[]; close: () => void } {
  const events: WatchEvent[] = []
  const fsWatch = (fs as unknown as {
    watch: (p: string, o: unknown, l: (e: string, f: string | null) => void) => { close(): void }
  }).watch
  const watcher = fsWatch(target, opts ?? {}, (eventType, filename) => {
    events.push({ eventType, filename })
  })
  return { events, close: () => watcher.close() }
}

const settle = () => new Promise(r => setTimeout(r, 20))

beforeEach(() => {
  vol.reset()
  mkdirpSync('/watched')
})

describe('fs.watch (shim)', () => {
  it('emits on file creation and change in a watched directory', async () => {
    const { events, close } = collectEvents('/watched')
    vol.writeFileSync('/watched/a.txt', 'one')
    vol.writeFileSync('/watched/a.txt', 'two')
    await settle()
    close()
    expect(events.length).toBeGreaterThan(0)
    expect(events.some(e => e.filename === 'a.txt')).toBe(true)
  })

  it('emits rename on unlink', async () => {
    vol.writeFileSync('/watched/gone.txt', 'x')
    const { events, close } = collectEvents('/watched')
    vol.unlinkSync('/watched/gone.txt')
    await settle()
    close()
    expect(events.some(e => e.eventType === 'rename' && e.filename === 'gone.txt')).toBe(true)
  })

  it('supports recursive directory watching', async () => {
    mkdirpSync('/watched/deep/nested')
    const { events, close } = collectEvents('/watched', { recursive: true })
    vol.writeFileSync('/watched/deep/nested/file.txt', 'x')
    await settle()
    close()
    expect(events.some(e => (e.filename ?? '').includes('file.txt'))).toBe(true)
  })

  it('watchFile invokes the listener on change', async () => {
    vol.writeFileSync('/watched/stat.txt', 'v1')
    let calls = 0
    const watchFile = (fs as unknown as {
      watchFile: (p: string, o: unknown, l: () => void) => void
    }).watchFile
    const unwatchFile = (fs as unknown as { unwatchFile: (p: string) => void }).unwatchFile
    watchFile('/watched/stat.txt', { interval: 5 }, () => { calls++ })
    await settle()
    vol.writeFileSync('/watched/stat.txt', 'v2')
    await new Promise(r => setTimeout(r, 40))
    unwatchFile('/watched/stat.txt')
    expect(calls).toBeGreaterThan(0)
  })
})

describe('chokidar shim', () => {
  it('emits initial add + ready, then change and unlink', async () => {
    vol.writeFileSync('/watched/existing.txt', 'x')
    const { default: chokidar } = await import('../src/worker/shims/chokidar')
    const seen: Array<{ event: string; path: string }> = []
    const watcher = chokidar.watch('/watched')
    watcher.on('all', (event: string, p: string) => seen.push({ event, path: p }))
    const ready = new Promise<void>(r => watcher.on('ready', () => r()))
    await Promise.race([ready, new Promise(r => setTimeout(r, 300))])
    expect(seen.some(e => e.event === 'add' && e.path.endsWith('existing.txt'))).toBe(true)

    vol.writeFileSync('/watched/existing.txt', 'y')
    await new Promise(r => setTimeout(r, 120))
    expect(seen.some(e => e.event === 'change' && e.path.endsWith('existing.txt'))).toBe(true)

    vol.unlinkSync('/watched/existing.txt')
    await new Promise(r => setTimeout(r, 120))
    expect(seen.some(e => e.event === 'unlink' && e.path.endsWith('existing.txt'))).toBe(true)
    await watcher.close()
  })

  it('emits add for files created after watching starts', async () => {
    const { default: chokidar } = await import('../src/worker/shims/chokidar')
    const seen: Array<{ event: string; path: string }> = []
    const watcher = chokidar.watch('/watched')
    watcher.on('all', (event: string, p: string) => seen.push({ event, path: p }))
    await new Promise(r => setTimeout(r, 60))
    vol.writeFileSync('/watched/new.txt', 'x')
    await new Promise(r => setTimeout(r, 120))
    expect(seen.some(e => e.event === 'add' && e.path.endsWith('new.txt'))).toBe(true)
    await watcher.close()
  })
})

describe('fsPromises.watch (shim)', () => {
  it('yields change events as an async iterator', async () => {
    const iter = (fsPromises as unknown as {
      watch: (p: string) => AsyncIterable<WatchEvent> & { close?: () => void }
    }).watch('/watched')
    const received: WatchEvent[] = []
    const consume = (async () => {
      for await (const ev of iter) {
        received.push(ev)
        if (received.length >= 1) break
      }
    })()
    await settle()
    vol.writeFileSync('/watched/p.txt', 'x')
    await Promise.race([consume, new Promise(r => setTimeout(r, 200))])
    expect(received.some(e => e.filename === 'p.txt')).toBe(true)
  })
})
