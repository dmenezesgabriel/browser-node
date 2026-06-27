import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Volume, createFsFromVolume } from 'memfs'

let mockFs = createFsFromVolume(new Volume())

vi.mock('../src/worker/vfs', () => ({
  get memfsInstance() { return mockFs },
  existsInVfs: (p: string) => { try { mockFs.statSync(p); return true } catch { return false } },
  writeFileToVfs: (p: string, content: string | Uint8Array) => {
    const dir = p.split('/').slice(0, -1).join('/') || '/'
    try { mockFs.mkdirSync(dir, { recursive: true }) } catch {}
    mockFs.writeFileSync(p, content)
  },
}))

vi.mock('../src/worker/loader', () => ({
  clearModuleCache: vi.fn(),
}))

import { runCommand, getCwd, bindTerminalDeps } from '../src/worker/terminal-cmd'
import { clearModuleCache } from '../src/worker/loader'

function getLog(): Array<{ type: string; text?: string }> {
  return (globalThis as any).postMessageLog as Array<{ type: string; text?: string }>
}

function clearLog() {
  ;(globalThis as any).postMessageLog.length = 0
}

function getStdout(): string {
  return getLog()
    .filter(m => m.type === 'stdout')
    .map(m => m.text ?? '')
    .join('')
}

function getStderr(): string {
  return getLog()
    .filter(m => m.type === 'stderr')
    .map(m => m.text ?? '')
    .join('')
}

beforeEach(async () => {
  const vol = new Volume()
  mockFs = createFsFromVolume(vol)
  mockFs.mkdirSync('/home/user', { recursive: true })
  mockFs.mkdirSync('/tmp', { recursive: true })
  mockFs.mkdirSync('/app', { recursive: true })
  clearLog()
  await runCommand('cd /')
  clearLog()
  vi.mocked(clearModuleCache).mockClear()
})

describe('empty / whitespace input', () => {
  it('returns 0 for empty string', async () => {
    expect(await runCommand('')).toBe(0)
  })

  it('returns 0 for whitespace only', async () => {
    expect(await runCommand('   ')).toBe(0)
  })
})

describe('unknown command', () => {
  it('returns 127', async () => {
    expect(await runCommand('foobarnotexists')).toBe(127)
  })

  it('stderr contains command not found', async () => {
    await runCommand('foobarnotexists')
    expect(getStderr()).toContain('command not found')
  })
})

describe('clear', () => {
  it('returns -1', async () => {
    expect(await runCommand('clear')).toBe(-1)
  })
})

describe('exit / quit', () => {
  it('exit returns 0', async () => {
    expect(await runCommand('exit')).toBe(0)
  })

  it('quit returns 0', async () => {
    expect(await runCommand('quit')).toBe(0)
  })
})

describe('echo', () => {
  it('prints args with newline', async () => {
    await runCommand('echo hello world')
    expect(getStdout()).toBe('hello world\n')
  })

  it('-n suppresses newline', async () => {
    await runCommand('echo -n hello')
    expect(getStdout()).toBe('hello')
  })

  it('\\n escape becomes newline', async () => {
    await runCommand('echo line1\\nline2')
    expect(getStdout()).toBe('line1\nline2\n')
  })

  it('double-quoted string is a single token', async () => {
    await runCommand('echo "hello world"')
    expect(getStdout()).toBe('hello world\n')
  })
})

describe('pwd', () => {
  it('prints current working directory', async () => {
    await runCommand('cd /tmp')
    clearLog()
    await runCommand('pwd')
    expect(getStdout()).toBe('/tmp\n')
  })
})

describe('getCwd()', () => {
  it('returns current cwd', async () => {
    await runCommand('cd /tmp')
    expect(getCwd()).toBe('/tmp')
  })
})

describe('cd', () => {
  it('changes directory', async () => {
    await runCommand('cd /tmp')
    expect(getCwd()).toBe('/tmp')
  })

  it('sends terminal-cwd message', async () => {
    await runCommand('cd /tmp')
    const msg = getLog().find(m => m.type === 'terminal-cwd')
    expect(msg).toBeDefined()
    expect((msg as any).cwd).toBe('/tmp')
  })

  it('no-arg goes to /home/user', async () => {
    await runCommand('cd /tmp')
    clearLog()
    await runCommand('cd')
    expect(getCwd()).toBe('/home/user')
  })

  it('~ resolves to /home/user', async () => {
    await runCommand('cd ~')
    expect(getCwd()).toBe('/home/user')
  })

  it('fails on missing directory', async () => {
    const code = await runCommand('cd /nonexistent')
    expect(code).toBe(1)
    expect(getStderr()).toContain('No such file or directory')
  })

  it('fails on file target', async () => {
    mockFs.writeFileSync('/tmp/file.txt', 'x')
    const code = await runCommand('cd /tmp/file.txt')
    expect(code).toBe(1)
    expect(getStderr()).toContain('Not a directory')
  })

  it('.. resolves to parent', async () => {
    await runCommand('cd /tmp')
    clearLog()
    await runCommand('cd ..')
    expect(getCwd()).toBe('/')
  })
})

describe('mkdir', () => {
  it('creates a directory', async () => {
    await runCommand('mkdir /tmp/newdir')
    expect(mockFs.statSync('/tmp/newdir').isDirectory()).toBe(true)
  })

  it('-p creates nested directories', async () => {
    await runCommand('mkdir -p /tmp/a/b/c')
    expect(mockFs.statSync('/tmp/a/b/c').isDirectory()).toBe(true)
  })

  it('errors without operand', async () => {
    const code = await runCommand('mkdir')
    expect(code).toBe(1)
    expect(getStderr()).toContain('missing operand')
  })

  it('errors on existing without -p', async () => {
    mockFs.mkdirSync('/tmp/existing')
    const code = await runCommand('mkdir /tmp/existing')
    expect(code).toBe(1)
  })

  it('-p is idempotent on existing', async () => {
    mockFs.mkdirSync('/tmp/existing')
    const code = await runCommand('mkdir -p /tmp/existing')
    expect(code).toBe(0)
  })
})

describe('touch', () => {
  it('creates empty file', async () => {
    await runCommand('touch /tmp/newfile.txt')
    expect(mockFs.statSync('/tmp/newfile.txt').isFile()).toBe(true)
  })

  it('does not overwrite existing content', async () => {
    mockFs.writeFileSync('/tmp/existing.txt', 'content')
    await runCommand('touch /tmp/existing.txt')
    expect(mockFs.readFileSync('/tmp/existing.txt', 'utf-8')).toBe('content')
  })
})

describe('cat', () => {
  it('reads a file', async () => {
    mockFs.writeFileSync('/tmp/test.txt', 'hello\n')
    await runCommand('cat /tmp/test.txt')
    expect(getStdout()).toBe('hello\n')
  })

  it('adds trailing newline if missing', async () => {
    mockFs.writeFileSync('/tmp/test.txt', 'hello')
    await runCommand('cat /tmp/test.txt')
    expect(getStdout()).toBe('hello\n')
  })

  it('errors on missing file', async () => {
    const code = await runCommand('cat /tmp/nope.txt')
    expect(code).toBe(1)
    expect(getStderr()).toContain('No such file or directory')
  })

  it('errors without args', async () => {
    const code = await runCommand('cat')
    expect(code).toBe(1)
    expect(getStderr()).toContain('no files specified')
  })
})

describe('ls', () => {
  it('lists directory entries', async () => {
    mockFs.writeFileSync('/tmp/alpha.txt', '')
    mockFs.writeFileSync('/tmp/beta.txt', '')
    await runCommand('ls /tmp')
    const out = getStdout()
    expect(out).toContain('alpha.txt')
    expect(out).toContain('beta.txt')
  })

  it('lists cwd when no arg', async () => {
    await runCommand('cd /tmp')
    mockFs.writeFileSync('/tmp/file.txt', '')
    clearLog()
    await runCommand('ls')
    expect(getStdout()).toContain('file.txt')
  })

  it('-l shows long format', async () => {
    mockFs.writeFileSync('/tmp/file.txt', 'hello')
    await runCommand('ls -l /tmp')
    expect(getStdout()).toContain('file.txt')
    expect(getStdout()).toContain('total')
  })

  it('hides dotfiles by default', async () => {
    mockFs.writeFileSync('/tmp/.hidden', '')
    mockFs.writeFileSync('/tmp/visible.txt', '')
    await runCommand('ls /tmp')
    expect(getStdout()).not.toContain('.hidden')
    expect(getStdout()).toContain('visible.txt')
  })

  it('-a shows dotfiles', async () => {
    mockFs.writeFileSync('/tmp/.hidden', '')
    await runCommand('ls -a /tmp')
    expect(getStdout()).toContain('.hidden')
  })

  it('errors on missing directory', async () => {
    const code = await runCommand('ls /nonexistent')
    expect(code).toBe(1)
    expect(getStderr()).toContain('No such file or directory')
  })
})

describe('rm', () => {
  it('removes a file', async () => {
    mockFs.writeFileSync('/tmp/del.txt', 'x')
    await runCommand('rm /tmp/del.txt')
    expect(() => mockFs.statSync('/tmp/del.txt')).toThrow()
  })

  it('-rf removes directory recursively', async () => {
    mockFs.mkdirSync('/tmp/dir')
    mockFs.writeFileSync('/tmp/dir/file.txt', 'x')
    await runCommand('rm -rf /tmp/dir')
    expect(() => mockFs.statSync('/tmp/dir')).toThrow()
  })

  it('errors without -r on directory', async () => {
    mockFs.mkdirSync('/tmp/dir')
    const code = await runCommand('rm /tmp/dir')
    expect(code).toBe(1)
    expect(getStderr()).toContain('Is a directory')
  })

  it('-f suppresses errors', async () => {
    const code = await runCommand('rm -f /tmp/nonexistent.txt')
    expect(code).toBe(0)
  })
})

describe('mv', () => {
  it('renames a file', async () => {
    mockFs.writeFileSync('/tmp/old.txt', 'content')
    await runCommand('mv /tmp/old.txt /tmp/new.txt')
    expect(mockFs.readFileSync('/tmp/new.txt', 'utf-8')).toBe('content')
    expect(() => mockFs.statSync('/tmp/old.txt')).toThrow()
  })

  it('errors without operands', async () => {
    const code = await runCommand('mv')
    expect(code).toBe(1)
    expect(getStderr()).toContain('missing operand')
  })
})

describe('cp', () => {
  it('copies a file', async () => {
    mockFs.writeFileSync('/tmp/src.txt', 'data')
    await runCommand('cp /tmp/src.txt /tmp/dst.txt')
    expect(mockFs.readFileSync('/tmp/dst.txt', 'utf-8')).toBe('data')
    expect(mockFs.readFileSync('/tmp/src.txt', 'utf-8')).toBe('data')
  })

  it('-r copies directory recursively', async () => {
    mockFs.mkdirSync('/tmp/srcdir')
    mockFs.writeFileSync('/tmp/srcdir/file.txt', 'x')
    await runCommand('cp -r /tmp/srcdir /tmp/dstdir')
    expect(mockFs.readFileSync('/tmp/dstdir/file.txt', 'utf-8')).toBe('x')
  })

  it('errors on directory without -r', async () => {
    mockFs.mkdirSync('/tmp/srcdir')
    const code = await runCommand('cp /tmp/srcdir /tmp/dstdir')
    expect(code).toBe(1)
    expect(getStderr()).toContain('directory')
  })
})

describe('head / tail', () => {
  beforeEach(() => {
    const lines = Array.from({ length: 15 }, (_, i) => 'line' + (i + 1)).join('\n')
    mockFs.writeFileSync('/tmp/lines.txt', lines)
  })

  it('head shows first 10 lines by default', async () => {
    await runCommand('head /tmp/lines.txt')
    const out = getStdout()
    expect(out).toContain('line1')
    expect(out).toContain('line10')
    expect(out).not.toContain('line11')
  })

  it('head -n 3 shows 3 lines', async () => {
    await runCommand('head -n 3 /tmp/lines.txt')
    const out = getStdout()
    expect(out).toContain('line1')
    expect(out).toContain('line3')
    expect(out).not.toContain('line4')
  })

  it('tail -n 2 shows last 2 lines', async () => {
    await runCommand('tail -n 2 /tmp/lines.txt')
    const out = getStdout()
    expect(out).toContain('line14')
    expect(out).toContain('line15')
    expect(out).not.toContain('line13')
  })

  it('head errors without file', async () => {
    const code = await runCommand('head')
    expect(code).toBe(1)
    expect(getStderr()).toContain('file required')
  })

  it('tail errors without file', async () => {
    const code = await runCommand('tail')
    expect(code).toBe(1)
    expect(getStderr()).toContain('file required')
  })
})

describe('grep', () => {
  beforeEach(() => {
    mockFs.writeFileSync('/tmp/data.txt', 'hello world\nfoo bar\nHELLO again\n')
  })

  it('finds matching lines', async () => {
    await runCommand('grep hello /tmp/data.txt')
    expect(getStdout()).toContain('hello world')
    expect(getStdout()).not.toContain('foo bar')
  })

  it('-i is case-insensitive', async () => {
    await runCommand('grep -i hello /tmp/data.txt')
    const out = getStdout()
    expect(out).toContain('hello world')
    expect(out).toContain('HELLO again')
  })

  it('-n shows line numbers', async () => {
    await runCommand('grep -n hello /tmp/data.txt')
    expect(getStdout()).toContain('1')
  })

  it('returns 1 with no matches', async () => {
    const code = await runCommand('grep zzznomatch /tmp/data.txt')
    expect(code).toBe(1)
  })

  it('errors without pattern', async () => {
    const code = await runCommand('grep')
    expect(code).toBe(1)
    expect(getStderr()).toContain('usage')
  })
})

describe('find', () => {
  beforeEach(() => {
    mockFs.mkdirSync('/tmp/findtest/sub', { recursive: true })
    mockFs.writeFileSync('/tmp/findtest/a.txt', '')
    mockFs.writeFileSync('/tmp/findtest/b.js', '')
    mockFs.writeFileSync('/tmp/findtest/sub/c.txt', '')
  })

  it('finds all files recursively', async () => {
    await runCommand('find /tmp/findtest')
    const out = getStdout()
    expect(out).toContain('a.txt')
    expect(out).toContain('b.js')
    expect(out).toContain('c.txt')
  })

  it('-name filters by glob', async () => {
    await runCommand('find /tmp/findtest -name *.txt')
    const out = getStdout()
    expect(out).toContain('a.txt')
    expect(out).toContain('c.txt')
    expect(out).not.toContain('b.js')
  })

  it('-type f finds files only', async () => {
    await runCommand('find /tmp/findtest -type f')
    const out = getStdout()
    expect(out).toContain('a.txt')
    expect(out).not.toContain('/tmp/findtest/sub\n')
  })

  it('-type d finds directories only', async () => {
    await runCommand('find /tmp/findtest -type d')
    const out = getStdout()
    expect(out).toContain('sub')
    expect(out).not.toContain('a.txt')
  })
})

describe('which', () => {
  it('builtins report shell built-in', async () => {
    await runCommand('which node')
    expect(getStdout()).toContain('shell built-in')
  })

  it('unknown command returns 1 with not found', async () => {
    const code = await runCommand('which nonexistentcmd')
    expect(code).toBe(1)
    expect(getStderr()).toContain('not found')
  })
})

describe('help', () => {
  it('prints Built-in commands', async () => {
    await runCommand('help')
    expect(getStdout()).toContain('Built-in commands')
  })

  it('? also prints Built-in commands', async () => {
    await runCommand('?')
    expect(getStdout()).toContain('Built-in commands')
  })
})

describe('node command', () => {
  it('errors without args', async () => {
    const code = await runCommand('node')
    expect(code).toBe(1)
    expect(getStderr()).toContain('usage')
  })

  it('errors on missing file', async () => {
    const code = await runCommand('node /tmp/nope.js')
    expect(code).toBe(1)
    expect(getStderr()).toContain('No such file or directory')
  })

  it('errors when runtime not bound', async () => {
    mockFs.writeFileSync('/tmp/script.js', 'console.log("hi")')
    bindTerminalDeps(null as any, null as any)
    const code = await runCommand('node /tmp/script.js')
    expect(code).toBe(1)
    expect(getStderr()).toContain('runtime not ready')
  })

  it('calls clearModuleCache before running', async () => {
    mockFs.writeFileSync('/tmp/script.js', '')
    const mockRequire = vi.fn()
    bindTerminalDeps(mockRequire as any, null as any)
    await runCommand('node /tmp/script.js')
    expect(clearModuleCache).toHaveBeenCalled()
    bindTerminalDeps(null as any, null as any)
  })

  it('invokes _require with file path', async () => {
    mockFs.writeFileSync('/tmp/hello.js', '')
    const mockRequire = vi.fn()
    bindTerminalDeps(mockRequire as any, null as any)
    await runCommand('node /tmp/hello.js')
    expect(mockRequire).toHaveBeenCalledWith('/tmp/hello.js', '/tmp')
    bindTerminalDeps(null as any, null as any)
  })
})

describe('npm', () => {
  it('errors without subcommand', async () => {
    const code = await runCommand('npm')
    expect(code).toBe(1)
    expect(getStderr()).toContain('usage')
  })

  it('npm install without package.json fails', async () => {
    await runCommand('cd /tmp')
    clearLog()
    const code = await runCommand('npm install')
    expect(code).toBe(1)
    expect(getStderr()).toContain('package.json')
  })

  it('npm install from package.json calls _install', async () => {
    mockFs.writeFileSync('/tmp/package.json', JSON.stringify({ dependencies: { lodash: '4.0.0' } }))
    await runCommand('cd /tmp')
    clearLog()
    const mockInstall = vi.fn().mockResolvedValue(undefined)
    bindTerminalDeps(null as any, mockInstall)
    const code = await runCommand('npm install')
    expect(code).toBe(0)
    expect(mockInstall).toHaveBeenCalledWith({ lodash: '4.0.0' }, '/tmp/node_modules')
    bindTerminalDeps(null as any, null as any)
  })

  it('npm install pkg calls _install with latest', async () => {
    const mockInstall = vi.fn().mockResolvedValue(undefined)
    bindTerminalDeps(null as any, mockInstall)
    const code = await runCommand('npm install express')
    expect(code).toBe(0)
    expect(mockInstall).toHaveBeenCalledWith({ express: 'latest' }, '/node_modules')
    bindTerminalDeps(null as any, null as any)
  })

  it('npm install pkg@version calls _install with version', async () => {
    const mockInstall = vi.fn().mockResolvedValue(undefined)
    bindTerminalDeps(null as any, mockInstall)
    const code = await runCommand('npm install express@4.18.0')
    expect(code).toBe(0)
    expect(mockInstall).toHaveBeenCalledWith({ express: '4.18.0' }, '/node_modules')
    bindTerminalDeps(null as any, null as any)
  })

  it('npm run executes script', async () => {
    mockFs.writeFileSync('/tmp/package.json', JSON.stringify({
      scripts: { hello: 'echo hello-script' }
    }))
    await runCommand('cd /tmp')
    clearLog()
    const code = await runCommand('npm run hello')
    expect(code).toBe(0)
    expect(getStdout()).toContain('hello-script')
  })

  it('npm run errors if script missing', async () => {
    mockFs.writeFileSync('/tmp/package.json', JSON.stringify({ scripts: {} }))
    await runCommand('cd /tmp')
    clearLog()
    const code = await runCommand('npm run nonexistent')
    expect(code).toBe(1)
    expect(getStderr()).toContain('not found')
  })

  it('npm unknown subcommand fails', async () => {
    const code = await runCommand('npm blah')
    expect(code).toBe(1)
    expect(getStderr()).toContain('unknown command')
  })
})

describe('tokenizer via echo', () => {
  it('double-quoted strings treated as single token', async () => {
    await runCommand('echo "hello world"')
    expect(getStdout()).toBe('hello world\n')
  })

  it('single-quoted strings treated as single token', async () => {
    await runCommand("echo 'hello world'")
    expect(getStdout()).toBe('hello world\n')
  })
})

describe('path resolution', () => {
  it('relative path resolves from cwd', async () => {
    await runCommand('cd /tmp')
    mockFs.writeFileSync('/tmp/rel.txt', 'relative')
    clearLog()
    await runCommand('cat rel.txt')
    expect(getStdout()).toContain('relative')
  })

  it('~ resolves to /home/user', async () => {
    mockFs.writeFileSync('/home/user/home.txt', 'home')
    await runCommand('cat ~/home.txt')
    expect(getStdout()).toContain('home')
  })

  it('../ resolves to parent directory', async () => {
    await runCommand('cd /tmp')
    mockFs.writeFileSync('/app/parent.txt', 'parent')
    clearLog()
    await runCommand('cat ../app/parent.txt')
    expect(getStdout()).toContain('parent')
  })
})
