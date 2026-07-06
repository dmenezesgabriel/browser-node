import { describe, it, expect } from 'vitest'

import {
  exec,
  execSync,
  spawn,
  spawnSync,
  execFile,
  fork,
  ChildProcess,
} from '../src/worker/shims/child-process'

describe('child_process module exports', () => {
  it('exports exec as a function', () => {
    expect(typeof exec).toBe('function')
  })

  it('exports execSync as a function', () => {
    expect(typeof execSync).toBe('function')
  })

  it('exports spawn as a function', () => {
    expect(typeof spawn).toBe('function')
  })

  it('exports spawnSync as a function', () => {
    expect(typeof spawnSync).toBe('function')
  })

  it('exports execFile as a function', () => {
    expect(typeof execFile).toBe('function')
  })

  it('exports fork as a function', () => {
    expect(typeof fork).toBe('function')
  })

  it('exports ChildProcess class', () => {
    expect(typeof ChildProcess).toBe('function')
  })
})

describe('ChildProcess', () => {
  it('can be constructed with a pid', () => {
    const cp = new ChildProcess(42)
    expect(cp.pid).toBe(42)
  })

  it('has stdout/stderr/stdin streams', () => {
    const cp = new ChildProcess(1)
    expect(cp.stdout).toBeDefined()
    expect(cp.stderr).toBeDefined()
    expect(cp.stdin).toBeDefined()
  })

  it('starts with null exitCode and signalCode', () => {
    const cp = new ChildProcess(1)
    expect(cp.exitCode).toBeNull()
    expect(cp.signalCode).toBeNull()
  })

  it('kill sets killed flag and returns true', () => {
    const cp = new ChildProcess(1)
    expect(cp.killed).toBe(false)
    const result = cp.kill()
    expect(result).toBe(true)
    expect(cp.killed).toBe(true)
  })

  it('extends EventEmitter (on/emit)', () => {
    const cp = new ChildProcess(1)
    const calls: unknown[] = []
    cp.on('some-event', (v: unknown) => calls.push(v))
    cp.emit('some-event', 99)
    expect(calls).toEqual([99])
  })

  it('ref/unref return this', () => {
    const cp = new ChildProcess(1)
    expect(cp.ref()).toBe(cp)
    expect(cp.unref()).toBe(cp)
  })

  it('send returns false when no channel', () => {
    const cp = new ChildProcess(1)
    expect(cp.send('hello')).toBe(false)
  })

  it('disconnect does not throw when no channel', () => {
    const cp = new ChildProcess(1)
    expect(() => cp.disconnect()).not.toThrow()
  })

  it('has _channel property starting null', () => {
    const cp = new ChildProcess(1)
    expect(cp._channel).toBeNull()
  })
})
