import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from '../src/worker/shims/events'

describe('EventEmitter shim', () => {
  it('on + emit calls listener with args', () => {
    const ee = new EventEmitter()
    const fn = vi.fn()
    ee.on('data', fn)
    ee.emit('data', 42, 'hello')
    expect(fn).toHaveBeenCalledWith(42, 'hello')
  })

  it('multiple listeners all called', () => {
    const ee = new EventEmitter()
    const a = vi.fn(), b = vi.fn()
    ee.on('x', a).on('x', b)
    ee.emit('x')
    expect(a).toHaveBeenCalledOnce()
    expect(b).toHaveBeenCalledOnce()
  })

  it('once fires only once', () => {
    const ee = new EventEmitter()
    const fn = vi.fn()
    ee.once('ping', fn)
    ee.emit('ping')
    ee.emit('ping')
    expect(fn).toHaveBeenCalledOnce()
  })

  it('off removes listener', () => {
    const ee = new EventEmitter()
    const fn = vi.fn()
    ee.on('e', fn)
    ee.off('e', fn)
    ee.emit('e')
    expect(fn).not.toHaveBeenCalled()
  })

  it('removeAllListeners clears an event', () => {
    const ee = new EventEmitter()
    const fn = vi.fn()
    ee.on('e', fn).on('e', fn)
    ee.removeAllListeners('e')
    ee.emit('e')
    expect(fn).not.toHaveBeenCalled()
  })

  it('removeAllListeners with no arg clears all', () => {
    const ee = new EventEmitter()
    const fn = vi.fn()
    ee.on('a', fn).on('b', fn)
    ee.removeAllListeners()
    ee.emit('a'); ee.emit('b')
    expect(fn).not.toHaveBeenCalled()
  })

  it('emit returns false when no listeners', () => {
    const ee = new EventEmitter()
    expect(ee.emit('nope')).toBe(false)
  })

  it('emit returns true when listeners exist', () => {
    const ee = new EventEmitter()
    ee.on('yes', () => {})
    expect(ee.emit('yes')).toBe(true)
  })

  it('listenerCount', () => {
    const ee = new EventEmitter()
    ee.on('a', () => {}).on('a', () => {})
    expect(ee.listenerCount('a')).toBe(2)
    expect(ee.listenerCount('b')).toBe(0)
  })

  it('listeners() returns copy', () => {
    const ee = new EventEmitter()
    const fn = () => {}
    ee.on('e', fn)
    const list = ee.listeners('e')
    expect(list).toHaveLength(1)
    expect(list[0]).toBe(fn)
    // mutating the returned array doesn't affect the emitter
    list.pop()
    expect(ee.listenerCount('e')).toBe(1)
  })

  it('addListener is alias for on', () => {
    const ee = new EventEmitter()
    const fn = vi.fn()
    ee.addListener('ev', fn)
    ee.emit('ev')
    expect(fn).toHaveBeenCalled()
  })

  it('handles circular-style events without blowing up', () => {
    const ee = new EventEmitter()
    let count = 0
    ee.on('tick', () => { if (++count < 3) ee.emit('tick') })
    ee.emit('tick')
    expect(count).toBe(3)
  })
})
