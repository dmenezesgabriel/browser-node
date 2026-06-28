import { gunzipSync } from 'fflate'
import { satisfies, maxSatisfying, validRange, clean } from 'semver'
import { writeFileToVfs, existsInVfs, mkdirpSync, memfsInstance } from './vfs'
import { path } from './shims/path'

// In dev the Vite proxy rewrites /_npm → registry.npmjs.org (avoids browser TLS issues).
// In production (static deploy) we hit the registry directly — CORS is supported.
const REGISTRY = import.meta.env.DEV ? '/_npm' : 'https://registry.npmjs.org'

type PackageMeta = {
  name: string
  versions: Record<string, { dist: { tarball: string }; dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }>
  'dist-tags': { latest: string }
}

const metaCache = new Map<string, PackageMeta>()

function log(msg: string) {
  self.postMessage({ type: 'stdout', text: msg + '\n' })
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(id)
    return res
  } catch (err) {
    clearTimeout(id)
    throw err
  }
}

function encodePackageName(name: string): string {
  // Scoped packages: keep @ unencoded, only encode the inner slash
  // e.g. @vue/server-renderer → @vue%2Fserver-renderer
  if (name.startsWith('@')) {
    const slash = name.indexOf('/', 1)
    if (slash !== -1) return name.slice(0, slash) + '%2F' + name.slice(slash + 1)
  }
  return encodeURIComponent(name)
}

async function fetchMeta(name: string): Promise<PackageMeta> {
  if (metaCache.has(name)) return metaCache.get(name)!
  const url = `${REGISTRY}/${encodePackageName(name)}`
  let res: Response
  try {
    // Abbreviated metadata is much smaller (skips readme, full descriptions, etc.)
    res = await fetchWithTimeout(url, { headers: { Accept: 'application/vnd.npm.install-v1+json, application/json' } })
  } catch (e) {
    log(`[npm fetch error] ${name}: ${(e as Error).message}`)
    throw new Error(`fetch failed for ${name}: ${(e as Error).message}`)
  }
  if (!res.ok) {
    log(`[npm fetch error] ${name}: not ok (${res.status}) ${url}`)
    throw new Error(`package not found: ${name} (${res.status})`)
  }
  const meta = await res.json() as PackageMeta
  metaCache.set(name, meta)
  return meta
}

function resolveVersion(meta: PackageMeta, range: string): string {
  if (range === 'latest' || range === '*' || range === '') {
    return meta['dist-tags'].latest
  }
  const exact = clean(range)
  if (exact && meta.versions[exact]) return exact
  const versions = Object.keys(meta.versions)
  const best = maxSatisfying(versions, validRange(range) ?? range)
  if (!best) throw new Error(`npm: no version of ${meta.name} satisfies ${range}`)
  return best
}

// Simple synchronous tar parser (POSIX.1-1988 / ustar format)
function* parseTar(buf: Uint8Array): Generator<{ name: string; isFile: boolean; data: Uint8Array }> {
  const str = (start: number, len: number) => {
    let end = start
    while (end < start + len && buf[end] !== 0) end++
    return new TextDecoder().decode(buf.slice(start, end))
  }
  let offset = 0
  while (offset + 512 <= buf.length) {
    if (buf[offset] === 0) break // end-of-archive marker
    const name = str(offset, 100)
    const type = String.fromCharCode(buf[offset + 156])
    const size = parseInt(str(offset + 124, 12).trim(), 8) || 0
    offset += 512
    const data = buf.slice(offset, offset + size)
    if (name) yield { name, isFile: type === '0' || type === '', data }
    offset += Math.ceil(size / 512) * 512
  }
}

function rewriteUrl(url: string): string {
  if (import.meta.env.DEV) {
    return url.replace('https://registry.npmjs.org', '/_npm')
  }
  return url
}

async function extractTarball(tarball: string, destDir: string) {
  const res = await fetchWithTimeout(rewriteUrl(tarball), {}, 30000)
  const buf = new Uint8Array(await res.arrayBuffer())
  const tar = gunzipSync(buf)
  for (const entry of parseTar(tar)) {
    if (!entry.isFile) continue
    // npm tarballs have a leading "package/" prefix
    const relPath = entry.name.replace(/^package\//, '')
    const fullPath = path.join(destDir, relPath)
    writeFileToVfs(fullPath, entry.data)
  }
}

type DepTree = Map<string, string> // name → resolved version

export async function install(
  packages: Record<string, string>,
  rootNmDir = '/node_modules'
): Promise<void> {
  log(`[npm] install called with ${JSON.stringify(packages)} in ${rootNmDir}`)
  const queue: { name: string; range: string; dest: string }[] = Object.entries(packages).map(
    ([name, range]) => ({ name, range, dest: rootNmDir })
  )
  const installed = new Set<string>()

  // Platform-specific native modules and packages shimmed at runtime — skip downloading.
  // This prevents wasted bandwidth and avoids trying to execute native .node binaries.
  const SKIP_PKGS = new Set([
    'fsevents',                            // macOS-only native (optional dep of chokidar)
    '@esbuild/linux-x64', '@esbuild/linux-arm64',
    '@esbuild/linux-x64-gnu', '@esbuild/linux-arm64-gnu',
    '@esbuild/darwin-x64', '@esbuild/darwin-arm64',
    '@esbuild/win32-x64',
    '@rollup/rollup-linux-x64-gnu', '@rollup/rollup-linux-x64-musl',
    '@rollup/rollup-linux-arm64-gnu', '@rollup/rollup-linux-arm64-musl',
    '@rollup/rollup-darwin-x64', '@rollup/rollup-darwin-arm64',
    '@rollup/rollup-win32-x64-msvc', '@rollup/rollup-wasm-node',
    'lightningcss', 'lightningcss-linux-x64-gnu',
  ])

  while (queue.length) {
    const { name, range, dest } = queue.shift()!
    if (SKIP_PKGS.has(name) || (name.startsWith('@next/swc-') && !name.includes('wasm')) || name.startsWith('@swc/core-') || name.startsWith('@vercel/nxt-') || (name.startsWith('@oxc-parser/binding-') && !name.includes('wasm'))) {
      log(`npm  skipping   ${name} (native/shimmed)`)
      continue
    }
    let meta: PackageMeta
    try { meta = await fetchMeta(name) } catch (e) {
      log(`npm  WARN  ${name}: ${(e as Error).message}`)
      continue
    }

    const version = resolveVersion(meta, range)
    const key = `${name}@${version}`
    if (installed.has(key)) continue

    const pkgDir = path.join(dest, name)
    const pkgJsonPath = path.join(pkgDir, 'package.json')

    // If the dest slot already has a package.json, verify the version matches.
    // A mismatch means the slot was taken by a different (incompatible) version —
    // skip this entry rather than silently marking the wrong version as installed.
    if (existsInVfs(pkgJsonPath)) {
      try {
        const existing = JSON.parse(memfsInstance.readFileSync(pkgJsonPath, 'utf8') as string)
        if (existing.version !== version) continue
      } catch {}
    } else {
      log(`npm  installing  ${name}@${version}`)
      mkdirpSync(pkgDir)
      await extractTarball(meta.versions[version].dist.tarball, pkgDir)
    }

    installed.add(key)

    const deps = { ...meta.versions[version].dependencies, ...meta.versions[version].optionalDependencies }
    for (const [depName, depRange] of Object.entries(deps)) {
      // Resolve the best version for this dep (fetch is cached)
      let depMeta: PackageMeta | null = null
      let resolved: string | null = null
      try {
        depMeta = await fetchMeta(depName)
        resolved = resolveVersion(depMeta, depRange)
      } catch {}

      // Will a compatible version of this dep end up at root (installed or queued)?
      let rootWillSatisfy = false
      const rootPkgJson = path.join(rootNmDir, depName, 'package.json')
      if (existsInVfs(rootPkgJson)) {
        if (resolved) {
          try {
            const { version: rootVer } = JSON.parse(memfsInstance.readFileSync(rootPkgJson, 'utf8') as string)
            rootWillSatisfy = satisfies(rootVer, depRange)
          } catch {}
        }
      } else if (depMeta && resolved) {
        // Not installed yet — check if a compatible version is already queued at root
        const queuedAtRoot = queue.find(q => q.name === depName && q.dest === rootNmDir)
        if (queuedAtRoot) {
          try {
            const queuedVer = resolveVersion(depMeta, queuedAtRoot.range)
            rootWillSatisfy = satisfies(queuedVer, depRange)
          } catch {}
        }
      }

      if (rootWillSatisfy) {
        // Already at root with compatible version — still queue for transitive dep
        // discovery (extraction will be skipped, but deps will be processed).
        if (!queue.some(q => q.name === depName && q.dest === rootNmDir)) {
          queue.push({ name: depName, range: depRange, dest: rootNmDir })
        }
      } else if (!existsInVfs(rootPkgJson) && !queue.some(q => q.name === depName && q.dest === rootNmDir)) {
        // Root is free — queue install at root (hoisting)
        queue.push({ name: depName, range: depRange, dest: rootNmDir })
      } else {
        // Root taken by incompatible version (installed or queued) — nest under this package
        queue.push({ name: depName, range: depRange, dest: path.join(pkgDir, 'node_modules') })
      }
    }
  }

  log(`\nnpm  done. ${installed.size} package(s) installed.\n`)
}
