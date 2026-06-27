import { writeFileToVfs, mkdirpSync } from './vfs'

export function initExamples() {
  mkdirpSync('/examples')

  // ── Express ──────────────────────────────────────────────────────────────────
  mkdirpSync('/examples/express')
  writeFileToVfs('/examples/express/package.json', JSON.stringify({
    name: 'express-example',
    version: '1.0.0',
    main: 'index.js',
    dependencies: { express: '^4.18.0' }
  }, null, 2))
  writeFileToVfs('/examples/express/index.js',
`'use strict'
const express = require('express')

const app = express()
const PORT = 3000

app.get('/', function(req, res) {
  res.send(\`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Express</title>
  <style>
    body { font-family: sans-serif; padding: 2rem; max-width: 640px; margin: 0 auto;
           background: #0f1117; color: #e6edf3; }
    h1   { color: #58a6ff; }
    p    { color: #8b949e; line-height: 1.6; }
    a    { color: #58a6ff; }
    code { background: #161b22; padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Express.js</h1>
  <p>This server runs entirely in your browser via a Web Worker.</p>
  <p>Try <a href="/api/hello"><code>GET /api/hello</code></a> for a JSON endpoint.</p>
</body>
</html>\`)
})

app.get('/api/hello', function(req, res) {
  res.json({ message: 'Hello from Express!', framework: 'express' })
})

app.listen(PORT, function() {
  console.log('Express server on http://localhost:' + PORT)
})
`)

  // ── Fastify ───────────────────────────────────────────────────────────────────
  mkdirpSync('/examples/fastify')
  writeFileToVfs('/examples/fastify/package.json', JSON.stringify({
    name: 'fastify-example',
    version: '1.0.0',
    main: 'index.js',
    dependencies: { fastify: '^4.0.0' }
  }, null, 2))
  writeFileToVfs('/examples/fastify/index.js',
`'use strict'
const fastify = require('fastify')({ logger: false })
const PORT = 3000

fastify.get('/', async function(req, reply) {
  reply.type('text/html')
  return \`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Fastify</title>
  <style>
    body { font-family: sans-serif; padding: 2rem; max-width: 640px; margin: 0 auto;
           background: #0f1117; color: #e6edf3; }
    h1   { color: #e879f9; }
    p    { color: #8b949e; line-height: 1.6; }
    a    { color: #e879f9; }
    code { background: #161b22; padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Fastify</h1>
  <p>This server runs entirely in your browser via a Web Worker.</p>
  <p>Try <a href="/api/hello"><code>GET /api/hello</code></a> for a JSON endpoint.</p>
</body>
</html>\`
})

fastify.get('/api/hello', async function() {
  return { message: 'Hello from Fastify!', framework: 'fastify' }
})

fastify.listen({ port: PORT }, function(err) {
  if (err) { console.error(err.message); return }
  console.log('Fastify server on http://localhost:' + PORT)
})
`)

  // ── React ─────────────────────────────────────────────────────────────────────
  // Serves React UMD build from local node_modules — no CDN, no bundler.
  // Run: npm install && node server.js
  mkdirpSync('/examples/react')
  writeFileToVfs('/examples/react/package.json', JSON.stringify({
    name: 'react-example',
    version: '1.0.0',
    main: 'server.js',
    dependencies: {
      express: '^4.18.0',
      react: '^18.0.0',
      'react-dom': '^18.0.0'
    }
  }, null, 2))
  writeFileToVfs('/examples/react/server.js',
`'use strict'
const path    = require('path')
const fs      = require('fs')
const express = require('express')

const app  = express()
const PORT = 3000

// Serve React UMD builds from local node_modules (installed via npm install).
// No CDN — everything lives in the in-browser virtual filesystem.
const nm = path.resolve(__dirname, 'node_modules')

app.get('/react.js', function(req, res) {
  res.setHeader('Content-Type', 'application/javascript')
  res.end(fs.readFileSync(path.join(nm, 'react/umd/react.development.js'), 'utf8'))
})

app.get('/react-dom.js', function(req, res) {
  res.setHeader('Content-Type', 'application/javascript')
  res.end(fs.readFileSync(path.join(nm, 'react-dom/umd/react-dom.development.js'), 'utf8'))
})

app.get('/', function(req, res) {
  res.setHeader('Content-Type', 'text/html')
  res.end(\`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>React App</title>
  <script src="/react.js"></script>
  <script src="/react-dom.js"></script>
  <style>
    body   { font-family: sans-serif; padding: 2rem; background: #0f1117; color: #e6edf3; }
    h1     { color: #61dafb; }
    p      { color: #8b949e; }
    .count { font-size: 3rem; margin: 1rem 0; }
    button { padding: 8px 20px; background: rgba(97,218,251,0.15);
             border: 1px solid rgba(97,218,251,0.3); color: #61dafb;
             border-radius: 6px; cursor: pointer; font-size: 14px; }
    button:hover { background: rgba(97,218,251,0.25); }
  </style>
</head>
<body>
  <div id="root"></div>
  <script>
    // React without JSX — uses React.createElement directly
    var h = React.createElement
    function Counter() {
      var state  = React.useState(0)
      var count  = state[0]
      var setCount = state[1]
      return h('div', null,
        h('h1', null, 'React Counter'),
        h('p',  null, 'Loaded from npm — no CDN, no bundler'),
        h('div', { className: 'count' }, count),
        h('button', { onClick: function() { setCount(function(c) { return c + 1 }) } }, 'Increment')
      )
    }
    ReactDOM.createRoot(document.getElementById('root')).render(h(Counter))
  </script>
</body>
</html>\`)
})

app.listen(PORT, function() {
  console.log('React app on http://localhost:' + PORT)
})
`)

  // ── Vue ───────────────────────────────────────────────────────────────────────
  // Serves Vue global build from local node_modules — no CDN, no bundler.
  // Run: npm install && node server.js
  mkdirpSync('/examples/vue')
  writeFileToVfs('/examples/vue/package.json', JSON.stringify({
    name: 'vue-example',
    version: '1.0.0',
    main: 'server.js',
    dependencies: {
      express: '^4.18.0',
      vue: '^3.0.0'
    }
  }, null, 2))
  writeFileToVfs('/examples/vue/server.js',
`'use strict'
const path    = require('path')
const fs      = require('fs')
const express = require('express')

const app  = express()
const PORT = 3000

// Serve Vue global UMD build from local node_modules (installed via npm install).
// No CDN — everything lives in the in-browser virtual filesystem.
const nm = path.resolve(__dirname, 'node_modules')

app.get('/vue.js', function(req, res) {
  res.setHeader('Content-Type', 'application/javascript')
  res.end(fs.readFileSync(path.join(nm, 'vue/dist/vue.global.js'), 'utf8'))
})

app.get('/', function(req, res) {
  res.setHeader('Content-Type', 'text/html')
  res.end(\`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Vue App</title>
  <script src="/vue.js"></script>
  <style>
    body   { font-family: sans-serif; padding: 2rem; background: #0f1117; color: #e6edf3; }
    h1     { color: #42d392; }
    p      { color: #8b949e; }
    .count { font-size: 3rem; margin: 1rem 0; }
    button { padding: 8px 20px; background: rgba(66,211,146,0.15);
             border: 1px solid rgba(66,211,146,0.3); color: #42d392;
             border-radius: 6px; cursor: pointer; font-size: 14px; }
    button:hover { background: rgba(66,211,146,0.25); }
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
    Vue.createApp({
      data: function() { return { count: 0 } },
      template: \\\`
        <div>
          <h1>Vue Counter</h1>
          <p>Loaded from npm — no CDN, no bundler</p>
          <div class="count">{{ count }}</div>
          <button @click="count++">Increment</button>
        </div>
      \\\`
    }).mount('#app')
  </script>
</body>
</html>\`)
})

app.listen(PORT, function() {
  console.log('Vue app on http://localhost:' + PORT)
})
`)

  // ── Plain Node.js HTTP ────────────────────────────────────────────────────────
  mkdirpSync('/examples/node-http')
  writeFileToVfs('/examples/node-http/package.json', JSON.stringify({
    name: 'node-http-example',
    version: '1.0.0',
    main: 'index.js',
    dependencies: {}
  }, null, 2))
  writeFileToVfs('/examples/node-http/index.js',
`'use strict'
const http = require('http')

const PORT = 3000

const server = http.createServer(function(req, res) {
  if (req.url === '/api') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ message: 'Hello from Node.js http!', url: req.url }))
    return
  }
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(\`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Node.js HTTP</title>
  <style>
    body { font-family: sans-serif; padding: 2rem; max-width: 640px; margin: 0 auto;
           background: #0f1117; color: #e6edf3; }
    h1   { color: #f59e0b; }
    p    { color: #8b949e; line-height: 1.6; }
    a    { color: #f59e0b; }
    code { background: #161b22; padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Node.js HTTP</h1>
  <p>Using the built-in <code>http</code> module — no dependencies needed.</p>
  <p>Try <a href="/api"><code>GET /api</code></a> for a JSON endpoint.</p>
</body>
</html>\`)
})

server.listen(PORT, function() {
  console.log('HTTP server on http://localhost:' + PORT)
})
`)

  // ── Vite React TypeScript ──────────────────────────────────────────────────
  mkdirpSync('/examples/vite-react-ts')
  mkdirpSync('/examples/vite-react-ts/src')
  
  writeFileToVfs('/examples/vite-react-ts/package.json', JSON.stringify({
    name: 'vite-react-ts',
    private: true,
    version: '1.0.0',
    type: 'module',
    scripts: {
      dev: 'vite --port 3000',
      build: 'vite build',
      preview: 'vite preview'
    },
    dependencies: {
      react: '^18.3.1',
      'react-dom': '^18.3.1'
    },
    devDependencies: {
      vite: '^8.0.16',
      typescript: '^6.0.3'
    }
  }, null, 2))

  writeFileToVfs('/examples/vite-react-ts/tsconfig.json', JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      jsx: 'react-jsx',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true
    }
  }, null, 2))

  writeFileToVfs('/examples/vite-react-ts/vite.config.ts',
`import { defineConfig } from 'vite'
export default defineConfig({
  server: {
    port: 3000
  }
})
`)

  writeFileToVfs('/examples/vite-react-ts/index.html',
`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + React + TS</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`)

  writeFileToVfs('/examples/vite-react-ts/src/main.tsx',
`import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
`)

  writeFileToVfs('/examples/vite-react-ts/src/App.tsx',
`import React, { useState } from 'react'
import './App.css'

export default function App() {
  const [count, setCount] = useState(0)
  return (
    <div className="container">
      <header className="header">
        <div className="logo-react">⚛️</div>
        <h1>Vite + React + TypeScript</h1>
      </header>
      <main className="card">
        <p className="subtitle">Interactive Web Component running inside an in-browser Node.js sandbox.</p>
        <div className="counter-box">
          <span className="count-label">Count</span>
          <span className="count-val">{count}</span>
          <div className="button-group">
            <button onClick={() => setCount(c => c - 1)} className="btn btn-secondary">-</button>
            <button onClick={() => setCount(0)} className="btn btn-muted">Reset</button>
            <button onClick={() => setCount(c => c + 1)} className="btn btn-primary">+</button>
          </div>
        </div>
      </main>
    </div>
  )
}
`)

  writeFileToVfs('/examples/vite-react-ts/src/index.css',
`:root {
  --bg: #0d1117;
  --panel: #161b22;
  --text: #c9d1d9;
  --accent: #58a6ff;
  --accent-gradient: linear-gradient(135deg, #58a6ff 0%, #1f6feb 100%);
}
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, sans-serif;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
}
`)

  writeFileToVfs('/examples/vite-react-ts/src/App.css',
`.container {
  max-width: 600px;
  width: 100%;
  padding: 2rem;
  box-sizing: border-box;
}
.header {
  text-align: center;
  margin-bottom: 2rem;
}
.logo-react {
  font-size: 4rem;
  animation: spin 15s linear infinite;
  display: inline-block;
  margin-bottom: 1rem;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
h1 {
  font-size: 2rem;
  font-weight: 800;
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin: 0;
}
.card {
  background: var(--panel);
  border: 1px solid #30363d;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
}
.subtitle {
  color: #8b949e;
  text-align: center;
  margin-bottom: 2rem;
  line-height: 1.6;
}
.counter-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}
.count-label {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #8b949e;
}
.count-val {
  font-size: 4rem;
  font-weight: 700;
  color: #fff;
}
.button-group {
  display: flex;
  gap: 1rem;
  margin-top: 1rem;
}
.btn {
  padding: 10px 24px;
  font-size: 1rem;
  font-weight: 600;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-primary {
  background: var(--accent);
  color: #fff;
}
.btn-primary:hover {
  background: #79c0ff;
}
.btn-secondary {
  background: #21262d;
  color: #c9d1d9;
  border-color: #30363d;
}
.btn-secondary:hover {
  background: #30363d;
}
.btn-muted {
  background: transparent;
  color: #8b949e;
  border-color: #21262d;
}
.btn-muted:hover {
  color: #fff;
  border-color: #30363d;
}
`)

  // ── Vite Angular TypeScript ────────────────────────────────────────────────
  mkdirpSync('/examples/vite-angular-ts')
  mkdirpSync('/examples/vite-angular-ts/src')
  mkdirpSync('/examples/vite-angular-ts/src/app')

  writeFileToVfs('/examples/vite-angular-ts/tsconfig.json', JSON.stringify({
    compilerOptions: {
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      target: "es2022",
      moduleResolution: "node",
      esModuleInterop: true
    }
  }, null, 2))

  writeFileToVfs('/examples/vite-angular-ts/package.json', JSON.stringify({
    name: 'vite-angular-ts',
    private: true,
    version: '1.0.0',
    type: 'module',
    scripts: {
      dev: 'vite --port 3000',
      build: 'vite build',
      preview: 'vite preview'
    },
    dependencies: {
      '@angular/core': '^15.2.0',
      '@angular/common': '^15.2.0',
      '@angular/compiler': '^15.2.0',
      '@angular/platform-browser': '^15.2.0',
      '@angular/platform-browser-dynamic': '^15.2.0',
      rxjs: '^7.8.0',
      'zone.js': '^0.12.0'
    },
    devDependencies: {
      vite: '^8.0.16',
      typescript: '^5.0.0',
      '@analogjs/vite-plugin-angular': '^0.2.0'
    }
  }, null, 2))

  writeFileToVfs('/examples/vite-angular-ts/vite.config.ts',
`import { defineConfig } from 'vite'
import angular from '@analogjs/vite-plugin-angular'

export default defineConfig({
  server: {
    port: 3000,
    hmr: false
  },
  plugins: [angular({ jit: true })]
})
`)

  writeFileToVfs('/examples/vite-angular-ts/index.html',
`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Angular + Vite + TS</title>
    <style>
      body {
        margin: 0;
        background: #0d1117;
        color: #c9d1d9;
        font-family: system-ui, -apple-system, sans-serif;
      }
    </style>
  </head>
  <body>
    <app-root>Loading Angular application...</app-root>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`)

  writeFileToVfs('/examples/vite-angular-ts/src/main.ts',
`import '@angular/compiler'
import 'zone.js'
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic'
import { AppModule } from './app/app.module'

platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .catch(err => console.error(err))
`)

  writeFileToVfs('/examples/vite-angular-ts/src/app/app.component.ts',
`import { Component } from '@angular/core'

@Component({
  selector: 'app-root',
  template: \`
    <div class="container">
      <header class="header">
        <div class="logo">🅰️</div>
        <h1>Angular + Vite + TypeScript</h1>
      </header>
      <main class="card">
        <p class="subtitle">A full reactive Todo app running inside your browser node environment.</p>
        <div class="input-group">
          <input #newTodo placeholder="What needs to be done?" (keyup.enter)="addTodo(newTodo.value); newTodo.value=''">
          <button (click)="addTodo(newTodo.value); newTodo.value=''">Add Task</button>
        </div>
        <ul class="todo-list">
          <li *ngFor="let todo of todos; let i = index" [class.completed]="todo.completed">
            <span (click)="toggleTodo(i)">{{ todo.text }}</span>
            <button class="btn-delete" (click)="deleteTodo(i)">&times;</button>
          </li>
        </ul>
      </main>
    </div>
  \`,
  styles: [\`
    .container { max-width: 500px; margin: 2rem auto; padding: 0 1rem; }
    .header { text-align: center; margin-bottom: 2rem; }
    .logo { font-size: 4rem; display: inline-block; margin-bottom: 0.5rem; }
    h1 { font-size: 1.8rem; background: linear-gradient(135deg, #f50057 0%, #c51162 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 0; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 2rem; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .subtitle { color: #8b949e; text-align: center; margin-bottom: 1.5rem; font-size: 0.95rem; }
    .input-group { display: flex; gap: 8px; margin-bottom: 1.5rem; }
    input { flex: 1; padding: 12px 16px; background: #0d1117; border: 1px solid #30363d; border-radius: 8px; color: #e6edf3; outline: none; font-size: 0.95rem; }
    input:focus { border-color: #f50057; }
    button { padding: 12px 20px; background: #f50057; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 0.95rem; }
    button:hover { background: #c51162; }
    .todo-list { list-style: none; padding: 0; margin: 0; }
    li { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #21262d; transition: background 0.15s ease; border-radius: 6px; }
    li:hover { background: rgba(255,255,255,0.02); }
    li.completed span { text-decoration: line-through; color: #8b949e; }
    span { cursor: pointer; flex: 1; font-size: 0.95rem; }
    .btn-delete { background: transparent; color: #8b949e; border: none; font-size: 18px; cursor: pointer; padding: 0 4px; }
    .btn-delete:hover { color: #f85149; }
  \`]
})
export class AppComponent {
  todos = [
    { text: 'Understand browser-node', completed: true },
    { text: 'Try React TSX example', completed: false },
    { text: 'Add Angular CLI features', completed: false }
  ]
  addTodo(text: string) {
    if (text.trim()) this.todos.push({ text, completed: false })
  }
  toggleTodo(index: number) {
    this.todos[index].completed = !this.todos[index].completed
  }
  deleteTodo(index: number) {
    this.todos.splice(index, 1)
  }
}
`)

  writeFileToVfs('/examples/vite-angular-ts/src/app/app.module.ts',
`import { NgModule } from '@angular/core'
import { BrowserModule } from '@angular/platform-browser'
import { AppComponent } from './app.component'

@NgModule({
  imports: [BrowserModule],
  declarations: [AppComponent],
  bootstrap: [AppComponent]
})
export class AppModule {}
`)

  writeFileToVfs('/examples/README.md',
`# Examples

Each folder is a self-contained project. To run one:

\`\`\`
cd /examples/vite-react-ts && npm install && npm run dev
\`\`\`

Then open the Preview tab to see it live.

## Available examples

| Folder           | Entry point    | Dependencies                                 |
|------------------|----------------|----------------------------------------------|
| vite-react-ts/   | npm run dev    | react, react-dom, vite, typescript           |
| vite-angular-ts/ | npm run dev    | @angular/*, rxjs, zone.js, vite, typescript   |
| express/         | node index.js  | express                                      |
| fastify/         | node index.js  | fastify                                      |
| react/           | node server.js | express, react, react-dom                    |
| vue/             | node server.js | express, vue                                 |
| node-http/       | node index.js  | none (built-in only)                         |

React and Vue examples serve the framework UMD build from local node_modules.
No CDN — everything runs inside the browser virtual filesystem.
`)
}

