import { describe, it, expect } from 'vitest'
import { path } from '../src/worker/shims/path'

describe('path shim', () => {
  describe('join', () => {
    it('joins simple segments', () => expect(path.join('a', 'b', 'c')).toBe('a/b/c'))
    it('joins with leading slash', () => expect(path.join('/a', 'b')).toBe('/a/b'))
    it('collapses double slashes', () => expect(path.join('a//b', 'c')).toBe('a/b/c'))
    it('handles empty segments', () => expect(path.join('a', '', 'b')).toBe('a/b'))
    it('handles . segments', () => expect(path.join('a', '.', 'b')).toBe('a/b'))
    it('handles .. segments', () => expect(path.join('a', 'b', '..', 'c')).toBe('a/c'))
    it('node_modules path', () => expect(path.join('/node_modules', 'express', 'index.js')).toBe('/node_modules/express/index.js'))
  })

  describe('dirname', () => {
    it('returns parent directory', () => expect(path.dirname('/a/b/c.js')).toBe('/a/b'))
    it('root of root', () => expect(path.dirname('/')).toBe('/'))
    it('single file', () => expect(path.dirname('file.js')).toBe('.'))
    it('nested path', () => expect(path.dirname('/node_modules/express/package.json')).toBe('/node_modules/express'))
  })

  describe('basename', () => {
    it('returns filename', () => expect(path.basename('/a/b/c.js')).toBe('c.js'))
    it('strips extension when given', () => expect(path.basename('/a/b/c.js', '.js')).toBe('c'))
    it('trailing slash', () => expect(path.basename('/a/b/')).toBe(''))
    it('no slash', () => expect(path.basename('file.ts')).toBe('file.ts'))
  })

  describe('extname', () => {
    it('.js', () => expect(path.extname('file.js')).toBe('.js'))
    it('.ts', () => expect(path.extname('/a/b/module.ts')).toBe('.ts'))
    it('no extension', () => expect(path.extname('Makefile')).toBe(''))
    it('dotfile', () => expect(path.extname('.gitignore')).toBe(''))
    it('.d.ts', () => expect(path.extname('types.d.ts')).toBe('.ts'))
  })

  describe('resolve', () => {
    it('absolute path', () => expect(path.resolve('/a/b')).toBe('/a/b'))
    it('relative from absolute', () => expect(path.resolve('/a', 'b')).toBe('/a/b'))
    it('later absolute wins', () => expect(path.resolve('/a', '/b')).toBe('/b'))
    it('with ..', () => expect(path.resolve('/a/b', '../c')).toBe('/a/c'))
  })

  describe('isAbsolute', () => {
    it('true for /path', () => expect(path.isAbsolute('/foo')).toBe(true))
    it('false for relative', () => expect(path.isAbsolute('foo/bar')).toBe(false))
    it('false for empty', () => expect(path.isAbsolute('')).toBe(false))
  })

  describe('relative', () => {
    it('sibling files', () => expect(path.relative('/a/b', '/a/c')).toBe('../c'))
    it('same dir', () => expect(path.relative('/a', '/a/b')).toBe('b'))
    it('going up', () => expect(path.relative('/a/b/c', '/a')).toBe('../..'))
  })

  describe('parse / format', () => {
    it('parses a path', () => {
      const p = path.parse('/home/user/file.ts')
      expect(p.root).toBe('/')
      expect(p.base).toBe('file.ts')
      expect(p.ext).toBe('.ts')
      expect(p.name).toBe('file')
    })
    it('roundtrip format(parse(p)) === p', () => {
      const orig = '/foo/bar/baz.js'
      expect(path.format(path.parse(orig))).toBe(orig)
    })
  })
})
