// Node-style module resolution against the VFS: builtins/shims, package.json
// "exports"/"imports" (conditions, subpath patterns, arrays via pkg-exports),
// relative/absolute paths, and node_modules walk-up. Split out of loader.ts so
// the loader owns transpile/execute/cache and this owns "specifier → file path".
import { memfsInstance, existsInVfs, isFileInVfs } from './vfs'
import { shimMap } from './shims/index'
import { path } from './shims/path'
import { resolvePkgExports, resolvePkgImports } from './pkg-exports'

// Shimmed packages where a real VFS installation should win over the shim:
// typescript (@angular/compiler-cli needs full exports like SyntaxKind) and
// chokidar (real one works now that fs.watch delegates to memfs events).
export const VFS_FIRST_SHIMS = new Set(['typescript', 'chokidar'])

// Probe resolved exports/imports candidates against the VFS, trying the same
// extension list the old resolver used.
function probeCandidates(baseDir: string, candidates: string[] | undefined): string | null {
  for (const candidate of candidates ?? []) {
    const abs = path.join(baseDir, candidate)
    for (const ext of ['', '.js', '.cjs', '.mjs']) {
      if (isFileInVfs(abs + ext)) return abs + ext
    }
  }
  return null
}

export function resolveModule(specifier: string, fromDir: string): string | null {
  const bareSpecifier = specifier.startsWith('node:') ? specifier.slice(5) : specifier
  if (bareSpecifier in shimMap && !VFS_FIRST_SHIMS.has(bareSpecifier)) return `__shim__:${bareSpecifier}`
  return resolveModuleInVfs(specifier, fromDir)
}

// VFS-only resolution, ignoring the shim registry. Used by require.resolve so
// shimmed-but-installed packages (e.g. rollup under vite@5) report their real
// path — callers compute sibling file locations (package.json) from it.
export function resolveModuleInVfs(specifier: string, fromDir: string): string | null {
  // Package #imports (private package imports — e.g. "#module-sync-enabled")
  if (specifier.startsWith('#')) {
    let dir = fromDir
    while (true) {
      const pkgJsonPath = path.join(dir, 'package.json')
      if (isFileInVfs(pkgJsonPath)) {
        try {
          const pkg = JSON.parse(memfsInstance.readFileSync(pkgJsonPath, 'utf8') as string) as Record<string, unknown>
          const imports = pkg.imports as Record<string, unknown> | undefined
          if (imports && specifier in imports) {
            const found = probeCandidates(dir, resolvePkgImports(pkg, specifier))
            if (found) return found
          }
        } catch {}
      }
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    return null
  }

  // Relative or absolute path
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    const abs = specifier.startsWith('/') ? specifier : path.join(fromDir, specifier)
    for (const ext of ['', '.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.json', '/index.js', '/index.cjs', '/index.mjs', '/index.ts', '/index.tsx', '/index.jsx']) {
      const candidate = abs + ext
      if (isFileInVfs(candidate)) return candidate
    }
    return null
  }

  // node_modules lookup — walk up from fromDir
  const parts = specifier.split('/')
  const pkgName = parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
  const subpath = parts[0].startsWith('@') ? parts.slice(2).join('/') : parts.slice(1).join('/')

  let dir = fromDir
  while (true) {
    const nmDir = path.join(dir, 'node_modules', pkgName)
    if (existsInVfs(nmDir)) {
      // Try package.json exports field first (covers both '.' and subpath cases)
      const pkgJsonPath = path.join(nmDir, 'package.json')
      let pkg: Record<string, unknown> | null = null
      if (isFileInVfs(pkgJsonPath)) {
        try { pkg = JSON.parse(memfsInstance.readFileSync(pkgJsonPath, 'utf8') as string) } catch {}
      }

      if (subpath) {
        // Try exports field subpath first (conditions, ./* patterns, arrays)
        if (pkg?.exports) {
          const found = probeCandidates(nmDir, resolvePkgExports(pkg, `./${subpath}`))
          if (found) return found
        }
        // Direct file path fallback — also read inner package.json (e.g. next/dist/compiled/watchpack)
        const candidate = path.join(nmDir, subpath)
        for (const ext of ['', '.js', '.cjs', '.mjs', '/index.js', '/index.cjs']) {
          if (isFileInVfs(candidate + ext)) return candidate + ext
        }
        // If the candidate is a directory with its own package.json, follow its main field
        const innerPkgPath = candidate + '/package.json'
        if (isFileInVfs(innerPkgPath)) {
          try {
            const innerPkg = JSON.parse(memfsInstance.readFileSync(innerPkgPath, 'utf8') as string) as Record<string, unknown>
            const innerMain = (innerPkg.main as string | undefined) ?? 'index.js'
            const innerPath = path.join(candidate, innerMain)
            for (const ext of ['', '.js', '.cjs', '.mjs', '/index.js', '/index.cjs', '/index.mjs']) {
              if (isFileInVfs(innerPath + ext)) return innerPath + ext
            }
          } catch {}
        }
      } else {
        // Root package — use exports['.'] (conditions, arrays), then main
        if (pkg) {
          if (pkg.exports) {
            const found = probeCandidates(nmDir, resolvePkgExports(pkg, '.'))
            if (found) return found
          }
          const mainStr = (pkg.main as string | undefined) ?? 'index.js'
          const mainPath = path.join(nmDir, mainStr)
          for (const ext of ['', '.js', '.cjs', '.mjs', '/index.js', '/index.cjs', '/index.mjs']) {
            if (isFileInVfs(mainPath + ext)) return mainPath + ext
          }
        }
        // Fallback to index files
        for (const idx of ['/index.js', '/index.cjs', '/index.mjs']) {
          if (isFileInVfs(nmDir + idx)) return nmDir + idx
        }
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return null
}
