export let _requireSync: (spec: string, fromDir: string) => unknown = () => undefined
export let _resolveModule: (spec: string, fromDir: string) => string | null = () => null

export function bindRequireSync(
  fn: (spec: string, fromDir: string) => unknown,
  resolveFn: (spec: string, fromDir: string) => string | null
): void {
  _requireSync = fn
  _resolveModule = resolveFn
  globalThis._requireSync = fn
  globalThis._resolveModule = resolveFn
}
