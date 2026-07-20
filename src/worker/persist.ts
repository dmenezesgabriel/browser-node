// OPFS-backed workspace persistence: the VFS is mirrored into the Origin Private
// File System so a reload restores the user's files. node_modules and /tmp are
// excluded (size + reconstructable from package.json via npm install), so a
// session re-installs deps but keeps source. Mirroring is incremental and driven
// by VFS change events, keeping OPFS off the synchronous fs hot path.
//
// All functions take the fs instance and directory handle as parameters so the
// mirror can be tested against memfs's node-to-fsa adapter without real OPFS.

// Minimal structural types — the DOM FileSystem*Handle lib types aren't in the
// worker tsconfig, and memfs's node-to-fsa handles satisfy this shape.
interface FileHandleLike {
  kind: 'file'
  getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>
  createWritable(): Promise<{ write(data: unknown): Promise<void>; close(): Promise<void> }>
}
interface DirHandleLike {
  kind: 'directory'
  entries(): AsyncIterableIterator<[string, FileHandleLike | DirHandleLike]>
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandleLike>
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<DirHandleLike>
  removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void>
}

interface FsLike {
  statSync(p: string): { isDirectory(): boolean; isFile(): boolean }
  readFileSync(p: string): Uint8Array
  writeFileSync(p: string, data: Uint8Array): void
  mkdirSync(p: string, opts?: { recursive?: boolean }): void
  watch(p: string, opts: { recursive?: boolean }, cb: (event: string, filename: string | null) => void): { close(): void }
}

const EXCLUDED_PREFIXES = ['/node_modules', '/tmp']

function isExcluded(path: string): boolean {
  return EXCLUDED_PREFIXES.some(p => path === p || path.startsWith(p + '/'))
}

/** True when the runtime exposes OPFS. */
export function isAvailable(): boolean {
  const nav = (globalThis as { navigator?: { storage?: { getDirectory?: unknown } } }).navigator
  return typeof nav?.storage?.getDirectory === 'function'
}

/** The OPFS root directory handle, or null when unavailable. */
export async function getOpfsRoot(): Promise<DirHandleLike | null> {
  if (!isAvailable()) return null
  try {
    const nav = (globalThis as { navigator: { storage: { getDirectory(): Promise<DirHandleLike> } } }).navigator
    return await nav.storage.getDirectory()
  } catch { return null }
}

/** Restore all persisted files into the volume. Returns the number restored. */
export async function hydrate(fs: FsLike, root: DirHandleLike): Promise<number> {
  let count = 0
  async function walk(dir: DirHandleLike, prefix: string): Promise<void> {
    for await (const [name, handle] of dir.entries()) {
      const path = `${prefix}/${name}`
      if (handle.kind === 'directory') {
        fs.mkdirSync(path, { recursive: true })
        await walk(handle, path)
      } else {
        const file = await handle.getFile()
        const data = new Uint8Array(await file.arrayBuffer())
        mkdirpParent(fs, path)
        fs.writeFileSync(path, data)
        count++
      }
    }
  }
  await walk(root, '')
  return count
}

function mkdirpParent(fs: FsLike, path: string): void {
  const parent = path.slice(0, path.lastIndexOf('/'))
  if (parent) try { fs.mkdirSync(parent, { recursive: true }) } catch { /* exists */ }
}

/**
 * Mirror the volume into OPFS on every change (debounced), excluding node_modules
 * and /tmp. Returns a stop function.
 */
export function startMirror(fs: FsLike, root: DirHandleLike, opts?: { debounceMs?: number }): () => void {
  const debounceMs = opts?.debounceMs ?? 500
  const dirty = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    const paths = [...dirty]
    dirty.clear()
    void Promise.all(paths.map(p => mirrorPath(fs, root, p)))
  }

  const watcher = fs.watch('/', { recursive: true }, (_event, filename) => {
    if (!filename) return
    const path = '/' + String(filename).replace(/^\/+/, '')
    if (isExcluded(path)) return
    dirty.add(path)
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, debounceMs)
  })

  return () => { if (timer) clearTimeout(timer); watcher.close() }
}

async function mirrorPath(fs: FsLike, root: DirHandleLike, path: string): Promise<void> {
  const segs = path.split('/').filter(Boolean)
  if (segs.length === 0) return
  let stat: { isDirectory(): boolean; isFile(): boolean } | null = null
  try { stat = fs.statSync(path) } catch { stat = null }

  if (!stat) { await removeFromOpfs(root, segs); return }
  if (stat.isDirectory()) { await ensureOpfsDir(root, segs); return }

  const data = fs.readFileSync(path)
  const dir = await ensureOpfsDir(root, segs.slice(0, -1))
  const fileHandle = await dir.getFileHandle(segs[segs.length - 1], { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(data)
  await writable.close()
}

async function ensureOpfsDir(root: DirHandleLike, segs: string[]): Promise<DirHandleLike> {
  let dir = root
  for (const seg of segs) dir = await dir.getDirectoryHandle(seg, { create: true })
  return dir
}

async function removeFromOpfs(root: DirHandleLike, segs: string[]): Promise<void> {
  try {
    let dir = root
    for (const seg of segs.slice(0, -1)) dir = await dir.getDirectoryHandle(seg)
    await dir.removeEntry(segs[segs.length - 1], { recursive: true })
  } catch { /* already gone */ }
}

/** Remove every persisted entry (used by a reset command / ?fresh=1). */
export async function reset(root: DirHandleLike): Promise<void> {
  const names: string[] = []
  for await (const [name] of root.entries()) names.push(name)
  for (const name of names) {
    try { await root.removeEntry(name, { recursive: true }) } catch { /* ignore */ }
  }
}
