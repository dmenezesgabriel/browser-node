import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
  },
  base: process.env.VITE_BASE ?? '/',
  root: '.',
  resolve: {
    alias: {
      // Vite externalizes node: built-ins to undefined in browser builds.
      // memfs's @jsonjoy.com/fs-node-builtins re-exports from node:events/stream/path,
      // so we must alias them to our shims BEFORE memfs tries to import them.
      'node:buffer': 'buffer',
      'node:process': resolve(__dirname, 'src/polyfills/process.ts'),
      'process': resolve(__dirname, 'src/polyfills/process.ts'),
      'node:events': resolve(__dirname, 'src/worker/shims/events.ts'),
      'node:stream': resolve(__dirname, 'src/worker/shims/stream.ts'),
      'node:path': resolve(__dirname, 'src/worker/shims/path.ts'),
      'node:url': resolve(__dirname, 'src/worker/shims/url.ts'),
    },
  },
  define: {
    global: 'globalThis',
  },
  build: { target: 'esnext' },
  worker: { format: 'es' },
  server: {
    headers: {},
    proxy: {
      // Proxy npm registry through Node so browser TLS cert issues don't block installs
      '/_npm': {
        target: 'https://registry.npmjs.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/_npm/, ''),
      },
    },
  },
  // optimizeDeps: {
  //   exclude: ['esbuild-wasm'],
  // },
})
