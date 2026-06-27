const proc = {
  env: { NODE_ENV: 'development' } as Record<string, string | undefined>,
  argv: ['node', 'script.js'],
  version: 'v22.0.0',
  versions: { node: '22.0.0' },
  platform: 'browser' as NodeJS.Platform,
  cwd: () => '/',
  nextTick: (fn: (...args: unknown[]) => void, ...args: unknown[]) => { queueMicrotask(() => fn(...args)) },
  exit: (_code = 0) => {},
  stdout: { write: (_s: string) => true },
  stderr: { write: (_s: string) => true },
  on: (_e: string, _l: unknown) => proc,
  off: (_e: string, _l: unknown) => proc,
  emit: (_e: string) => false,
  hrtime: (t?: [number, number]): [number, number] => {
    const ns = BigInt(Math.round(performance.now() * 1e6))
    if (t) { const d = ns - BigInt(t[0]) * 1_000_000_000n - BigInt(t[1]); return [Number(d / 1_000_000_000n), Number(d % 1_000_000_000n)] }
    return [Number(ns / 1_000_000_000n), Number(ns % 1_000_000_000n)]
  },
}
export default proc
export const { env, argv, version, versions, platform, cwd, nextTick, exit, stdout, stderr, on, off, emit, hrtime } = proc
