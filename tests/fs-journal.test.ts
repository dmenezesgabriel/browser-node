import { describe, it, expect, beforeEach } from 'vitest'
import { Volume, createFsFromVolume } from 'memfs'
import { attachJournalSender, applyJournalEntry, type JournalEntry } from '../src/worker/fs-journal'

// The write-journal propagates a child worker's filesystem mutations back to the
// parent volume (child→parent, eventual-consistency à la Nodebox). The child's
// mutating fs ops post journal entries; the parent applies them in order.

let childFs: ReturnType<typeof createFsFromVolume>
let parentFs: ReturnType<typeof createFsFromVolume>
let pipe: (entry: JournalEntry) => void

beforeEach(() => {
  const childVol = new Volume(); childFs = createFsFromVolume(childVol)
  const parentVol = new Volume(); parentFs = createFsFromVolume(parentVol)
  childFs.mkdirSync('/app', { recursive: true })
  parentFs.mkdirSync('/app', { recursive: true })
  // Simulate the MessagePort: entries the child emits are applied to the parent.
  pipe = (entry) => applyJournalEntry(parentFs as unknown as Record<string, unknown>, entry)
  attachJournalSender(childFs as unknown as Record<string, unknown>, pipe)
})

describe('fs-journal', () => {
  it('propagates a child writeFileSync to the parent', () => {
    childFs.writeFileSync('/app/out.txt', 'hello')
    expect(parentFs.readFileSync('/app/out.txt', 'utf8')).toBe('hello')
  })

  it('propagates mkdir + nested write in order', () => {
    childFs.mkdirSync('/app/sub')
    childFs.writeFileSync('/app/sub/f.txt', 'x')
    expect(parentFs.readFileSync('/app/sub/f.txt', 'utf8')).toBe('x')
  })

  it('propagates unlink', () => {
    childFs.writeFileSync('/app/gone.txt', 'x')
    expect(parentFs.existsSync('/app/gone.txt')).toBe(true)
    childFs.unlinkSync('/app/gone.txt')
    expect(parentFs.existsSync('/app/gone.txt')).toBe(false)
  })

  it('propagates rename', () => {
    childFs.writeFileSync('/app/a.txt', 'data')
    childFs.renameSync('/app/a.txt', '/app/b.txt')
    expect(parentFs.existsSync('/app/a.txt')).toBe(false)
    expect(parentFs.readFileSync('/app/b.txt', 'utf8')).toBe('data')
  })

  it('applies rename-after-write correctly when replayed in order', () => {
    const entries: JournalEntry[] = []
    const childVol = new Volume(); const cfs = createFsFromVolume(childVol)
    cfs.mkdirSync('/app', { recursive: true })
    attachJournalSender(cfs as unknown as Record<string, unknown>, (e) => entries.push(e))
    cfs.writeFileSync('/app/x.txt', 'v1')
    cfs.renameSync('/app/x.txt', '/app/y.txt')
    // Replay into a fresh parent in recorded order
    const pVol = new Volume(); const pfs = createFsFromVolume(pVol)
    pfs.mkdirSync('/app', { recursive: true })
    for (const e of entries) applyJournalEntry(pfs as unknown as Record<string, unknown>, e)
    expect(pfs.readFileSync('/app/y.txt', 'utf8')).toBe('v1')
  })

  it('returns the original op result to the caller (write still succeeds locally)', () => {
    childFs.writeFileSync('/app/local.txt', 'z')
    expect(childFs.readFileSync('/app/local.txt', 'utf8')).toBe('z')
  })
})
