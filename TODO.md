  - https://medium.com/@ehuerikenbaba/react-fundamentals-building-your-first-app-with-vite-1925d7a4204c
  - https://medium.com/@smita.s.kothari/angular-tutorial-learn-angular-by-building-an-app-from-scratch-533ba75b368b
  - https://medium.com/@demian.kostelny/fastify-quick-guide-for-beginners-8534a107cc18
  - https://medium.com/@chiragmehta900/build-your-first-next-js-app-from-scratch-to-learn-next-js-df7512db1903
  - https://medium.com/@douglas.rochedo/how-to-make-a-simple-server-in-express-js-4ae143cf95e5
  - https://medium.com/@skhans/building-web-applications-with-express-js-a-comprehensive-guide-113a77be1b11

---

## Runtime hardening (2026-07-20) — 6-phase plan implemented

The limitations that blocked react-todo / vue-todo / nextjs were addressed with a
faithful-emulation approach (unmodified projects), using the maintained libraries
Vite/Node themselves use. 67/67 Cucumber E2E scenarios green; 319 unit tests green.

1. **Module resolution** — `resolve.exports` two-pass resolver (`src/worker/pkg-exports.ts`,
   `src/worker/resolve.ts`). Root cause of `Cannot find module 'vite/runtime'` was the
   old resolver ignoring the `import` condition; also fixed a vite@5 dist bug where a
   module-scope `var exports` rebound the CJS wrapper, and made `require.resolve` return
   real VFS paths for shimmed-but-installed packages. **react-todo + vue-todo now boot the
   Vite dev server unmodified.**
2. **process.exit** — `ExitSignal` (`src/worker/shims/process.ts`) unwinds to the command
   boundary as an exit code instead of crashing; child workers self-terminate.
3. **fs.watch / HMR** — delegates to memfs's real watcher; chokidar shim over it. The actual
   HMR blocker was the stream shim lacking a pull-model `Readable` (readdirp yielded nothing);
   now fixed. Vite's watcher invalidates the module graph on edits.
4. **Loader hardening** — `es-module-lexer` replaces the hand-rolled dynamic-import scanner;
   `cjs-module-lexer` for export discovery; mtime-based cache invalidation (`resetForNewRun`)
   keeps node_modules cached across runs; trace logging gated behind `?debug=1`.
5. **Process model** — `src/worker/fs-journal.ts` propagates a child's fs writes back to the
   parent VFS (child→parent); real `worker_threads` (`src/worker/shims/worker-threads.ts`)
   with `workerData` + message passing.
6. **Persistence** — `src/worker/persist.ts` mirrors the VFS to OPFS (excludes node_modules/tmp);
   a reload restores the workspace. `?fresh=1` disables it.

Not addressed (out of scope, unchanged): raw TCP/UDP sockets, N-API native addons, real Next.js
`next dev` end-to-end (process.exit is fixed but other Next internals remain), SharedArrayBuffer
IPC, `vite build`.

---

## E2E Test Results (2026-07-18)

Tested on deployed GitHub Pages app with playwright-cli.

| # | Example        | npm install | Start command | Preview renders | Status              |
|---|----------------|-------------|---------------|-----------------|---------------------|
| 1 | express-todo   | 118 pkgs    | `node index.js`  | Express Todos heading, input, empty state | **PASS** |
| 2 | fastify-todo   | 118 pkgs    | `node index.js`  | Fastify Todos heading (purple), input, empty state | **PASS** |
| 3 | node-http-todo | 48 pkgs     | `node index.js`  | Node HTTP Todos heading (orange), input, empty state | **PASS** |
| 4 | angularjs-todo | 49 pkgs     | `node server.js` | AngularJS Todos heading (red), input, empty state | **PASS** |
| 5 | nextjs-todo    | 65 pkgs     | `npm run dev`    | process.exit fixed; other Next internals remain | **PARTIAL** |
| 6 | react-todo     | 98 pkgs     | `npm run dev`    | Vite dev server boots + serves the app | **PASS (2026-07-20)** |
| 7 | vue-todo       | 66 pkgs     | `npm run dev`    | Vite dev server boots + serves the app | **PASS (2026-07-20)** |

> Rows 5–7 updated 2026-07-20 — see "Runtime hardening" above. react-todo/vue-todo
> validated via the `react`/`vue`/`vite` Cucumber features (dev server boots unmodified,
> preview serves the app, HMR watcher invalidates). nextjs-todo's `process.exit` crash is
> fixed; full `next dev` still has unrelated blockers.

### What works

- Scaffolding apps
- Component development (React, Angular, Vue)
- Dev servers with HMR
- Basic routing, middleware, server handlers
- TypeScript compilation
- npm install in VFS
- Node HTTP server shim (http.createServer)

### What won't work

- Real TCP/UDP sockets, raw net/dgram
- Native .node addons (no N-API in browser)
- Database drivers that use native bindings
- SharedArrayBuffer-based worker_threads / synchronous IPC (prod isn't cross-origin isolated)
- `vite build` (dev server only)
- Full Next.js `next dev` (process.exit fixed, but other Next internals remain)

### Now works (2026-07-20, previously "won't work")

- Vite dev server with HMR (real fs.watch via memfs + pull-model streams)
- `child_process.fork()`/`spawn()` with child→parent VFS propagation (write-journal)
- `worker_threads` (JS/Wasm, no SharedArrayBuffer) with workerData + messaging
- Filesystem persistence across reloads (OPFS mirror)

### Next steps

- [ ] Convert react-todo and vue-todo from Vite dev server to inline/static builds that work in VFS
- [ ] Investigate alternatives to Next.js that don't require process spawning
- [ ] Add E2E tests (cucumber) for the 4 working examples
- [ ] Consider adding a "tested working" badge per example in the file tree

---

## Hypothesis Plan: Browser-Native Runtime Using Official Vite APIs

**Status**: Hypothesis — requires deeper investigation before implementation

**Goal**: Enable react-todo, vue-todo, and nextjs-todo to run in browser-node without workarounds or band-aids on the projects themselves.

### Research Context

The current failures stem from two root causes:
1. **Vite dev server** expects real `fs.watch`, WebSocket upgrade, and native modules
2. **Next.js** requires `process.exit()` and real `child_process` spawning

### Proposed Architecture

Build a browser-native runtime using official Vite APIs and Web Standards, similar in concept to WebContainers but implemented from scratch.

**Key Technologies**:
- Vite Environment API / ModuleRunner (`vite/module-runner`)
- Web Workers for process isolation
- MessageChannel for IPC
- esbuild-wasm (already in use)
- memfs (already in use)

### Phase 1: Vite Module Runner Integration

**Target**: Fix react-todo and vue-todo

**Hypothesis**: Use Vite's official ModuleRunner API with a custom transport layer that communicates via MessageChannel instead of HTTP.

**Key Files (new)**:
- `src/worker/vite-dev-server.ts` - Runs Vite transform pipeline using our VFS
- `src/worker/vite-module-runner.ts` - Module runner for target environment
- `src/worker/vite-transport.ts` - MessageChannel-based transport

**How it would work**:
1. Server environment runs Vite plugins + our VFS for file access
2. ModuleRunner executes transformed code in target environment
3. Transport uses MessageChannel to bridge server ↔ runner
4. File watching becomes VFS event system (no real fs.watch needed)

**Open Questions**:
- Can Vite ModuleRunner run inside a Web Worker (not just Node.js)?
- How to handle Vite's dependency pre-bundling in browser?
- Performance impact of WASM-based transformation?

### Phase 2: Process Management (WebContainers-style)

**Target**: Fix nextjs-todo

**Hypothesis**: Use Web Workers as process equivalents with MessageChannel-based IPC.

**Key Files (new)**:
- `src/worker/process-manager.ts` - Process lifecycle management
- `src/worker/ipc-channel.ts` - MessageChannel IPC abstraction

**How it would work**:
1. `spawn(command)` creates a new Web Worker
2. Each worker runs in isolated context with its own VFS snapshot
3. `process.exit()` terminates worker, sends exit event to parent
4. `child_process.spawn()` creates worker with proper stdio mapping
5. IPC through MessageChannel (port1 in parent, port2 in child)

**Open Questions**:
- How to share VFS state between parent and child efficiently?
- Can Web Workers access SharedArrayBuffer for zero-copy transfer?
- How to handle process groups and signal propagation?

### Phase 3: Virtual File Watcher

**Target**: Enable fs.watch for Vite and other tools

**Hypothesis**: Implement file watching through VFS custom events.

**Key Files (new)**:
- `src/worker/vfs-watcher.ts` - EventEmitter-based watcher

**How it would work**:
1. VFS operations emit change events (writeFile, rmDir, mkdir)
2. VfsWatcher extends EventEmitter, filters by filename
3. `fs.watch()` returns VfsWatcher instance
4. Supports recursive directory watching via event bubbling

**Open Questions**:
- How to handle rapid changes (debouncing)?
- Chokidar API compatibility requirements?

### Phase 4: HTTP/WebSocket Enhancement

**Target**: Enable WebSocket upgrade and streaming

**Hypothesis**: Use MessageChannel for WebSocket transport.

**How it would work**:
1. Server creates MessagePort pair
2. Client receives port, wraps as WebSocket-like API
3. Supports send(), onmessage, onopen, onclose
4. Streaming via ReadableStream + Transferable objects

### Dependencies (Official Only)

Already in package.json:
- `vite` (v8.1.5) - ModuleRunner, Environment API
- `esbuild-wasm` - Transformation
- `memfs` - VFS
- `@vitejs/plugin-react` - React JSX transform

No new dependencies required.

### Risks and Concerns

1. **Vite ModuleRunner browser support**: Documentation primarily shows Node.js usage; need to verify Web Worker compatibility
2. **Performance**: WASM-based transformation is ~10x slower than native
3. **Memory**: Large node_modules trees may hit browser memory limits
4. **SharedArrayBuffer**: Requires COOP/COEP headers (already configured)
5. **Complexity**: Building WebContainers-like system is significant undertaking

### Next Steps for Investigation

- [ ] Prototype Vite ModuleRunner in Web Worker context
- [ ] Verify MessageChannel transport works with Vite's API
- [ ] Test process isolation with Web Workers
- [ ] Benchmark WASM transformation performance
- [ ] Review Vite 8 Environment API for browser runtime support
- [ ] Study WebContainers architecture for inspiration (not code)

