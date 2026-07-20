// `vite` terminal command + the CJS-to-ESM interop plugin it runs the project's
// installed Vite with. Split out of terminal-cmd.ts: this owns Vite dev-server
// orchestration, the shell owns everything else. State it needs from the shell
// (the loader's require, output sinks, path resolver, cwd) is passed in as a
// context object rather than shared module-level mutable state.
import { isFileInVfs } from './vfs'
import { path as pathMod } from './shims/path'
import { cjsNamedExports, hasEsmSyntax } from './lexer'
import { trace } from './log'

type RequireFn = (id: string, fromDir: string) => unknown

export interface ViteCmdContext {
  require: RequireFn | null
  stdout: (s: string) => void
  stderr: (s: string) => void
  resolve: (p: string) => string
  cwd: string
}

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
function cjsToEsmPlugin(viteRoot: string, requireFn: RequireFn) {
  return {
    name: 'browser-node-cjs-to-esm',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      // Only transform files in node_modules
      if (!id.includes('/node_modules/')) return null
      // Skip files that are already ESM. Use es-module-lexer (not a regex) so
      // the words import/export inside strings/comments don't cause false
      // positives — react.development.js has "…forgot to export your component…"
      // error strings that the old regex matched, leaving it served as raw CJS.
      if (hasEsmSyntax(code)) return null
      // Only transform files that use CJS patterns (including Object.defineProperty(exports, ...))
      const hasCjsPattern = /\b(module\.exports|exports\.\w+\s*=|exports\[|\bexports\b)/m.test(code) ||
        /\brequire\s*\(/m.test(code)
      if (!hasCjsPattern) return null

      // Execute the CJS module server-side using our loader to discover its exports
      try {
        // Resolve the VFS path: Vite passes URL paths like /node_modules/rxjs/...
        // but packages are installed at project-specific paths (e.g. /examples/.../node_modules/...)
        let resolvedId = id
        if (!isFileInVfs(resolvedId) && resolvedId.startsWith('/') && viteRoot) {
          const candidate = pathMod.join(viteRoot, resolvedId.slice(1))
          if (isFileInVfs(candidate)) {
            resolvedId = candidate
          }
        }
        // Discover named exports statically (cjs-module-lexer, no execution) and
        // union with runtime enumeration. The static pass lets us still build a
        // facade for deps that throw when executed server-side, and catches
        // transpiler getter exports; the runtime pass catches dynamically-assigned
        // ones the lexer can't see.
        const isValidExport = (k: string) =>
          k !== 'default' && k !== '__esModule' && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k)
        const staticKeys = cjsNamedExports(code).filter(isValidExport)
        let keys = staticKeys
        try {
          const mod = requireFn(resolvedId, '/') as Record<string, unknown>
          if (mod && typeof mod === 'object') {
            const runtimeKeys = Object.keys(mod).filter(isValidExport)
            keys = Array.from(new Set([...staticKeys, ...runtimeKeys]))
          }
        } catch { /* dep threw on server-side execution — keep static keys */ }
        if (keys.length === 0 && staticKeys.length === 0) return null

        // Generate an ESM facade that re-executes the CJS body in the browser with a
        // working require() (require() calls become ESM imports) and re-exports it.
        const lines: string[] = [
          `// CJS-to-ESM interop (browser-node runtime)`,
          `// Original: ${id}`,
          ``,
        ]

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
        lines.push(`    if (typeof globalThis._requireSync === "function") {`)
        lines.push(`      const dir = ${JSON.stringify(resolvedId.split('/').slice(0, -1).join('/') || '/')};`)
        lines.push(`      try {`)
        lines.push(`        return globalThis._requireSync(id, dir);`)
        lines.push(`      } catch (err) {`)
        lines.push(`        throw new Error("Cannot find module '" + id + "' from '" + dir + "': " + err.message);`)
        lines.push(`      }`)
        lines.push(`    }`)
        lines.push(`    throw new Error("Cannot find module '" + id + "'");`)
        lines.push(`  };`)
        lines.push(`})();`)
        lines.push(`const __cjs_filename = ${JSON.stringify(resolvedId)};`)
        lines.push(`const __cjs_dirname = ${JSON.stringify(resolvedId.split('/').slice(0, -1).join('/') || '/')};`)
        lines.push(`(function(module, exports, require, __filename, __dirname) {`)
        lines.push(code)
        lines.push(`})(__cjs_module, __cjs_module.exports, __cjs_require, __cjs_filename, __cjs_dirname);`)
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
        trace('cjs-to-esm', `Failed to transform ${id}: ${(e as Error).message}`)
        return null
      }
    }
  }
}

export async function cmdVite(args: string[], ctx: ViteCmdContext): Promise<number> {
  const { require: requireFn, stdout, stderr, resolve, cwd } = ctx
  if (!requireFn) { stderr('vite: runtime not ready\n'); return 1 }

  // Ensure vite is installed
  let vite: Record<string, unknown>
  try { vite = requireFn('vite', cwd) as Record<string, unknown> }
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
      // allowedHosts: the SW-proxied preview request carries no Host header (the
      // browser Fetch API forbids it), so Vite's hostCheckMiddleware would 403.
      // We are a trusted same-browser proxy inside a Worker VFS — no rebinding
      // surface — so disabling the check is correct, not a workaround.
      server: { port, allowedHosts: true },
      logLevel: 'info',
      optimizeDeps: { noDiscovery: true },
      plugins: [cjsToEsmPlugin(root, requireFn)],
    })
    await server.listen()
    stdout(`\x1b[32m✓\x1b[0m Vite dev server running on \x1b[36mhttp://localhost:${port}\x1b[0m\n`)
    return 0
  } catch (e) { stderr(`vite: ${(e as Error).stack ?? (e as Error).message}\n`); return 1 }
}
