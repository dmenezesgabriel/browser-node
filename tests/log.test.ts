import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { trace, setTraceEnabled, isTraceEnabled } from '../src/worker/log'

function getLog(): Array<{ type: string; text?: string }> {
  return (globalThis as unknown as { postMessageLog: Array<{ type: string; text?: string }> }).postMessageLog
}

describe('trace logging gate', () => {
  beforeEach(() => { setTraceEnabled(false); getLog().length = 0 })
  afterEach(() => {
    setTraceEnabled(false)
    delete (globalThis as { __BN_DEBUG?: boolean }).__BN_DEBUG
  })

  it('emits nothing when disabled (default)', () => {
    trace('loader', 'resolved foo')
    expect(getLog()).toHaveLength(0)
  })

  it('emits a namespaced stdout line when enabled', () => {
    setTraceEnabled(true)
    trace('loader', 'resolved foo')
    const msgs = getLog()
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toEqual({ type: 'stdout', text: '[loader] resolved foo\n' })
  })

  it('honors the globalThis.__BN_DEBUG escape hatch', () => {
    ;(globalThis as { __BN_DEBUG?: boolean }).__BN_DEBUG = true
    expect(isTraceEnabled()).toBe(true)
    trace('http', 'GET /')
    expect(getLog()).toHaveLength(1)
  })
})
