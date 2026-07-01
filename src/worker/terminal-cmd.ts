import { memfsInstance, existsInVfs, writeFileToVfs } from './vfs'
import { path as pathMod } from './shims/path'
import { clearModuleCache } from './loader'
import { process as proc } from './shims/process'

type RequireFn = (id: string, fromDir: string) => unknown
type InstallFn  = (packages: Record<string, string>, rootNmDir?: string) => Promise<void>

let _require: RequireFn | null = null
let _install: InstallFn | null = null

export function bindTerminalDeps(req: RequireFn, inst: InstallFn) {
  _require = req
  _install = inst
}

let _cwd = '/examples'
export function getCwd() { return _cwd }

export let stdout = (text: string) => { self.postMessage({ type: 'stdout', text }) }
export let stderr = (text: string) => { self.postMessage({ type: 'stderr', text }) }
function notifyVfsChanged() { self.postMessage({ type: 'vfs-changed' }) }

// ── Path helpers ────────────────────────────────────────────────────────────

function resolve(p: string): string {
  if (!p || p === '~') return '/home/user'
  if (p.startsWith('~/')) p = '/home/user/' + p.slice(2)
  if (p.startsWith('/')) return normalize(p)
  return normalize(_cwd + '/' + p)
}

function resolveBin(cmdName: string, startDir: string): string | null {
  let dir = startDir
  while (true) {
    const nmDir = pathMod.join(dir, 'node_modules')
    if (existsInVfs(nmDir)) {
      try {
        const pkgs = memfsInstance.readdirSync(nmDir) as string[]
        for (const name of pkgs) {
          if (name.startsWith('@')) {
            const scopeDir = pathMod.join(nmDir, name)
            const scopePkgs = memfsInstance.readdirSync(scopeDir) as string[]
            for (const subName of scopePkgs) {
              const pkgJsonPath = pathMod.join(scopeDir, subName, 'package.json')
              const binPath = checkBinField(pkgJsonPath, cmdName)
              if (binPath) return pathMod.join(scopeDir, subName, binPath)
            }
          } else {
            const pkgJsonPath = pathMod.join(nmDir, name, 'package.json')
            const binPath = checkBinField(pkgJsonPath, cmdName)
            if (binPath) return pathMod.join(nmDir, name, binPath)
          }
        }
      } catch {}
    }
    const parent = pathMod.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

function checkBinField(pkgJsonPath: string, cmdName: string): string | null {
  if (!existsInVfs(pkgJsonPath)) return null
  try {
    const pkg = JSON.parse(memfsInstance.readFileSync(pkgJsonPath, 'utf8') as string)
    if (!pkg.bin) return null
    if (typeof pkg.bin === 'string') {
      const pkgName = pkg.name || pathMod.basename(pathMod.dirname(pkgJsonPath))
      if (pkgName === cmdName || pkgName.split('/').pop() === cmdName) {
        return pkg.bin
      }
    } else if (typeof pkg.bin === 'object' && pkg.bin !== null) {
      if (cmdName in pkg.bin) {
        return pkg.bin[cmdName]
      }
    }
  } catch {}
  return null
}

function normalize(p: string): string {
  const parts = p.split('/').filter(Boolean)
  const out: string[] = []
  for (const s of parts) {
    if (s === '..') { if (out.length) out.pop() }
    else if (s !== '.') out.push(s)
  }
  return '/' + out.join('/')
}

// ── Tokenizer (handles single/double quotes) ────────────────────────────────

function tokenize(line: string): string[] {
  const tokens: string[] = []
  let cur = ''
  let q = ''
  for (const ch of line) {
    if (q) { if (ch === q) q = ''; else cur += ch }
    else if (ch === '"' || ch === "'") { q = ch }
    else if (ch === ' ' || ch === '\t') { if (cur) { tokens.push(cur); cur = '' } }
    else { cur += ch }
  }
  if (cur) tokens.push(cur)
  return tokens
}

// ── && chaining ─────────────────────────────────────────────────────────────

function splitOnAnd(line: string): string[] {
  const parts: string[] = []
  let cur = ''
  let q = ''
  let i = 0
  while (i < line.length) {
    const c = line[i]
    if (q) { if (c === q) q = ''; cur += c; i++; continue }
    if (c === '"' || c === "'") { q = c; cur += c; i++; continue }
    if (c === '&' && line[i + 1] === '&') { parts.push(cur); cur = ''; i += 2; continue }
    cur += c; i++
  }
  if (cur.trim()) parts.push(cur)
  return parts.map(p => p.trim()).filter(Boolean)
}

// ── Entry point ─────────────────────────────────────────────────────────────

export async function runCommand(cmdline: string): Promise<number> {
  const andParts = splitOnAnd(cmdline.trim())
  if (andParts.length > 1) {
    for (const part of andParts) {
      const code = await runCommand(part)
      if (code !== 0) return code
    }
    return 0
  }

  const tokens = tokenize(cmdline.trim())
  if (!tokens.length) return 0
  
  let redirectFile: string | null = null
  let append = false
  const cleanTokens: string[] = []
  
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === '>' || tokens[i] === '>>') {
      append = tokens[i] === '>>'
      redirectFile = tokens[i + 1]
      break
    }
    cleanTokens.push(tokens[i])
  }
  
  if (!cleanTokens.length) return 0
  const [cmd, ...args] = cleanTokens
  
  const origStdout = stdout
  let outBuffer = ''
  if (redirectFile) {
    stdout = (text: string) => { outBuffer += text }
  }

  let code = 0
  try {
    switch (cmd) {
      case 'ls':    case 'dir':  code = cmdLs(args); break
      case 'cd':                 code = cmdCd(args); break
      case 'pwd':                code = cmdPwd(); break
      case 'mkdir':              code = cmdMkdir(args); break
      case 'rm':                 code = cmdRm(args); break
      case 'mv':                 code = cmdMv(args); break
      case 'cp':                 code = cmdCp(args); break
      case 'touch':              code = cmdTouch(args); break
      case 'cat':                code = cmdCat(args); break
      case 'echo':               code = cmdEcho(args); break
      case 'node':               code = await cmdNode(args); break
      case 'npm':                code = await cmdNpm(args); break
      case 'npx':                code = await cmdNpx(args); break
      case 'vite':               code = await cmdVite(args); break
      case 'which':              code = cmdWhich(args); break
      case 'env':                code = cmdEnv(); break
      case 'export':             code = cmdExport(args); break
      case 'find':               code = cmdFind(args); break
      case 'head':               code = cmdHead(args); break
      case 'tail':               code = cmdTail(args); break
      case 'grep':               code = cmdGrep(args); break
      case 'clear': case 'cls':  code = -1; break
      case 'help': case '?':     code = cmdHelp(); break
      case 'exit': case 'quit':  code = 0; break
      default: {
        const binPath = resolveBin(cmd, _cwd)
        if (binPath) {
          code = await cmdNode([binPath, ...args])
        } else {
          stderr(`\x1b[31m${cmd}: command not found\x1b[0m\n`)
          code = 127
        }
      }
    }
  } catch (e) {
    stderr(`\x1b[31m${cmd}: ${(e as Error).message}\x1b[0m\n`)
    code = 1
  }
  
  if (redirectFile) {
    stdout = origStdout
    try {
      const fullPath = resolve(redirectFile)
      if (append && existsInVfs(fullPath)) {
        const orig = memfsInstance.readFileSync(fullPath, 'utf8') as string
        writeFileToVfs(fullPath, orig + outBuffer)
      } else {
        writeFileToVfs(fullPath, outBuffer)
      }
      notifyVfsChanged()
    } catch (e) {
      stderr(`\x1b[31m${cmd}: Failed to write to ${redirectFile}\x1b[0m\n`)
      code = 1
    }
  }
  return code
}

// ── ls ───────────────────────────────────────────────────────────────────────

function cmdLs(args: string[]): number {
  const flags = args.filter(a => a.startsWith('-')).join('')
  const showHidden = flags.includes('a') || flags.includes('A')
  const longFmt = flags.includes('l')
  const targets = args.filter(a => !a.startsWith('-'))
  const dir = targets[0] ? resolve(targets[0]) : _cwd

  let entries: string[]
  try { entries = (memfsInstance.readdirSync(dir) as string[]).sort() }
  catch { stderr(`ls: cannot access '${dir}': No such file or directory\n`); return 1 }

  if (!showHidden) entries = entries.filter(e => !e.startsWith('.'))

  if (longFmt) {
    stdout('total ' + entries.length + '\n')
    for (const e of entries) {
      const fp = dir === '/' ? '/' + e : dir + '/' + e
      try {
        const st = memfsInstance.statSync(fp) as { isDirectory(): boolean; size: number }
        const isDir = st.isDirectory()
        const size = isDir ? 0 : st.size
        const sizeStr = String(size).padStart(8)
        const name = isDir ? `\x1b[34m${e}/\x1b[0m` : e
        stdout(`${isDir ? 'd' : '-'}rwxr-xr-x 1 user user ${sizeStr} Jan  1 00:00 ${name}\n`)
      } catch { stdout(e + '\n') }
    }
  } else {
    const colored = entries.map(e => {
      const fp = dir === '/' ? '/' + e : dir + '/' + e
      try {
        const isDir = (memfsInstance.statSync(fp) as { isDirectory(): boolean }).isDirectory()
        return isDir ? `\x1b[34m${e}/\x1b[0m` : e
      } catch { return e }
    })
    // Print in columns (up to 4 per row)
    const cols = 4
    const rows = Math.ceil(colored.length / cols)
    const colW = 20
    const lines: string[] = []
    for (let r = 0; r < rows; r++) {
      let line = ''
      for (let c = 0; c < cols; c++) {
        const item = colored[r + c * rows]
        if (item !== undefined) line += item.padEnd(colW + (item.length - stripAnsi(item).length))
      }
      lines.push(line.trimEnd())
    }
    stdout(lines.join('\n') + '\n')
  }
  return 0
}

function stripAnsi(s: string) { return s.replace(/\x1b\[[^m]*m/g, '') }

// ── cd ───────────────────────────────────────────────────────────────────────

function cmdCd(args: string[]): number {
  const target = resolve(args[0])
  try {
    const st = memfsInstance.statSync(target) as { isDirectory(): boolean }
    if (!st.isDirectory()) { stderr(`cd: ${args[0]}: Not a directory\n`); return 1 }
    _cwd = target
    self.postMessage({ type: 'terminal-cwd', cwd: _cwd })
    return 0
  } catch { stderr(`cd: ${args[0] ?? ''}: No such file or directory\n`); return 1 }
}

// ── pwd ──────────────────────────────────────────────────────────────────────

function cmdPwd(): number { stdout(_cwd + '\n'); return 0 }

// ── mkdir ────────────────────────────────────────────────────────────────────

function cmdMkdir(args: string[]): number {
  const recursive = args.includes('-p')
  const paths = args.filter(a => !a.startsWith('-'))
  if (!paths.length) { stderr('mkdir: missing operand\n'); return 1 }
  for (const p of paths) {
    try {
      memfsInstance.mkdirSync(resolve(p), { recursive } as { recursive: boolean })
    } catch (e) { stderr(`mkdir: ${p}: ${(e as Error).message}\n`); return 1 }
  }
  notifyVfsChanged(); return 0
}

// ── rm ───────────────────────────────────────────────────────────────────────

function cmdRm(args: string[]): number {
  const flags = args.filter(a => a.startsWith('-')).join('')
  const rec = flags.includes('r') || flags.includes('R')
  const force = flags.includes('f')
  const paths = args.filter(a => !a.startsWith('-'))
  for (const p of paths) {
    const abs = resolve(p)
    try {
      const st = memfsInstance.statSync(abs) as { isDirectory(): boolean }
      if (st.isDirectory()) {
        if (!rec) { stderr(`rm: ${p}: Is a directory\n`); return 1 }
        rmDir(abs)
      } else {
        memfsInstance.unlinkSync(abs)
      }
    } catch (e) { if (!force) { stderr(`rm: ${p}: ${(e as Error).message}\n`); return 1 } }
  }
  notifyVfsChanged(); return 0
}

function rmDir(abs: string) {
  for (const e of memfsInstance.readdirSync(abs) as string[]) {
    const fp = abs + '/' + e
    const st = memfsInstance.statSync(fp) as { isDirectory(): boolean }
    if (st.isDirectory()) rmDir(fp)
    else memfsInstance.unlinkSync(fp)
  }
  memfsInstance.rmdirSync(abs)
}

// ── mv ───────────────────────────────────────────────────────────────────────

function cmdMv(args: string[]): number {
  const src = args[0]; const dest = args[1]
  if (!src || !dest) { stderr('mv: missing operand\n'); return 1 }
  try { memfsInstance.renameSync(resolve(src), resolve(dest)); notifyVfsChanged(); return 0 }
  catch (e) { stderr(`mv: ${(e as Error).message}\n`); return 1 }
}

// ── cp ───────────────────────────────────────────────────────────────────────

function cmdCp(args: string[]): number {
  const rec = args.includes('-r') || args.includes('-R') || args.includes('-a')
  const paths = args.filter(a => !a.startsWith('-'))
  const src = paths[0]; const dest = paths[1]
  if (!src || !dest) { stderr('cp: missing operand\n'); return 1 }
  try { cpEntry(resolve(src), resolve(dest), rec); notifyVfsChanged(); return 0 }
  catch (e) { stderr(`cp: ${(e as Error).message}\n`); return 1 }
}

function cpEntry(src: string, dst: string, rec: boolean) {
  const st = memfsInstance.statSync(src) as { isDirectory(): boolean }
  if (st.isDirectory()) {
    if (!rec) throw new Error(`'${src}' is a directory (use -r)`)
    memfsInstance.mkdirSync(dst, { recursive: true } as { recursive: boolean })
    for (const e of memfsInstance.readdirSync(src) as string[])
      cpEntry(src + '/' + e, dst + '/' + e, true)
  } else {
    const content = memfsInstance.readFileSync(src)
    writeFileToVfs(dst, content as unknown as string)
  }
}

// ── touch ────────────────────────────────────────────────────────────────────

function cmdTouch(args: string[]): number {
  for (const f of args.filter(a => !a.startsWith('-'))) {
    const abs = resolve(f)
    if (!existsInVfs(abs)) writeFileToVfs(abs, '')
  }
  notifyVfsChanged(); return 0
}

// ── cat ──────────────────────────────────────────────────────────────────────

function cmdCat(args: string[]): number {
  const files = args.filter(a => !a.startsWith('-'))
  if (!files.length) { stderr('cat: no files specified\n'); return 1 }
  for (const f of files) {
    try {
      const content = memfsInstance.readFileSync(resolve(f), 'utf-8') as string
      stdout(content.endsWith('\n') ? content : content + '\n')
    } catch { stderr(`cat: ${f}: No such file or directory\n`); return 1 }
  }
  return 0
}

// ── echo ─────────────────────────────────────────────────────────────────────

function cmdEcho(args: string[]): number {
  const noNl = args[0] === '-n'
  const text = (noNl ? args.slice(1) : args)
    .join(' ')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
  stdout(text + (noNl ? '' : '\n'))
  return 0
}

// ── node ─────────────────────────────────────────────────────────────────────

async function cmdNode(args: string[]): Promise<number> {
  if (proc) {
    proc.cwd = () => _cwd
    proc.chdir = (dir: string) => {
      const target = resolve(dir)
      try {
        const st = memfsInstance.statSync(target) as { isDirectory(): boolean }
        if (!st.isDirectory()) throw new Error()
        _cwd = target
        self.postMessage({ type: 'terminal-cwd', cwd: _cwd })
      } catch {
        throw new Error(`chdir: ${dir}: No such file or directory`)
      }
    }
  }

  if (!args.length) { stderr('usage: node [--version] <file.js>\n'); return 1 }
  if (args[0] === '--version' || args[0] === '-v') { stdout('v22.14.0\n'); return 0 }

  if (proc) {
    proc.argv = ['node', ...args.map(a => resolve(a))]
  }

  if (args[0] === '-e' || args[0] === '--eval') {
    if (proc) proc.argv = ['node', '-e']
    const code = args.slice(1).join(' ')
    if (!code) { stderr('node: -e requires an expression\n'); return 1 }
    if (!_require) { stderr('node: runtime not ready\n'); return 1 }
    clearModuleCache()
    const tmpPath = _cwd + '/_eval_' + Date.now() + '.js'
    writeFileToVfs(tmpPath, code)
    try { _require(tmpPath, _cwd); return 0 }
    catch (e) { stderr(`node: ${(e as Error).message}\n`); return 1 }
  }
  const file = resolve(args[0])
  if (proc) {
    proc.argv = ['node', file, ...args.slice(1)]
  }
  try {
    if (!existsInVfs(file)) { stderr(`node: ${args[0]}: No such file or directory\n`); return 1 }
    if (!_require) { stderr('node: runtime not ready\n'); return 1 }
    clearModuleCache()
    const fromDir = normalize(file.split('/').slice(0, -1).join('/') || '/')
    _require(file, fromDir)
    return 0
  } catch (e) { stderr(`node: ${(e as Error).message}\n`); return 1 }
}

// ── npm ──────────────────────────────────────────────────────────────────────

async function cmdNpm(args: string[]): Promise<number> {
  const sub = args[0]
  if (!sub) { stderr('usage: npm <install|run|--version> [...]\n'); return 1 }
  if (sub === '--version' || sub === '-v') { stdout('10.9.0\n'); return 0 }

  if (sub === 'install' || sub === 'i' || sub === 'add') {
    const pkgArgs = args.slice(1).filter(a => !a.startsWith('-'))
    const packages: Record<string, string> = {}
    if (pkgArgs.length) {
      for (const raw of pkgArgs) {
        const at = raw.lastIndexOf('@')
        if (at > 0) { packages[raw.slice(0, at)] = raw.slice(at + 1) }
        else { packages[raw] = 'latest' }
      }
    } else {
      // Install from package.json
      const pkgPath = _cwd + '/package.json'
      try {
        const pkg = JSON.parse(memfsInstance.readFileSync(pkgPath, 'utf-8') as string)
        Object.assign(packages, pkg.dependencies ?? {}, pkg.devDependencies ?? {})
      } catch { stderr('npm: no package.json in current directory\n'); return 1 }
    }
    if (!Object.keys(packages).length) { stdout('Nothing to install.\n'); return 0 }
    if (_install) { await _install(packages, normalize(_cwd + '/node_modules')); return 0 }
    stderr('npm: installer not ready\n'); return 1
  }

  if (sub === 'run') {
    const script = args[1]
    if (!script) { stderr('npm run: script name required\n'); return 1 }
    try {
      const pkg = JSON.parse(memfsInstance.readFileSync(_cwd + '/package.json', 'utf-8') as string)
      const cmd = pkg.scripts?.[script]
      if (!cmd) { stderr(`npm run: script "${script}" not found\n`); return 1 }
      stdout(`\n> ${script}\n> ${cmd}\n\n`)
      return await runCommand(cmd)
    } catch (e) { stderr(`npm run: ${(e as Error).message}\n`); return 1 }
  }

  if (sub === 'create' || sub === 'init') {
    const pkgArgs = args.slice(1)
    if (sub === 'init' && (!pkgArgs.length || pkgArgs[0] === '-y')) {
      const pkg = { name: 'app', version: '1.0.0', main: 'index.js', type: 'module' }
      memfsInstance.writeFileSync(_cwd + '/package.json', JSON.stringify(pkg, null, 2))
      return 0
    }
    if (!pkgArgs.length) {
      stderr('npm create: package name required\n')
      return 1
    }
    const createPkg = `create-${pkgArgs[0]}`
    return await cmdNpx([createPkg, ...pkgArgs.slice(1)])
  }

  stderr(`npm: unknown command: ${sub}\n`); return 1
}

// ── npx ──────────────────────────────────────────────────────────────────────

async function cmdNpx(args: string[]): Promise<number> {
  let pkgIndex = 0
  while (pkgIndex < args.length && args[pkgIndex].startsWith('-')) {
    pkgIndex++
  }
  if (pkgIndex >= args.length) { stderr('usage: npx [options] <package> [...args]\n'); return 1 }
  
  const rawPkg = args[pkgIndex]
  let pkgName = rawPkg
  let version = 'latest'
  const lastAt = rawPkg.lastIndexOf('@')
  if (lastAt > 0) {
    pkgName = rawPkg.slice(0, lastAt)
    version = rawPkg.slice(lastAt + 1)
  }

  // Check local first, then global
  let pkgJsonPath = normalize(_cwd + `/node_modules/${pkgName}/package.json`)
  let nmBase = normalize(_cwd + '/node_modules')
  
  if (!existsInVfs(pkgJsonPath)) {
    pkgJsonPath = `/node_modules/${pkgName}/package.json`
    nmBase = '/node_modules'
  }

  if (!existsInVfs(pkgJsonPath)) {
    stdout(`npx: installing ${pkgName}@${version}...\n`)
    if (_install) {
      await _install({ [pkgName]: version }, nmBase)
    } else {
      stderr('npx: installer not ready\n')
      return 1
    }
  }

  let binFile: string | null = null
  try {
    const pkg = JSON.parse(memfsInstance.readFileSync(pkgJsonPath, 'utf8') as string)
    if (pkg.bin) {
      if (typeof pkg.bin === 'string') {
        binFile = pathMod.join(nmBase, pkgName, pkg.bin)
      } else if (typeof pkg.bin === 'object' && pkg.bin !== null) {
        const keys = Object.keys(pkg.bin)
        const cmdName = pkgName.split('/').pop() || ''
        const matchingKey = keys.find(k => k === cmdName) || keys[0]
        if (matchingKey) {
          binFile = pathMod.join(nmBase, pkgName, pkg.bin[matchingKey])
        }
      }
    }
  } catch (e) {
    stderr(`npx: failed to read package.json for ${pkgName}: ${(e as Error).message}\n`)
    return 1
  }

  if (!binFile || !existsInVfs(binFile)) {
    stderr(`npx: could not find executable binary for ${pkgName}\n`)
    return 1
  }

  return await cmdNode([binFile, ...args.slice(pkgIndex + 1)])
}

// ── vite ─────────────────────────────────────────────────────────────────────

/**
 * Vite plugin: CJS-to-ESM interop
 * When Vite serves a CJS module from node_modules, this plugin intercepts it
 * and generates a synthetic ESM module that re-exports the CJS module's properties.
 *
 * This is the browser-node equivalent of Vite's optimizeDeps pre-bundling, which
 * normally uses esbuild/rolldown to convert CJS to ESM. Since those tools can't
 * run in-browser, we use our own requireSync loader to execute the CJS module
 * server-side and produce a clean ESM facade.
 *
 * This is completely transparent to the developer — no project modifications needed.
 */
function cjsToEsmPlugin() {
  return {
    name: 'browser-node-cjs-to-esm',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      // Only transform files in node_modules
      if (!id.includes('/node_modules/')) return null
      // Skip files that are already ESM
      if (/\bimport[\s{*"'`]/m.test(code) || /\bexport\s/m.test(code) || /\bimport\.meta\b/.test(code)) return null
      // Only transform files that use CJS patterns (including Object.defineProperty(exports, ...))
      const hasCjsPattern = /\b(module\.exports|exports\.\w+\s*=|exports\[|\bexports\b)/m.test(code) ||
        /\brequire\s*\(/m.test(code)
      if (!hasCjsPattern) return null

      if (!_require) return null

      // Execute the CJS module server-side using our loader to discover its exports
      try {
        const mod = _require(id, '/') as Record<string, unknown>
        if (!mod || typeof mod !== 'object') return null

        const keys = Object.keys(mod).filter(k =>
          k !== 'default' && k !== '__esModule' && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k)
        )

        // Generate synthetic ESM: serialize each export value by reference
        // We store the executed module in a global registry and reference it from the ESM facade
        const registryKey = `__cjs_registry_${id.replace(/[^a-zA-Z0-9]/g, '_')}`
        const lines: string[] = [
          `// CJS-to-ESM interop (browser-node runtime)`,
          `// Original: ${id}`,
          ``,
        ]

        // For primitive values, inline them; for objects/functions, we need to serialize or
        // provide them through the transform. Since this runs in Vite's transform (server-side),
        // we generate code that the browser will execute. We need the browser to get the actual
        // values, so we re-execute the CJS in a browser-compatible way.
        //
        // Strategy: generate an ESM module that uses a self-executing function to set up
        // the CJS environment (module, exports, require) and then re-exports everything.
        // The key difference from our previous approach: we provide a WORKING require()
        // by converting all require() calls to ESM imports at the top of the file.

        // Step 1: Find all require() calls in the source and extract the specifiers
        const requireCalls = new Set<string>()
        const requireRegex = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g
        let match
        while ((match = requireRegex.exec(code)) !== null) {
          requireCalls.add(match[1])
        }

        // Step 2: Generate import statements for each required module
        const imports: string[] = []
        const requireMap: Record<string, string> = {}
        let importIdx = 0
        for (const spec of requireCalls) {
          const varName = `__req_${importIdx++}`
          imports.push(`import * as ${varName} from "${spec}";`)
          requireMap[spec] = varName
        }

        // Step 3: Build the CJS wrapper with a working require function
        const requireEntries = Object.entries(requireMap)
          .map(([spec, varName]) => `    "${spec}": ${varName}`)
          .join(',\n')
        
        lines.push(...imports)
        lines.push(``)
        lines.push(`const __cjs_module = { exports: {} };`)
        lines.push(`const __cjs_require = (function() {`)
        lines.push(`  const __req_map = {`)
        lines.push(requireEntries)
        lines.push(`  };`)
        lines.push(`  return function require(id) {`)
        lines.push(`    if (id in __req_map) {`)
        lines.push(`      const ns = __req_map[id];`)
        lines.push(`      // Unwrap ESM namespace: if our CJS-to-ESM transform wrapped it, .default has module.exports`)
        lines.push(`      return ns && ns.default !== undefined ? ns.default : ns;`)
        lines.push(`    }`)
        lines.push(`    throw new Error("Cannot find module '" + id + "'");`)
        lines.push(`  };`)
        lines.push(`})();`)
        lines.push(`(function(module, exports, require) {`)
        lines.push(code)
        lines.push(`})(__cjs_module, __cjs_module.exports, __cjs_require);`)
        lines.push(``)
        lines.push(`const __cjs_result = __cjs_module.exports;`)
        lines.push(`export default __cjs_result;`)

        // Step 4: Add named exports for all discovered keys
        if (keys.length > 0) {
          lines.push(``)
          for (const k of keys) {
            lines.push(`export const ${k} = __cjs_result["${k}"];`)
          }
        }

        return { code: lines.join('\n'), map: null }
      } catch (e) {
        // If execution fails, return null and let Vite handle it
        console.log(`[cjs-to-esm] Failed to transform ${id}: ${(e as Error).message}`)
        return null
      }
    }
  }
}

async function cmdVite(args: string[]): Promise<number> {
  if (!_require) { stderr('vite: runtime not ready\n'); return 1 }

  // Ensure vite is installed
  let vite: Record<string, unknown>
  try { vite = _require('vite', _cwd) as Record<string, unknown> }
  catch (e: any) { stderr('vite error: ' + (e.stack || e.message) + '\n'); return 1 }

  const sub = args[0]
  if (sub === 'build') {
    stdout('vite: build is not supported in browser environment\n')
    return 1
  }

  // Default: dev server
  let port = 5173
  let rootArg = '.'
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && i + 1 < args.length) {
      port = parseInt(args[i + 1], 10)
      i++
    } else if (args[i].startsWith('--port=')) {
      port = parseInt(args[i].split('=')[1], 10)
    } else if (!args[i].startsWith('-')) {
      rootArg = args[i]
    }
  }
  const root = resolve(rootArg)
  try {
    const { createServer } = vite as { createServer: (opts: unknown) => Promise<{ listen(): Promise<void> }> }
    stdout(`Starting Vite dev server in \x1b[36m${root}\x1b[0m on port \x1b[33m${port}\x1b[0m...\n`)
    const server = await createServer({
      root,
      server: { port },
      logLevel: 'info',
      optimizeDeps: { noDiscovery: true },
      plugins: [cjsToEsmPlugin()],
    })
    await server.listen()
    stdout(`\x1b[32m✓\x1b[0m Vite dev server running on \x1b[36mhttp://localhost:${port}\x1b[0m\n`)
    return 0
  } catch (e) { stderr(`vite: ${(e as Error).message}\n`); return 1 }
}

// ── which ────────────────────────────────────────────────────────────────────

function cmdWhich(args: string[]): number {
  const builtins = ['ls','cd','pwd','mkdir','rm','mv','cp','touch','cat','echo',
    'node','npm','npx','vite','which','env','export','find','head','tail','grep','help','clear']
  for (const cmd of args) {
    if (builtins.includes(cmd)) stdout(`${cmd}: shell built-in\n`)
    else { stderr(`which: ${cmd}: not found\n`); return 1 }
  }
  return 0
}

// ── env ──────────────────────────────────────────────────────────────────────

function cmdEnv(): number {
  const proc = (globalThis as unknown as { process?: { env?: Record<string,string> } }).process
  const env = proc?.env ?? {}
  for (const [k, v] of Object.entries(env)) stdout(`${k}=${v}\n`)
  return 0
}

// ── export ───────────────────────────────────────────────────────────────────

function cmdExport(args: string[]): number {
  const proc = (globalThis as unknown as { process?: { env?: Record<string,string> } }).process
  if (!proc?.env) return 0
  for (const arg of args) {
    const eq = arg.indexOf('=')
    if (eq > 0) {
      const key = arg.slice(0, eq)
      const val = arg.slice(eq + 1)
      proc.env[key] = val
    }
  }
  return 0
}

// ── find ─────────────────────────────────────────────────────────────────────

function cmdFind(args: string[]): number {
  const root = args[0] ? resolve(args[0]) : _cwd
  const nameIdx = args.indexOf('-name')
  const nameFilter = nameIdx >= 0 ? args[nameIdx + 1] : undefined
  const typeIdx = args.indexOf('-type')
  const typeFilter = typeIdx >= 0 ? args[typeIdx + 1] : undefined

  function walk(dir: string) {
    let entries: string[]
    try { entries = memfsInstance.readdirSync(dir) as string[] } catch { return }
    for (const e of entries) {
      const fp = dir === '/' ? '/' + e : dir + '/' + e
      let isDir = false
      try { isDir = (memfsInstance.statSync(fp) as { isDirectory(): boolean }).isDirectory() } catch { continue }
      const matchName = !nameFilter || matchGlob(e, nameFilter)
      const matchType = !typeFilter || (typeFilter === 'f' ? !isDir : typeFilter === 'd' ? isDir : true)
      if (matchName && matchType) stdout(fp + '\n')
      if (isDir) walk(fp)
    }
  }

  walk(root); return 0
}

function matchGlob(name: string, pattern: string): boolean {
  const re = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$')
  return re.test(name)
}

// ── head / tail ───────────────────────────────────────────────────────────────

function cmdHead(args: string[]): number {
  const nIdx = args.indexOf('-n')
  const n = nIdx >= 0 ? parseInt(args[nIdx + 1], 10) : 10
  const files = args.filter(a => !a.startsWith('-') && !/^\d+$/.test(a))
  const file = files[0]
  if (!file) { stderr('head: file required\n'); return 1 }
  try {
    const lines = (memfsInstance.readFileSync(resolve(file), 'utf-8') as string).split('\n')
    stdout(lines.slice(0, n).join('\n') + '\n')
  } catch (e) { stderr(`head: ${(e as Error).message}\n`); return 1 }
  return 0
}

function cmdTail(args: string[]): number {
  const nIdx = args.indexOf('-n')
  const n = nIdx >= 0 ? parseInt(args[nIdx + 1], 10) : 10
  const files = args.filter(a => !a.startsWith('-') && !/^\d+$/.test(a))
  const file = files[0]
  if (!file) { stderr('tail: file required\n'); return 1 }
  try {
    const lines = (memfsInstance.readFileSync(resolve(file), 'utf-8') as string).split('\n')
    stdout(lines.slice(-n).join('\n') + '\n')
  } catch (e) { stderr(`tail: ${(e as Error).message}\n`); return 1 }
  return 0
}

// ── grep ─────────────────────────────────────────────────────────────────────

function cmdGrep(args: string[]): number {
  const ignoreCase = args.includes('-i')
  const showLine = args.includes('-n')
  const filtered = args.filter(a => !a.startsWith('-'))
  const [pattern, ...files] = filtered
  if (!pattern) { stderr('usage: grep [-in] <pattern> <file...>\n'); return 1 }
  const re = new RegExp(pattern, ignoreCase ? 'i' : '')
  let found = false
  for (const f of files) {
    try {
      const lines = (memfsInstance.readFileSync(resolve(f), 'utf-8') as string).split('\n')
      lines.forEach((line, i) => {
        if (re.test(line)) {
          const prefix = files.length > 1 ? `\x1b[35m${f}\x1b[0m:` : ''
          const num = showLine ? `\x1b[33m${i + 1}\x1b[0m:` : ''
          stdout(prefix + num + line + '\n')
          found = true
        }
      })
    } catch (e) { stderr(`grep: ${f}: ${(e as Error).message}\n`) }
  }
  return found ? 0 : 1
}

// ── help ─────────────────────────────────────────────────────────────────────

function cmdHelp(): number {
  stdout(`\x1b[1mBuilt-in commands:\x1b[0m
  \x1b[36mFilesystem:\x1b[0m  ls [-la]  cd  pwd  mkdir [-p]  rm [-rf]  mv  cp [-r]  touch  cat  find
  \x1b[36mText:\x1b[0m        echo  head [-n N]  tail [-n N]  grep [-in]
  \x1b[36mRuntime:\x1b[0m     node [--version] <file>  node -e "code"
               npm install [pkg@ver]  npm run <script>  npm --version
               vite [--port=N]
  \x1b[36mShell:\x1b[0m       env  export KEY=VAL  which  clear  help

  \x1b[90mKeyboard:\x1b[0m  \x1b[90m↑↓\x1b[0m history  \x1b[90mCtrl+L\x1b[0m clear  \x1b[90mCtrl+C\x1b[0m cancel

  \x1b[33mQuick start:\x1b[0m
    cd /examples/express && npm install && node index.js

  \x1b[90mExamples:\x1b[0m  express/  fastify/  react/  vue/  node-http/
`)
  return 0
}
