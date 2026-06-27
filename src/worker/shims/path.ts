// POSIX path implementation (browsers don't have win32 paths to worry about)
export function normalize(p: string): string {
  if (!p) return '.'
  const abs = p.startsWith('/')
  const parts = p.split('/').filter(Boolean)
  const out: string[] = []
  for (const part of parts) {
    if (part === '..') { out.pop() }
    else if (part !== '.') out.push(part)
  }
  const result = out.join('/')
  return abs ? '/' + result : result || '.'
}

export function join(...parts: string[]): string {
  return normalize(parts.filter(Boolean).join('/'))
}

export function resolve(...parts: string[]): string {
  let resolved = ''
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]
    resolved = resolved ? p + '/' + resolved : p
    if (p.startsWith('/')) break
  }
  if (!resolved.startsWith('/')) resolved = '/' + resolved
  return normalize(resolved)
}

export function dirname(p: string): string {
  const idx = p.lastIndexOf('/')
  if (idx === -1) return '.'
  if (idx === 0) return '/'
  return p.slice(0, idx)
}

export function basename(p: string, ext?: string): string {
  const base = p.split('/').pop() ?? ''
  if (ext && base.endsWith(ext)) return base.slice(0, -ext.length)
  return base
}

export function extname(p: string): string {
  const base = basename(p)
  const idx = base.lastIndexOf('.')
  return idx > 0 ? base.slice(idx) : ''
}

export function isAbsolute(p: string): boolean {
  return p.startsWith('/')
}

export function relative(from: string, to: string): string {
  const fromParts = resolve(from).split('/').filter(Boolean)
  const toParts = resolve(to).split('/').filter(Boolean)
  let common = 0
  while (common < fromParts.length && fromParts[common] === toParts[common]) common++
  return [...Array(fromParts.length - common).fill('..'), ...toParts.slice(common)].join('/') || '.'
}

export const sep = '/'
export const delimiter = ':'

export const parse = (p: string) => ({
  root: p.startsWith('/') ? '/' : '',
  dir: dirname(p),
  base: basename(p),
  ext: extname(p),
  name: basename(p, extname(p)),
})

export const format = (o: { dir?: string; root?: string; base?: string; name?: string; ext?: string }) => {
  const dir = o.dir || o.root || ''
  const base = o.base || (o.name ?? '') + (o.ext ?? '')
  return dir ? dir + '/' + base : base
}

// Minimal win32 shim (browser is always POSIX; win32 used by some packages for path detection)
export const win32 = {
  sep: '\\',
  delimiter: ';',
  join: (...parts: string[]): string => normalize(parts.filter(Boolean).join('/')).replace(/\//g, '\\'),
  basename: (p: string, ext?: string): string => basename(p.replace(/\\/g, '/'), ext),
  dirname: (p: string): string => dirname(p.replace(/\\/g, '/')),
  resolve: (...parts: string[]): string => resolve(...parts.map(p => p.replace(/\\/g, '/'))),
  normalize: (p: string): string => normalize(p.replace(/\\/g, '/')).replace(/\//g, '\\'),
  isAbsolute: (p: string): boolean => /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\'),
  relative: (from: string, to: string): string => relative(from.replace(/\\/g, '/'), to.replace(/\\/g, '/')),
  extname,
  parse: (p: string) => parse(p.replace(/\\/g, '/')),
  format,
}

export const path = {
  sep,
  delimiter,
  posix: null as unknown,
  win32: null as unknown,
  normalize,
  join,
  resolve,
  dirname,
  basename,
  extname,
  isAbsolute,
  relative,
  parse,
  format,
}

path.posix = path
path.win32 = win32
export const posix = path

export default path
