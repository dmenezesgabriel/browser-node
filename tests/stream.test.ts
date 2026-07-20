import { describe, it, expect, vi } from 'vitest'
import { Readable, Writable, Transform, PassThrough } from '../src/worker/shims/stream'

describe('Stream shims', () => {
  describe('Writable', () => {
    it('write() returns true', () => {
      const w = new Writable()
      expect(w.write('hello')).toBe(true)
    })

    it('end() emits finish', async () => {
      const w = new Writable()
      const finish = vi.fn()
      w.on('finish', finish)
      w.end()
      await new Promise(r => setTimeout(r, 0))
      expect(finish).toHaveBeenCalled()
    })

    it('getContents() collects all written chunks', () => {
      const w = new Writable()
      w.write('foo')
      w.write('bar')
      w.end('baz')
      expect(w.getContents()).toBe('foobarbaz')
    })

    it('write() calls callback', () => {
      const w = new Writable()
      const cb = vi.fn()
      w.write('x', undefined, cb)
      expect(cb).toHaveBeenCalled()
    })

    it('end() calls callback', () => {
      const w = new Writable()
      const cb = vi.fn()
      w.end('x', undefined, cb)
      expect(cb).toHaveBeenCalled()
    })

    it('accepts Uint8Array chunks', () => {
      const w = new Writable()
      w.write(new TextEncoder().encode('bytes'))
      expect(w.getContents()).toBe('bytes')
    })
  })

  describe('Readable', () => {
    it('Readable.from() emits data then end', async () => {
      const chunks: unknown[] = []
      const r = Readable.from(['a', 'b', 'c'])
      r.on('data', c => chunks.push(c))
      await new Promise(r2 => setTimeout(r2, 10))
      expect(chunks).toEqual(['a', 'b', 'c'])
    })

    it('pipe() connects readable to writable', async () => {
      const r = Readable.from(['x', 'y'])
      const w = new Writable()
      r.pipe(w)
      await new Promise(r2 => setTimeout(r2, 10))
      expect(w.getContents()).toBe('xy')
    })

    it('pause/resume are no-ops that return this', () => {
      const r = new Readable()
      expect(r.pause()).toBe(r)
      expect(r.resume()).toBe(r)
    })
  })

  describe('Transform / PassThrough', () => {
    it('PassThrough extends Writable', () => {
      const p = new PassThrough()
      expect(p).toBeInstanceOf(Writable)
    })

    it('Transform extends Writable', () => {
      const t = new Transform()
      expect(t).toBeInstanceOf(Writable)
    })

    it('PassThrough collects written chunks', () => {
      const p = new PassThrough()
      p.write('hello')
      p.end(' world')
      expect(p.getContents()).toBe('hello world')
    })
  })
})

// Pull-model regression: readdirp (used by chokidar, bundled inside vite)
// subclasses Readable with _read()+push(); the shim must drive _read or
// directory scans silently yield nothing and Vite HMR watching dies.
describe('Readable pull model', () => {
  class SyncPull extends (Readable as any) {
    i = 0
    _read() { if (this.i < 3) this.push(this.i++); else this.push(null) }
  }

  it('drives _read when a data listener attaches and ends after push(null)', async () => {
    const r = new SyncPull()
    const got: number[] = []
    const ended = new Promise<void>(res => r.on('end', () => res()))
    r.on('data', (d: number) => got.push(d))
    await Promise.race([ended, new Promise(res => setTimeout(res, 300))])
    expect(got).toEqual([0, 1, 2])
    expect(r.readableEnded).toBe(true)
  })

  it('supports asynchronous _read', async () => {
    class AsyncPull extends (Readable as any) {
      i = 0
      _read() { setTimeout(() => { if (this.i < 2) this.push('c' + this.i++); else this.push(null) }, 5) }
    }
    const r = new AsyncPull()
    const got: string[] = []
    const ended = new Promise<void>(res => r.on('end', () => res()))
    r.on('data', (d: string) => got.push(d))
    await Promise.race([ended, new Promise(res => setTimeout(res, 500))])
    expect(got).toEqual(['c0', 'c1'])
  })

  it('buffers pushes made before a data listener attaches', async () => {
    const r = new (Readable as any)()
    r.push('early')
    r.push(null)
    const got: string[] = []
    r.on('data', (d: string) => got.push(d))
    await new Promise(res => setTimeout(res, 50))
    expect(got).toEqual(['early'])
    expect(r.readableEnded).toBe(true)
  })

  it('Readable.from delivers to listeners attached after creation', async () => {
    const r = (Readable as any).from(['a', 'b'])
    await new Promise(res => setTimeout(res, 10))
    const got: string[] = []
    r.on('data', (d: string) => got.push(d))
    await new Promise(res => setTimeout(res, 50))
    expect(got).toEqual(['a', 'b'])
  })

  it('supports for-await iteration', async () => {
    const r = new SyncPull()
    const got: number[] = []
    for await (const chunk of r) got.push(chunk)
    expect(got).toEqual([0, 1, 2])
  })
})
