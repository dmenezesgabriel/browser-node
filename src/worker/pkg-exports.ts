import { exports as resolveExportsField, imports as resolveImportsField } from 'resolve.exports'
import type { Package } from 'resolve.exports'

/**
 * Thin wrapper around resolve.exports for package.json "exports"/"imports"
 * resolution. Two-pass condition order: prefer CJS ('require') entries, then
 * retry allowing ESM ('import') entries — the loader executes ESM via
 * Sucrase-to-CJS, so both are loadable. The second pass is what fixes
 * vite@5's `./runtime` subpath, which only declares an `import` condition.
 *
 * Example: resolvePkgExports(vitePkgJson, './runtime') → ['./dist/node/runtime.js']
 */
type FieldResolver = (opts: { require: boolean; conditions: string[] }) => string[] | undefined

function resolveTwoPass(resolveField: FieldResolver): string[] | undefined {
  for (const requireCondition of [true, false]) {
    // resolve.exports throws on entries it knows but cannot resolve under the
    // given conditions — treat that as "no match" so the loader's direct-file
    // fallback (relied on by next/dist/compiled/*) keeps working.
    try {
      const resolved = resolveField({ require: requireCondition, conditions: ['node'] })
      if (resolved?.length) return resolved
    } catch {}
  }
  return undefined
}

export function resolvePkgExports(pkg: Record<string, unknown>, subpath: string): string[] | undefined {
  return resolveTwoPass(opts => resolveExportsField(pkg as Package, subpath, opts) ?? undefined)
}

export function resolvePkgImports(pkg: Record<string, unknown>, specifier: string): string[] | undefined {
  return resolveTwoPass(opts => resolveImportsField(pkg as Package, specifier, opts) ?? undefined)
}
