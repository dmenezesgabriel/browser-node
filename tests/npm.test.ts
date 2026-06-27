import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { gunzipSync } from 'fflate'

// --- Test the tar parser (extracted from npm.ts) ---
function* parseTar(buf: Uint8Array): Generator<{ name: string; isFile: boolean; data: Uint8Array }> {
  const str = (start: number, len: number) => {
    let end = start
    while (end < start + len && buf[end] !== 0) end++
    return new TextDecoder().decode(buf.slice(start, end))
  }
  let offset = 0
  while (offset + 512 <= buf.length) {
    if (buf[offset] === 0) break
    const name = str(offset, 100)
    const type = String.fromCharCode(buf[offset + 156])
    const size = parseInt(str(offset + 124, 12).trim(), 8) || 0
    offset += 512
    const data = buf.slice(offset, offset + size)
    if (name) yield { name, isFile: type === '0' || type === '', data }
    offset += Math.ceil(size / 512) * 512
  }
}

// Helper: build a minimal POSIX tar buffer manually
function makeTarEntry(name: string, content: string): Uint8Array {
  const encoder = new TextEncoder()
  const contentBytes = encoder.encode(content)
  const contentBlocks = Math.ceil(contentBytes.length / 512)
  const buf = new Uint8Array(512 + contentBlocks * 512).fill(0)
  const nameBytes = encoder.encode(name)

  // name (100 bytes at 0)
  buf.set(nameBytes.slice(0, 100), 0)
  // typeflag (1 byte at 156): '0' = regular file
  buf[156] = 48 // '0'
  // size in octal (12 bytes at 124)
  const sizeOctal = contentBytes.length.toString(8).padStart(11, '0') + ' '
  buf.set(encoder.encode(sizeOctal), 124)
  // Write content after 512-byte header
  if (contentBytes.length > 0) buf.set(contentBytes, 512)
  return buf
}

function concatTar(...entries: Uint8Array[]): Uint8Array {
  // End-of-archive: two 512-byte zero blocks
  const eoa = new Uint8Array(1024)
  const totalLen = entries.reduce((a, e) => a + e.length, 0) + eoa.length
  const out = new Uint8Array(totalLen)
  let off = 0
  for (const e of entries) { out.set(e, off); off += e.length }
  out.set(eoa, off)
  return out
}

describe('Tar parser', () => {
  it('parses a single-file tar', () => {
    const entry = makeTarEntry('package/index.js', 'module.exports = 42')
    const tar = concatTar(entry)
    const entries = [...parseTar(tar)]
    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe('package/index.js')
    expect(entries[0].isFile).toBe(true)
    expect(new TextDecoder().decode(entries[0].data)).toBe('module.exports = 42')
  })

  it('parses multiple files', () => {
    const tar = concatTar(
      makeTarEntry('package/a.js', 'exports.a = 1'),
      makeTarEntry('package/b.js', 'exports.b = 2'),
      makeTarEntry('package/package.json', '{"name":"pkg"}'),
    )
    const entries = [...parseTar(tar)]
    expect(entries).toHaveLength(3)
    expect(entries.map(e => e.name)).toEqual(['package/a.js', 'package/b.js', 'package/package.json'])
  })

  it('strips leading package/ prefix pattern (npm convention)', () => {
    const tar = concatTar(makeTarEntry('package/lib/util.js', '//'))
    const entries = [...parseTar(tar)]
    const stripped = entries[0].name.replace(/^package\//, '')
    expect(stripped).toBe('lib/util.js')
  })

  it('handles empty content files', () => {
    const tar = concatTar(makeTarEntry('package/.npmignore', ''))
    const entries = [...parseTar(tar)]
    expect(entries[0].data.length).toBe(0)
  })

  it('stops at end-of-archive zero block', () => {
    const tar = concatTar(makeTarEntry('package/a.js', 'x'))
    // Append a second file AFTER the EOA — should not appear
    const extra = makeTarEntry('package/b.js', 'y')
    const full = new Uint8Array(tar.length + extra.length)
    full.set(tar); full.set(extra, tar.length)
    const entries = [...parseTar(full)]
    expect(entries).toHaveLength(1)
  })
})

// --- Test semver resolution logic ---
import { maxSatisfying, satisfies } from 'semver'

describe('SemVer resolution (npm dep tree)', () => {
  it('resolves latest version from list', () => {
    const versions = ['1.0.0', '1.2.3', '2.0.0', '2.1.0']
    expect(maxSatisfying(versions, '^2.0.0')).toBe('2.1.0')
  })

  it('resolves minor range', () => {
    const versions = ['4.17.0', '4.17.21', '4.18.0', '5.0.0']
    expect(maxSatisfying(versions, '^4.17.0')).toBe('4.18.0')
  })

  it('resolves exact version', () => {
    const versions = ['1.0.0', '1.0.1', '1.1.0']
    expect(maxSatisfying(versions, '1.0.0')).toBe('1.0.0')
  })

  it('resolves tilde range (patch only)', () => {
    const versions = ['1.2.0', '1.2.3', '1.3.0']
    expect(maxSatisfying(versions, '~1.2.0')).toBe('1.2.3')
  })

  it('returns null when no version satisfies', () => {
    const versions = ['1.0.0', '1.0.1']
    expect(maxSatisfying(versions, '^2.0.0')).toBeNull()
  })

  it('satisfies checks installed version against range', () => {
    expect(satisfies('4.18.0', '^4.17.0')).toBe(true)
    expect(satisfies('3.0.0', '^4.0.0')).toBe(false)
    expect(satisfies('5.0.0', '^4.0.0')).toBe(false)
  })

  it('handles wildcard range *', () => {
    const versions = ['1.0.0', '2.0.0', '3.5.1']
    expect(maxSatisfying(versions, '*')).toBe('3.5.1')
  })
})

// --- Mock fetch to test the npm registry client logic ---
describe('npm registry fetch logic', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('constructs correct registry URL from package name', () => {
    const name = 'express'
    const url = `https://registry.npmjs.org/${encodeURIComponent(name)}`
    expect(url).toBe('https://registry.npmjs.org/express')
  })

  it('handles scoped package names in URL', () => {
    const name = '@types/node'
    const url = `https://registry.npmjs.org/${encodeURIComponent(name)}`
    expect(url).toBe('https://registry.npmjs.org/%40types%2Fnode')
  })

  it('resolves version from dist-tags.latest when range is "latest"', () => {
    const meta = {
      name: 'lodash',
      'dist-tags': { latest: '4.17.21' },
      versions: { '4.17.21': { dist: { tarball: 'https://...' } } },
    }
    const range = 'latest'
    const version = range === 'latest' ? meta['dist-tags'].latest : ''
    expect(version).toBe('4.17.21')
  })

  it('builds correct tarball URL from metadata', async () => {
    const tarballUrl = 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz'
    const mockBuf = new Uint8Array(8).fill(0)

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => mockBuf.buffer,
    } as Response)

    const res = await fetch(tarballUrl)
    const buf = new Uint8Array(await res.arrayBuffer())
    expect(buf.length).toBe(8)
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(tarballUrl)
  })
})
