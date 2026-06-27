import { describe, it, expect, vi, beforeEach } from 'vitest'
import { process } from '../src/worker/shims/process'

describe('process shim', () => {
  describe('identity fields', () => {
    it('has correct version string', () => {
      expect(process.version).toMatch(/^v\d+/)
    })

    it('platform is linux', () => {
      expect(process.platform).toBe('linux')
    })

    it('arch is x64', () => {
      expect(process.arch).toBe('x64')
    })

    it('cwd() returns /app', () => {
      expect(process.cwd()).toBe('/app')
    })

    it('pid is a number', () => {
      expect(typeof process.pid).toBe('number')
    })
  })

  describe('env', () => {
    it('has NODE_ENV', () => {
      expect(process.env.NODE_ENV).toBeDefined()
    })

    it('allows setting and reading env vars', () => {
      process.env.TEST_VAR = 'hello'
      expect(process.env.TEST_VAR).toBe('hello')
      delete process.env.TEST_VAR
    })
  })

  describe('nextTick', () => {
    it('fires callback asynchronously', async () => {
      let fired = false
      process.nextTick(() => { fired = true })
      expect(fired).toBe(false)
      await new Promise(r => queueMicrotask(r))
      expect(fired).toBe(true)
    })

    it('passes arguments to the callback', async () => {
      let received: unknown[] = []
      process.nextTick((...args) => { received = args }, 'a', 'b', 'c')
      await new Promise(r => queueMicrotask(r))
      expect(received).toEqual(['a', 'b', 'c'])
    })
  })

  describe('hrtime', () => {
    it('returns [seconds, nanoseconds] tuple', () => {
      const [s, ns] = process.hrtime()
      expect(typeof s).toBe('number')
      expect(typeof ns).toBe('number')
      expect(ns).toBeGreaterThanOrEqual(0)
      expect(ns).toBeLessThan(1_000_000_000)
    })

    it('computes diff when passed a start time', () => {
      const start = process.hrtime()
      const diff = process.hrtime(start)
      expect(diff[0]).toBeGreaterThanOrEqual(0)
      expect(diff[1]).toBeGreaterThanOrEqual(0)
    })

    it('hrtime.bigint returns a bigint', () => {
      const t = process.hrtime.bigint()
      expect(typeof t).toBe('bigint')
      expect(t).toBeGreaterThan(0n)
    })
  })

  describe('event emitter', () => {
    beforeEach(() => {
      process.removeAllListeners()
    })

    it('on + emit calls listener', () => {
      const calls: unknown[] = []
      process.on('test-event', (v) => calls.push(v))
      process.emit('test-event', 42)
      expect(calls).toEqual([42])
    })

    it('once fires only once', () => {
      const calls: unknown[] = []
      process.once('once-event', (v) => calls.push(v))
      process.emit('once-event', 1)
      process.emit('once-event', 2)
      expect(calls).toEqual([1])
    })

    it('off removes listener', () => {
      const calls: unknown[] = []
      const fn = (v: unknown) => calls.push(v)
      process.on('rm-event', fn)
      process.off('rm-event', fn)
      process.emit('rm-event', 99)
      expect(calls).toEqual([])
    })

    it('removeListener is alias for off', () => {
      const calls: unknown[] = []
      const fn = (v: unknown) => calls.push(v)
      process.on('rl-event', fn)
      process.removeListener('rl-event', fn)
      process.emit('rl-event', 1)
      expect(calls).toEqual([])
    })

    it('prependListener fires before later listeners', () => {
      const order: string[] = []
      process.on('order-event', () => order.push('second'))
      process.prependListener('order-event', () => order.push('first'))
      process.emit('order-event')
      expect(order).toEqual(['first', 'second'])
    })

    it('removeAllListeners clears a specific event', () => {
      const calls: unknown[] = []
      process.on('clear-event', () => calls.push('a'))
      process.on('keep-event', () => calls.push('b'))
      process.removeAllListeners('clear-event')
      process.emit('clear-event')
      process.emit('keep-event')
      expect(calls).toEqual(['b'])
    })

    it('listenerCount returns count', () => {
      const fn = () => {}
      process.on('count-event', fn)
      process.on('count-event', fn)
      expect(process.listenerCount('count-event')).toBe(2)
      process.removeAllListeners('count-event')
    })

    it('emit returns false when no listeners', () => {
      expect(process.emit('no-listeners-event')).toBe(false)
    })

    it('emit returns true when listeners exist', () => {
      const fn = () => {}
      process.on('has-listener', fn)
      expect(process.emit('has-listener')).toBe(true)
      process.removeAllListeners('has-listener')
    })
  })

  describe('stdout / stderr', () => {
    it('stdout.write posts message to self', () => {
      const msgs: unknown[] = (globalThis as unknown as { postMessageLog: unknown[] }).postMessageLog
      const prevLen = msgs.length
      process.stdout.write('hello stdout')
      expect(msgs.length).toBeGreaterThan(prevLen)
      const last = msgs[msgs.length - 1] as { type: string; text: string }
      expect(last.type).toBe('stdout')
      expect(last.text).toBe('hello stdout')
    })

    it('stderr.write posts message to self', () => {
      const msgs: unknown[] = (globalThis as unknown as { postMessageLog: unknown[] }).postMessageLog
      const prevLen = msgs.length
      process.stderr.write('oh no')
      const last = msgs[msgs.length - 1] as { type: string; text: string }
      expect(last.type).toBe('stderr')
      expect(last.text).toBe('oh no')
    })
  })

  describe('exit', () => {
    it('throws an error with the exit code', () => {
      expect(() => process.exit(1)).toThrow('process.exit(1)')
    })

    it('defaults to code 0', () => {
      expect(() => process.exit()).toThrow('process.exit(0)')
    })
  })

  describe('argv', () => {
    it('has at least two entries', () => {
      expect(process.argv.length).toBeGreaterThanOrEqual(2)
      expect(process.argv[0]).toBe('node')
    })
  })
})
