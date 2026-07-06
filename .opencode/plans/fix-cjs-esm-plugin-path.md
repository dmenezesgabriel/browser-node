# Fix CJS-to-ESM Plugin Path Resolution

## Problem
`cjsToEsmPlugin()` in `terminal-cmd.ts` calls `_require(id, '/')` where `id` is a URL-style
absolute path from Vite (e.g. `/node_modules/rxjs/dist/cjs/index.js`). This fails because
the file isn't at that exact path in the VFS — packages are installed per-project (e.g.
`/examples/vite-angular-ts/node_modules/rxjs/...`). The catch block returns `null`, Vite
serves the raw CJS file, and the browser throws "does not provide an export named ...".

## Changes

### 1. `src/worker/terminal-cmd.ts`
- Add `isFileInVfs` to imports from `./vfs`
- Change `cjsToEsmPlugin()` to `cjsToEsmPlugin(viteRoot: string)`
- Before `_require(id, '/')`, resolve the path: if `id` is absolute and not found in VFS,
  try joining with `viteRoot` (strip leading `/` first)
- Update call site: `cjsToEsmPlugin(root)`

### 2. `src/worker/examples.ts`
- Remove the `resolve.alias.rxjs: 'rxjs/dist/esm5/index.js'` workaround from the Angular
  vite.config.ts

## Verification
- Run e2e tests: `npm run test:e2e`
- Check Angular example: `cd /examples/vite-angular-ts && npm install && npm run dev`
- Confirm the rxjs CJS file gets a proper ESM wrapper (check Vite transform logs)