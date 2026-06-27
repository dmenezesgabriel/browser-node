/**
 * Integration tests: React, Angular, Next.js in the browser-node worker.
 *
 * Requires the Vite dev server running on port 5179 and Playwright installed.
 * Run: node tests/integration/frameworks.mjs
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'

const BASE = 'http://localhost:5179'

async function runTest(page, name, packages, code, successStr, failStr, timeoutMs = 300000) {
  console.log(`\n${'='.repeat(50)}\nTesting: ${name}\n${'='.repeat(50)}`)

  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => {
    const t = document.getElementById('terminal')
    return t && t.textContent.includes('Worker ready')
  }, { timeout: 30000 })
  console.log('Worker ready')

  console.log(`Installing: ${Object.keys(packages).join(', ')}...`)
  await page.evaluate((pkgs) => window._sendToWorker({ type: 'npm-install', packages: pkgs }), packages)
  await page.waitForFunction(() => {
    const t = document.getElementById('terminal')
    return t && (t.textContent.includes('Install complete') || t.textContent.includes('Install failed'))
  }, { timeout: 600000 })

  const termAfterInstall = await page.evaluate(() => document.getElementById('terminal')?.textContent ?? '')
  if (termAfterInstall.includes('Install failed')) {
    console.error('❌ npm install FAILED')
    return { passed: false, error: 'npm install failed' }
  }
  console.log('Install done, running code...')

  await page.evaluate((c) => { document.getElementById('editor').value = c }, code)
  await page.click('#btn-run')

  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const term = await page.evaluate(() => document.getElementById('terminal')?.textContent ?? '')
    if (term.includes(successStr)) return { passed: true }
    if (failStr && term.includes(failStr)) {
      const lines = term.split('\n')
      const errLine = lines.find(l => l.includes(failStr) || l.includes('[error]'))
      return { passed: false, error: errLine?.trim() }
    }
    if (Date.now() - start > 10000) {
      const errLine = term.split('\n').find(l => l.includes('[error]'))
      if (errLine) return { passed: false, error: errLine.trim() }
    }
    await new Promise(r => setTimeout(r, 1000))
  }

  const term = await page.evaluate(() => document.getElementById('terminal')?.textContent ?? '')
  const tail = term.split('\n').slice(-15).join('\n')
  return { passed: false, error: `timeout — last output:\n${tail}` }
}

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const ctx = await browser.newContext()
const page = await ctx.newPage()
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 100)))

// ── React (SSR) ────────────────────────────────────────────────────────────
const REACT_CODE = `
const http = require('http')
const React = require('react')
const ReactDOMServer = require('react-dom/server')
const App = () => React.createElement('div', null, React.createElement('h1', null, 'Hello React!'))
const html = ReactDOMServer.renderToString(React.createElement(App))
http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end('<html><body>' + html + '</body></html>')
}).listen(3000, () => console.log('React server running on http://localhost:3000'))
`.trim()

// ── Angular ────────────────────────────────────────────────────────────────
const ANGULAR_CODE = `
const http = require('http')
async function main() {
  const core = require('@angular/core')
  console.log('Angular core loaded, version:', core.VERSION.full)
  const { BehaviorSubject } = require('rxjs')
  const state = new BehaviorSubject({ status: 'ok' })
  let received = null
  state.subscribe(v => { received = v })
  state.next({ status: 'ready' })
  if (!received || received.status !== 'ready') throw new Error('BehaviorSubject not working')
  console.log('RxJS working, last value:', received.status)
  const compiler = require('@angular/compiler')
  console.log('Angular compiler loaded:', typeof compiler.parseTemplate)
  http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ framework: 'Angular', version: core.VERSION.full, rxjs: 'ok' }))
  }).listen(3000, () => console.log('Angular server running on http://localhost:3000'))
}
main().catch(e => console.error('Angular failed:', e.stack || e.message || e))
`.trim()

// ── Next.js ────────────────────────────────────────────────────────────────
// Pre-create stub build artifacts that Next.js expects from its bundler.
const NEXT_CODE = `
const fs = require('fs')
const path = require('path')
fs.mkdirSync('/next-app/app', { recursive: true })
fs.mkdirSync('/next-app/public', { recursive: true })
fs.writeFileSync('/next-app/package.json', JSON.stringify({
  name: 'next-app', version: '1.0.0', private: true,
  dependencies: { next: 'latest', react: 'latest', 'react-dom': 'latest' }
}))
fs.writeFileSync('/next-app/next.config.js', 'module.exports = {}')
fs.writeFileSync('/next-app/app/page.js', \`
export default function Home() { return <div><h1>Hello Next.js!</h1></div> }
\`)
fs.writeFileSync('/next-app/app/layout.js', \`
export default function RootLayout({ children }) {
  return (<html><body>{children}</body></html>)
}
\`)
;['dev/server', 'static/development', 'server'].forEach(d =>
  fs.mkdirSync('/next-app/.next/' + d, { recursive: true })
)
const emptyMod = '"use strict"; module.exports = {}'
;['dev/server/instrumentation.js', 'dev/server/middleware.js'].forEach(f =>
  fs.writeFileSync('/next-app/.next/' + f, emptyMod)
)
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
`.trim()

const results = {}

results.react = await runTest(
  page, 'React',
  { react: 'latest', 'react-dom': 'latest' },
  REACT_CODE,
  'React server running',
  null,
  60000
)

results.angular = await runTest(
  page, 'Angular',
  { '@angular/core': 'latest', '@angular/common': 'latest', '@angular/compiler': 'latest', 'rxjs': 'latest', 'zone.js': 'latest' },
  ANGULAR_CODE,
  'Angular server running',
  'Angular failed:',
  120000
)

results.nextjs = await runTest(
  page, 'Next.js',
  { next: 'latest', react: 'latest', 'react-dom': 'latest' },
  NEXT_CODE,
  'Next.js server running',
  'Next.js failed:',
  300000
)

await browser.close()

console.log('\n' + '='.repeat(50))
console.log('RESULTS')
console.log('='.repeat(50))
let allPassed = true
for (const [name, result] of Object.entries(results)) {
  const status = result.passed ? '✅ PASSED' : '❌ FAILED'
  console.log(`${status} — ${name}${result.error ? ': ' + result.error : ''}`)
  if (!result.passed) allPassed = false
}
process.exit(allPassed ? 0 : 1)
