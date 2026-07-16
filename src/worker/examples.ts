import { writeFileToVfs, mkdirpSync } from './vfs'

import expressPkg from '../../examples/express-todo/package.json?raw'
import expressIndex from '../../examples/express-todo/index.js?raw'
import expressTest from '../../examples/express-todo/index.test.js?raw'
import expressVitest from '../../examples/express-todo/vitest.config.mjs?raw'
import expressHtml from '../../examples/express-todo/public/index.html?raw'

import fastifyPkg from '../../examples/fastify-todo/package.json?raw'
import fastifyIndex from '../../examples/fastify-todo/index.js?raw'
import fastifyTest from '../../examples/fastify-todo/index.test.js?raw'
import fastifyVitest from '../../examples/fastify-todo/vitest.config.mjs?raw'
import fastifyHtml from '../../examples/fastify-todo/public/index.html?raw'

import nodeHttpPkg from '../../examples/node-http-todo/package.json?raw'
import nodeHttpIndex from '../../examples/node-http-todo/index.js?raw'
import nodeHttpTest from '../../examples/node-http-todo/index.test.js?raw'
import nodeHttpVitest from '../../examples/node-http-todo/vitest.config.mjs?raw'
import nodeHttpHtml from '../../examples/node-http-todo/public/index.html?raw'

import reactPkg from '../../examples/react-todo/package.json?raw'
import reactViteConfig from '../../examples/react-todo/vite.config.ts?raw'
import reactVitest from '../../examples/react-todo/vitest.config.mjs?raw'
import reactTsconfig from '../../examples/react-todo/tsconfig.json?raw'
import reactHtml from '../../examples/react-todo/index.html?raw'
import reactMain from '../../examples/react-todo/src/main.tsx?raw'
import reactApp from '../../examples/react-todo/src/App.tsx?raw'
import reactTodos from '../../examples/react-todo/src/todos.js?raw'
import reactTest from '../../examples/react-todo/tests/todos.test.js?raw'

import vuePkg from '../../examples/vue-todo/package.json?raw'
import vueViteConfig from '../../examples/vue-todo/vite.config.ts?raw'
import vueVitest from '../../examples/vue-todo/vitest.config.mjs?raw'
import vueHtml from '../../examples/vue-todo/index.html?raw'
import vueMain from '../../examples/vue-todo/src/main.js?raw'
import vueApp from '../../examples/vue-todo/src/App.vue?raw'
import vueTodos from '../../examples/vue-todo/src/todos.js?raw'
import vueTest from '../../examples/vue-todo/tests/todos.test.js?raw'

import angularjsPkg from '../../examples/angularjs-todo/package.json?raw'
import angularjsServer from '../../examples/angularjs-todo/server.js?raw'
import angularjsVitest from '../../examples/angularjs-todo/vitest.config.mjs?raw'
import angularjsHtml from '../../examples/angularjs-todo/public/index.html?raw'
import angularjsApp from '../../examples/angularjs-todo/public/app.js?raw'
import angularjsTodos from '../../examples/angularjs-todo/src/todos.js?raw'
import angularjsTest from '../../examples/angularjs-todo/tests/todos.test.js?raw'

import nextjsPkg from '../../examples/nextjs-todo/package.json?raw'
import nextjsVitest from '../../examples/nextjs-todo/vitest.config.mjs?raw'
import nextjsIndex from '../../examples/nextjs-todo/pages/index.js?raw'
import nextjsApiTodos from '../../examples/nextjs-todo/pages/api/todos.js?raw'
import nextjsLibTodos from '../../examples/nextjs-todo/lib/todos.js?raw'
import nextjsTest from '../../examples/nextjs-todo/tests/todos.test.js?raw'

export function initExamples() {
  mkdirpSync('/examples')

  // ── Express Todo ──────────────────────────────────────────────────────────────────
  mkdirpSync('/examples/express-todo')
  mkdirpSync('/examples/express-todo/public')
  writeFileToVfs('/examples/express-todo/package.json', expressPkg)
  writeFileToVfs('/examples/express-todo/index.js', expressIndex)
  writeFileToVfs('/examples/express-todo/index.test.js', expressTest)
  writeFileToVfs('/examples/express-todo/vitest.config.mjs', expressVitest)
  writeFileToVfs('/examples/express-todo/public/index.html', expressHtml)

  // ── Fastify Todo ──────────────────────────────────────────────────────────────────
  mkdirpSync('/examples/fastify-todo')
  mkdirpSync('/examples/fastify-todo/public')
  writeFileToVfs('/examples/fastify-todo/package.json', fastifyPkg)
  writeFileToVfs('/examples/fastify-todo/index.js', fastifyIndex)
  writeFileToVfs('/examples/fastify-todo/index.test.js', fastifyTest)
  writeFileToVfs('/examples/fastify-todo/vitest.config.mjs', fastifyVitest)
  writeFileToVfs('/examples/fastify-todo/public/index.html', fastifyHtml)

  // ── Node HTTP Todo ────────────────────────────────────────────────────────────────
  mkdirpSync('/examples/node-http-todo')
  mkdirpSync('/examples/node-http-todo/public')
  writeFileToVfs('/examples/node-http-todo/package.json', nodeHttpPkg)
  writeFileToVfs('/examples/node-http-todo/index.js', nodeHttpIndex)
  writeFileToVfs('/examples/node-http-todo/index.test.js', nodeHttpTest)
  writeFileToVfs('/examples/node-http-todo/vitest.config.mjs', nodeHttpVitest)
  writeFileToVfs('/examples/node-http-todo/public/index.html', nodeHttpHtml)

  // ── React Todo ────────────────────────────────────────────────────────────────────
  mkdirpSync('/examples/react-todo')
  mkdirpSync('/examples/react-todo/src')
  mkdirpSync('/examples/react-todo/tests')
  writeFileToVfs('/examples/react-todo/package.json', reactPkg)
  writeFileToVfs('/examples/react-todo/vite.config.ts', reactViteConfig)
  writeFileToVfs('/examples/react-todo/vitest.config.mjs', reactVitest)
  writeFileToVfs('/examples/react-todo/tsconfig.json', reactTsconfig)
  writeFileToVfs('/examples/react-todo/index.html', reactHtml)
  writeFileToVfs('/examples/react-todo/src/main.tsx', reactMain)
  writeFileToVfs('/examples/react-todo/src/App.tsx', reactApp)
  writeFileToVfs('/examples/react-todo/src/todos.js', reactTodos)
  writeFileToVfs('/examples/react-todo/tests/todos.test.js', reactTest)

  // ── Vue Todo ──────────────────────────────────────────────────────────────────────
  mkdirpSync('/examples/vue-todo')
  mkdirpSync('/examples/vue-todo/src')
  mkdirpSync('/examples/vue-todo/tests')
  writeFileToVfs('/examples/vue-todo/package.json', vuePkg)
  writeFileToVfs('/examples/vue-todo/vite.config.ts', vueViteConfig)
  writeFileToVfs('/examples/vue-todo/vitest.config.mjs', vueVitest)
  writeFileToVfs('/examples/vue-todo/index.html', vueHtml)
  writeFileToVfs('/examples/vue-todo/src/main.js', vueMain)
  writeFileToVfs('/examples/vue-todo/src/App.vue', vueApp)
  writeFileToVfs('/examples/vue-todo/src/todos.js', vueTodos)
  writeFileToVfs('/examples/vue-todo/tests/todos.test.js', vueTest)

  // ── AngularJS Todo ────────────────────────────────────────────────────────────────
  mkdirpSync('/examples/angularjs-todo')
  mkdirpSync('/examples/angularjs-todo/public')
  mkdirpSync('/examples/angularjs-todo/src')
  mkdirpSync('/examples/angularjs-todo/tests')
  writeFileToVfs('/examples/angularjs-todo/package.json', angularjsPkg)
  writeFileToVfs('/examples/angularjs-todo/server.js', angularjsServer)
  writeFileToVfs('/examples/angularjs-todo/vitest.config.mjs', angularjsVitest)
  writeFileToVfs('/examples/angularjs-todo/public/index.html', angularjsHtml)
  writeFileToVfs('/examples/angularjs-todo/public/app.js', angularjsApp)
  writeFileToVfs('/examples/angularjs-todo/src/todos.js', angularjsTodos)
  writeFileToVfs('/examples/angularjs-todo/tests/todos.test.js', angularjsTest)

  // ── Next.js Todo ──────────────────────────────────────────────────────────────────
  mkdirpSync('/examples/nextjs-todo')
  mkdirpSync('/examples/nextjs-todo/pages')
  mkdirpSync('/examples/nextjs-todo/pages/api')
  mkdirpSync('/examples/nextjs-todo/lib')
  mkdirpSync('/examples/nextjs-todo/tests')
  writeFileToVfs('/examples/nextjs-todo/package.json', nextjsPkg)
  writeFileToVfs('/examples/nextjs-todo/vitest.config.mjs', nextjsVitest)
  writeFileToVfs('/examples/nextjs-todo/pages/index.js', nextjsIndex)
  writeFileToVfs('/examples/nextjs-todo/pages/api/todos.js', nextjsApiTodos)
  writeFileToVfs('/examples/nextjs-todo/lib/todos.js', nextjsLibTodos)
  writeFileToVfs('/examples/nextjs-todo/tests/todos.test.js', nextjsTest)

  writeFileToVfs('/examples/README.md',
`# Examples

Each folder is a self-contained project. To run one:

\`\`\`
cd /examples/express-todo && npm install && node index.js
\`\`\`

Then open the Preview tab to see it live.

## Available examples

| Folder            | Type               | Start command         | Test command |
|-------------------|--------------------|----------------------|--------------|
| express-todo/     | Express API + UI   | \`node index.js\`     | \`npm test\` |
| fastify-todo/     | Fastify API + UI   | \`node index.js\`     | \`npm test\` |
| node-http-todo/   | Node HTTP API + UI | \`node index.js\`     | \`npm test\` |
| react-todo/       | Vite + React SPA   | \`npm run dev\`       | \`npm test\` |
| vue-todo/         | Vite + Vue SPA     | \`npm run dev\`       | \`npm test\` |
| angularjs-todo/   | Express + AngularJS | \`node server.js\`   | \`npm test\` |
| nextjs-todo/      | Next.js Pages      | \`npm run dev\`       | \`npm test\` |
`)
}
