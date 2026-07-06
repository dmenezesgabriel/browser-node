# Fix Four Issues

## 1. Sucrase sync loading

**Files to change:**
- `src/worker/loader.ts`: Add `getSucraseTransform` to export statement (line ~451)
- `src/worker/index.ts`: Import `getSucraseTransform` from `./loader`, `await` it in `init()` before posting `'ready'`

## 2. fork() implementation

**Files to change:**
- `src/worker/shims/child-process.ts`:
  - Add `ForkOptions` type
  - Add `send()`, `disconnect()`, `_channel` to `ChildProcess`
  - Wire `'message'` events from IPC port → ChildProcess events
  - Implement `fork(modulePath, args?, options?)`
- `src/worker/process-worker.ts`:
  - Support `mode: 'fork'` — load module via `requireSync()` instead of `runCommand()`
  - Wire `process.send()` / `process.on('message')` via MessagePort
- `src/worker/shims/process.ts`:
  - Add `send()`, `_sendPort: MessagePort | null`
- `tests/child-process.test.ts`:
  - Update fork test to verify returns ChildProcess

## 3. Vite E2E timeout

**Files to change:**
- `src/worker/npm.ts` line 146: Add `name.startsWith('@rolldown/binding-')` to skip condition

## 4. Dynamic import interception (Angular/Next.js)

**Files to change:**
- `src/worker/loader.ts` (`execSource`): Replace `import(` → `__import_fn(` in source before eval
- `src/worker/index.ts`:
  - Add `globalThis.__import_fn` that routes through `requireSync`
  - Update `CustomFunction` to handle both `return import(` and `return __import_fn(`

## Verification order
1. `npm test` — unit tests 256/256
2. Vite E2E: `npx playwright test --grep "Vite"`
3. Express & Terminal E2E (regression)
4. Integration: `node tests/integration/frameworks.mjs`
5. fork() manual QA via playwright-cli
