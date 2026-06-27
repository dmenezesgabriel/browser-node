Feature: Next.js development server
  As a developer using browser-node
  I want to start a Next.js dev server
  So that I can build React applications with Next.js in the browser

  Background:
    Given the browser-node environment is ready

  Scenario: Next.js dev server starts and announces its URL
    When I install the following packages:
      | package    | version |
      | next       | latest  |
      | react      | latest  |
      | react-dom  | latest  |
    And I run the following code:
      """
      const fs = require('fs')
      fs.mkdirSync('/next-app/app', { recursive: true })
      fs.mkdirSync('/next-app/public', { recursive: true })
      fs.writeFileSync('/next-app/package.json', JSON.stringify({
        name: 'next-app', version: '1.0.0', private: true,
        dependencies: { next: 'latest', react: 'latest', 'react-dom': 'latest' }
      }))
      fs.writeFileSync('/next-app/next.config.js', 'module.exports = {}')
      fs.writeFileSync('/next-app/app/page.js',
        'export default function Home() { return <div><h1>Hello Next.js!</h1></div> }')
      fs.writeFileSync('/next-app/app/layout.js',
        'export default function RootLayout({ children }) { return (<html><body>{children}</body></html>) }')
      ;['dev/server', 'static/development', 'server'].forEach(d =>
        fs.mkdirSync('/next-app/.next/' + d, { recursive: true }))
      const emptyMod = '"use strict"; module.exports = {}'
      ;['dev/server/instrumentation.js', 'dev/server/middleware.js'].forEach(f =>
        fs.writeFileSync('/next-app/.next/' + f, emptyMod))
      console.log('Next.js app structure created')
      process.env.NEXT_TELEMETRY_DISABLED = '1'
      const next = require('next')
      const app = next({ dev: true, dir: '/next-app', port: 3000 })
      const handle = app.getRequestHandler()
      async function main() {
        console.log('Preparing Next.js...')
        await app.prepare()
        const http = require('http')
        http.createServer((req, res) => handle(req, res)).listen(3000, () => {
          console.log('Next.js server running on http://localhost:3000')
        })
      }
      main().catch(e => console.error('Next.js failed:', e.stack || e.message || e))
      """
    Then the terminal should contain "Next.js server running"

  Scenario: Next.js prepare step logs progress
    When I install the following packages:
      | package    | version |
      | next       | latest  |
      | react      | latest  |
      | react-dom  | latest  |
    And I run the following code:
      """
      const fs = require('fs')
      fs.mkdirSync('/next-app2/app', { recursive: true })
      fs.writeFileSync('/next-app2/next.config.js', 'module.exports = {}')
      fs.writeFileSync('/next-app2/package.json', JSON.stringify({ name: 'next-app2', version: '1.0.0' }))
      ;['dev/server', 'static/development', 'server'].forEach(d =>
        fs.mkdirSync('/next-app2/.next/' + d, { recursive: true }))
      ;['dev/server/instrumentation.js', 'dev/server/middleware.js'].forEach(f =>
        fs.writeFileSync('/next-app2/.next/' + f, '"use strict"; module.exports = {}'))
      process.env.NEXT_TELEMETRY_DISABLED = '1'
      const next = require('next')
      const app = next({ dev: true, dir: '/next-app2', port: 3001 })
      async function main() {
        console.log('Preparing Next.js (second run)...')
        await app.prepare()
        const http = require('http')
        http.createServer((req, res) => app.getRequestHandler()(req, res)).listen(3001, () => {
          console.log('Next.js second instance running')
        })
      }
      main().catch(e => console.error('Next.js failed:', e.stack || e.message || e))
      """
    Then the terminal should contain "Next.js second instance running"
