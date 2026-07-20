// Opt-in trace logging for the runtime worker. Off by default so per-module and
// per-request diagnostics don't pollute the user's terminal; enable with the
// `?debug=1` page query (the shell forwards it via setTraceEnabled) or by
// setting globalThis.__BN_DEBUG = true.
let _enabled = false

export function setTraceEnabled(enabled: boolean): void {
  _enabled = enabled
}

export function isTraceEnabled(): boolean {
  return _enabled || (globalThis as { __BN_DEBUG?: boolean }).__BN_DEBUG === true
}

/**
 * Emit a namespaced trace line to the terminal only when tracing is enabled.
 * @example trace('loader', `resolved ${specifier} → ${path}`)
 */
export function trace(tag: string, message: string): void {
  if (!isTraceEnabled()) return
  self.postMessage({ type: 'stdout', text: `[${tag}] ${message}\n` })
}
