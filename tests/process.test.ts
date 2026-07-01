import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processShimExport as procShim } from '../src/worker/shims/process'

describe('procShim shim', () => {
  describe('identity fields', () => {
    it('has correct version string', () => {
      expect(procShim.version).toMatch(/^v\d+/)
    })

    it('platform is linux', () => {
      expect(procShim.platform).toBe('linux')
    })

    it('arch is x64', () => {
      expect(procShim.arch).toBe('x64')
    })

    it('cwd() returns /app', () => {
      expect(procShim.cwd()).toBe('/app')
    })

    it('pid is a number', () => {
      expect(typeof procShim.pid).toBe('number')
    })
  })

  describe('env', () => {
    it('has NODE_ENV', () => {
      expect(procShim.env.NODE_ENV).toBeDefined()
    })

    it('allows setting and reading env vars', () => {
      procShim.env.TEST_VAR = 'hello'
      expect(procShim.env.TEST_VAR).toBe('hello')
      delete procShim.env.TEST_VAR
    })
  })

  describe('nextTick', () => {
    it('fires callback asynchronously', async () => {
      let fired = false
      procShim.nextTick(() => { fired = true })
      expect(fired).toBe(false)
      await new Promise(r => setImmediate(r))
      expect(fired).toBe(true)
    })

    it('passes arguments to the callback', async () => {
      let received: unknown[] = []
      procShim.nextTick((...args) => { received = args }, 'a', 'b', 'c')
      await new Promise(r => setImmediate(r))
      expect(received).toEqual(['a', 'b', 'c'])
    })
  })

  describe('hrtime', () => {
    it('returns [seconds, nanoseconds] tuple', () => {
      const [s, ns] = procShim.hrtime()
      expect(typeof s).toBe('number')
      expect(typeof ns).toBe('number')
      expect(ns).toBeGreaterThanOrEqual(0)
      expect(ns).toBeLessThan(1_000_000_000)
    })

    it('computes diff when passed a start time', () => {
      const start = procShim.hrtime()
      const diff = procShim.hrtime(start)
      expect(diff[0]).toBeGreaterThanOrEqual(0)
      expect(diff[1]).toBeGreaterThanOrEqual(0)
    })

    it('hrtime.bigint returns a bigint', () => {
      const t = procShim.hrtime.bigint()
      expect(typeof t).toBe('bigint')
      expect(t).toBeGreaterThan(0n)
    })
  })

  describe('event emitter', () => {
    beforeEach(() => {
      procShim.removeAllListeners()
    })

    it('on + emit calls listener', () => {
      const calls: unknown[] = []
      procShim.on('test-event', (v) => calls.push(v))
      procShim.emit('test-event', 42)
      expect(calls).toEqual([42])
    })

    it('once fires only once', () => {
      const calls: unknown[] = []
      procShim.once('once-event', (v) => calls.push(v))
      procShim.emit('once-event', 1)
      procShim.emit('once-event', 2)
      expect(calls).toEqual([1])
    })

    it('off removes listener', () => {
      const calls: unknown[] = []
      const fn = (v: unknown) => calls.push(v)
      procShim.on('rm-event', fn)
      procShim.off('rm-event', fn)
      procShim.emit('rm-event', 99)
      expect(calls).toEqual([])
    })

    it('removeListener is alias for off', () => {
      const calls: unknown[] = []
      const fn = (v: unknown) => calls.push(v)
      procShim.on('rl-event', fn)
      procShim.removeListener('rl-event', fn)
      procShim.emit('rl-event', 1)
      expect(calls).toEqual([])
    })

    it('prependListener fires before later listeners', () => {
      const order: string[] = []
      procShim.on('order-event', () => order.push('second'))
      procShim.prependListener('order-event', () => order.push('first'))
      procShim.emit('order-event')
      expect(order).toEqual(['first', 'second'])
    })

    it('removeAllListeners clears a specific event', () => {
      const calls: unknown[] = []
      procShim.on('clear-event', () => calls.push('a'))
      procShim.on('keep-event', () => calls.push('b'))
      procShim.removeAllListeners('clear-event')
      procShim.emit('clear-event')
      procShim.emit('keep-event')
      expect(calls).toEqual(['b'])
    })

    it('listenerCount returns count', () => {
      const fn = () => {}
      procShim.on('count-event', fn)
      procShim.on('count-event', fn)
      expect(procShim.listenerCount('count-event')).toBe(2)
      procShim.removeAllListeners('count-event')
    })

    it('emit returns false when no listeners', () => {
      expect(procShim.emit('no-listeners-event')).toBe(false)
    })

    it('emit returns true when listeners exist', () => {
      const fn = () => {}
      procShim.on('has-listener', fn)
      expect(procShim.emit('has-listener')).toBe(true)
      procShim.removeAllListeners('has-listener')
    })
  })

  describe('stdout / stderr', () => {
    it('stdout.write posts message to self', () => {
      const msgs: unknown[] = (globalThis as unknown as { postMessageLog: unknown[] }).postMessageLog
      const prevLen = msgs.length
      procShim.stdout.write('hello stdout')
      expect(msgs.length).toBeGreaterThan(prevLen)
      const last = msgs[msgs.length - 1] as { type: string; text: string }
      expect(last.type).toBe('stdout')
      expect(last.text).toBe('hello stdout')
    })

    it('stderr.write posts message to self', () => {
      const msgs: unknown[] = (globalThis as unknown as { postMessageLog: unknown[] }).postMessageLog
      const prevLen = msgs.length
      procShim.stderr.write('oh no')
      const last = msgs[msgs.length - 1] as { type: string; text: string }
      expect(last.type).toBe('stderr')
      expect(last.text).toBe('oh no')
    })
  })

  describe('exit', () => {
    it('throws an error with the exit code', () => {
      expect(() => procShim.exit(1)).toThrow('process.exit(1)')
    })

    it('defaults to code 0', () => {
      expect(() => procShim.exit()).toThrow('process.exit(0)')
    })
  })

  describe('argv', () => {
    it('has at least two entries', () => {
      expect(procShim.argv.length).toBeGreaterThanOrEqual(2)
      expect(procShim.argv[0]).toBe('node')
    })
  })
})
