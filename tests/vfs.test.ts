import { describe, it, expect, beforeEach } from 'vitest'
import { Volume } from 'memfs'
import { createFsFromVolume } from 'memfs'

// Re-create a fresh volume per test file so tests are isolated
let vol: InstanceType<typeof Volume>
let fs: ReturnType<typeof createFsFromVolume>

beforeEach(() => {
  vol = new Volume()
  fs = createFsFromVolume(vol)
  fs.mkdirSync('/tmp', { recursive: true })
  fs.mkdirSync('/app', { recursive: true })
  fs.mkdirSync('/node_modules', { recursive: true })
})

describe('Virtual Filesystem (memfs)', () => {
  describe('file I/O', () => {
    it('writes and reads a text file', () => {
      fs.writeFileSync('/app/hello.js', 'console.log("hello")')
      expect(fs.readFileSync('/app/hello.js', 'utf8')).toBe('console.log("hello")')
    })

    it('writes and reads binary (Uint8Array)', () => {
      const data = new Uint8Array([1, 2, 3, 4])
      fs.writeFileSync('/tmp/bin', data)
      const read = fs.readFileSync('/tmp/bin')
      expect(Array.from(read)).toEqual([1, 2, 3, 4])
    })

    it('overwrites existing file', () => {
      fs.writeFileSync('/app/f.txt', 'v1')
      fs.writeFileSync('/app/f.txt', 'v2')
      expect(fs.readFileSync('/app/f.txt', 'utf8')).toBe('v2')
    })

    it('throws when reading non-existent file', () => {
      expect(() => fs.readFileSync('/nope.txt')).toThrow()
    })
  })

  describe('directories', () => {
    it('mkdirSync creates a dir', () => {
      fs.mkdirSync('/app/sub')
      expect(fs.statSync('/app/sub').isDirectory()).toBe(true)
    })

    it('mkdirSync recursive creates nested dirs', () => {
      fs.mkdirSync('/deep/a/b/c', { recursive: true })
      expect(fs.statSync('/deep/a/b/c').isDirectory()).toBe(true)
    })

    it('readdirSync lists contents', () => {
      fs.writeFileSync('/app/a.js', '')
      fs.writeFileSync('/app/b.js', '')
      const entries = fs.readdirSync('/app') as string[]
      expect(entries).toContain('a.js')
      expect(entries).toContain('b.js')
    })

    it('throws on readdir of non-existent dir', () => {
      expect(() => fs.readdirSync('/nope')).toThrow()
    })
  })

  describe('stat', () => {
    it('stat on file returns isFile()', () => {
      fs.writeFileSync('/app/f.js', '')
      const s = fs.statSync('/app/f.js')
      expect(s.isFile()).toBe(true)
      expect(s.isDirectory()).toBe(false)
    })

    it('stat on dir returns isDirectory()', () => {
      const s = fs.statSync('/app')
      expect(s.isDirectory()).toBe(true)
      expect(s.isFile()).toBe(false)
    })

    it('stat reports correct size', () => {
      fs.writeFileSync('/app/sized.txt', '12345')
      expect(fs.statSync('/app/sized.txt').size).toBe(5)
    })
  })

  describe('rename / unlink', () => {
    it('renameSync moves a file', () => {
      fs.writeFileSync('/app/old.js', 'x')
      fs.renameSync('/app/old.js', '/app/new.js')
      expect(fs.readFileSync('/app/new.js', 'utf8')).toBe('x')
      expect(() => fs.readFileSync('/app/old.js')).toThrow()
    })

    it('unlinkSync deletes a file', () => {
      fs.writeFileSync('/app/del.js', 'x')
      fs.unlinkSync('/app/del.js')
      expect(() => fs.readFileSync('/app/del.js')).toThrow()
    })
  })

  describe('node_modules layout simulation', () => {
    it('can store and retrieve a package.json', () => {
      const pkg = { name: 'express', version: '4.18.0', main: 'index.js' }
      fs.mkdirSync('/node_modules/express', { recursive: true })
      fs.writeFileSync('/node_modules/express/package.json', JSON.stringify(pkg))
      const read = JSON.parse(fs.readFileSync('/node_modules/express/package.json', 'utf8') as string)
      expect(read.name).toBe('express')
      expect(read.version).toBe('4.18.0')
    })

    it('supports nested node_modules for deduplication', () => {
      fs.mkdirSync('/node_modules/a/node_modules/b', { recursive: true })
      fs.writeFileSync('/node_modules/a/node_modules/b/index.js', 'module.exports = 42')
      expect(fs.readFileSync('/node_modules/a/node_modules/b/index.js', 'utf8')).toBe('module.exports = 42')
    })
  })
})
