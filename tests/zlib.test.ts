import { describe, it, expect } from 'vitest'
import { shimMap } from '../src/worker/shims/index'

// The `destroy` module (used by express.static/send) does `stream instanceof
// Zlib.Gzip`. Node's zlib exports these as constructors; our shim only had
// lowercase helpers, so `Zlib.Gzip` was undefined and instanceof threw
// "Right-hand side of 'instanceof' is not an object".
const zlib = shimMap['zlib'] as Record<string, unknown>

describe('zlib shim', () => {
  const constructors = ['Gzip', 'Gunzip', 'Deflate', 'DeflateRaw', 'Inflate', 'InflateRaw', 'Unzip']

  it.each(constructors)('exports %s as a constructor', (name) => {
    expect(typeof zlib[name]).toBe('function')
  })

  it('lets `x instanceof zlib.Gzip` evaluate without throwing (returns false for a plain stream)', () => {
    const plain = {}
    expect(() => plain instanceof (zlib.Gzip as new () => unknown)).not.toThrow()
    expect(plain instanceof (zlib.Gzip as new () => unknown)).toBe(false)
  })

  it('keeps the existing helper functions', () => {
    expect(typeof zlib.gzip).toBe('function')
    expect(typeof zlib.createGunzip).toBe('function')
  })
})
