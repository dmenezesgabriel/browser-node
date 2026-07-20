// Write-journal for propagating a child worker's filesystem mutations back to
// the parent volume (child→parent). The child seeds its VFS from a one-way
// snapshot, then every mutating fs op it performs is posted as a journal entry;
// the parent applies entries in arrival order (MessagePort preserves order), so
// the parent VFS reaches eventual consistency with the child's writes. This is
// the Nodebox model — sync fs-proxying is impossible in-browser without
// SharedArrayBuffer, which prod hosting (GitHub Pages) can't enable.
//
// Parent→child propagation is intentionally not implemented: current consumers
// (short-lived exec/fork children, worker_threads) only need their writes to
// reach the parent.

export interface JournalEntry {
  op: string
  args: unknown[]
}

// Synchronous mutating fs methods worth journaling. The async fs shim delegates
// to these, so wrapping them covers both surfaces.
const MUTATING_OPS = [
  'writeFileSync', 'appendFileSync', 'mkdirSync', 'rmdirSync', 'rmSync',
  'unlinkSync', 'renameSync', 'copyFileSync', 'symlinkSync', 'truncateSync',
] as const

type FsLike = Record<string, unknown>

/**
 * Wrap a filesystem instance's mutating methods so each successful call posts a
 * journal entry after applying locally. Call on the child's memfs instance after
 * it seeds from the parent snapshot.
 *
 * @example attachJournalSender(memfsInstance, (e) => port.postMessage({ type: 'fs-journal', entry: e }))
 */
export function attachJournalSender(fs: FsLike, post: (entry: JournalEntry) => void): void {
  for (const op of MUTATING_OPS) {
    const orig = fs[op]
    if (typeof orig !== 'function') continue
    const original = orig as (...a: unknown[]) => unknown
    fs[op] = function (this: unknown, ...args: unknown[]) {
      const result = original.apply(this, args)
      // Post after local success so a throwing op isn't replayed on the parent.
      try { post({ op, args }) } catch { /* transport gone — child is exiting */ }
      return result
    }
  }
}

/** Apply one journal entry to the parent filesystem. Failures are swallowed. */
export function applyJournalEntry(fs: FsLike, entry: JournalEntry): void {
  const fn = fs[entry.op]
  if (typeof fn !== 'function') return
  try {
    (fn as (...a: unknown[]) => unknown).apply(fs, entry.args)
  } catch { /* e.g. mkdir of an existing dir after a race — safe to ignore */ }
}
