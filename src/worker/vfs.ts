import { createFsFromVolume, Volume } from 'memfs'

// Single shared in-memory volume for the entire runtime
export const vol = new Volume()
export const memfsInstance = createFsFromVolume(vol)

// Convenience: ensure a directory exists
export function mkdirpSync(dir: string) {
  try { memfsInstance.mkdirSync(dir, { recursive: true }) } catch {}
}

// Write a file, creating parent dirs as needed
export function writeFileToVfs(path: string, content: string | Uint8Array) {
  const dir = path.split('/').slice(0, -1).join('/') || '/'
  mkdirpSync(dir)
  memfsInstance.writeFileSync(path, content)
}

// Read a file from VFS
export function readFileFromVfs(path: string): Buffer {
  return memfsInstance.readFileSync(path) as Buffer
}

export function existsInVfs(path: string): boolean {
  try { memfsInstance.statSync(path); return true } catch { return false }
}

export function isFileInVfs(path: string): boolean {
  try { return memfsInstance.statSync(path).isFile() } catch { return false }
}

// Dump the full VFS tree (for debugging)
export function dumpVfs(root = '/'): string {
  function walk(dir: string, indent = ''): string {
    let out = ''
    try {
      const entries = memfsInstance.readdirSync(dir) as string[]
      for (const e of entries) {
        const full = dir === '/' ? '/' + e : dir + '/' + e
        out += indent + e + '\n'
        try {
          const stat = memfsInstance.statSync(full)
          if (stat.isDirectory()) out += walk(full, indent + '  ')
        } catch {}
      }
    } catch {}
    return out
  }
  return walk(root)
}

// Bootstrap standard directories
mkdirpSync('/tmp')
mkdirpSync('/node_modules')
