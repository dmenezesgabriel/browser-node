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
