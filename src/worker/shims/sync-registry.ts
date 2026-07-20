export let _requireSync: (spec: string, fromDir: string) => unknown = () => undefined
export let _resolveModule: (spec: string, fromDir: string) => string | null = () => null
// VFS-only resolution (no shim registry) — see loader.resolveModuleInVfs
export let _resolveModuleInVfs: (spec: string, fromDir: string) => string | null = () => null

export function bindRequireSync(
  fn: (spec: string, fromDir: string) => unknown,
  resolveFn: (spec: string, fromDir: string) => string | null,
  resolveVfsFn?: (spec: string, fromDir: string) => string | null
): void {
  _requireSync = fn
  _resolveModule = resolveFn
  _resolveModuleInVfs = resolveVfsFn ?? (() => null)
  globalThis._requireSync = fn
  globalThis._resolveModule = resolveFn
}
