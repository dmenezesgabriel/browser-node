import { setWorldConstructor, World } from '@cucumber/cucumber'
import { chromium } from '/home/gabriel-menezes/.nvm/versions/node/v24.15.0/lib/node_modules/@playwright/cli/node_modules/playwright/index.mjs'

const BASE = 'http://localhost:5179'

// Module-level browser instance shared across all scenarios in a run.
let browser = null

export function getBrowser() { return browser }
export async function launchBrowser() {
  browser = await chromium.launch({ args: ['--no-sandbox'] })
}
export async function closeBrowser() {
  await browser?.close()
  browser = null
}

class BrowserNodeWorld extends World {
  constructor(options) {
    super(options)
    this.page = null
    this._ctx = null
    this._cmdSeq = 0
  }

  async openPage() {
    this._ctx = await browser.newContext()
    this.page = await this._ctx.newPage()
    this.page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 120)))
    this.page.on('console', msg => console.log('[pageconsole]', msg.text()))
    await this.page.goto(BASE, { waitUntil: 'networkidle' })
    await this.page.waitForFunction(
      () => { const t = document.getElementById('terminal'); return t && t.textContent.includes('Worker ready') },
      { timeout: 30000 }
    )
  }

  async closePage() {
    await this._ctx?.close()
    this.page = null
    this._ctx = null
  }

  async sendToWorker(msg) {
    await this.page.evaluate((m) => window._sendToWorker(m), msg)
  }

  async getTerminal() {
    return this.page.evaluate(() => document.getElementById('terminal')?.textContent ?? '')
  }

  async waitForTerminal(text, timeoutMs = 60000) {
    await this.page.waitForFunction(
      (t) => { const el = document.getElementById('terminal'); return el && el.textContent.includes(t) },
      text,
      { timeout: timeoutMs }
    )
  }

  async waitForTerminalAny(texts, timeoutMs = 60000) {
    await this.page.waitForFunction(
      (ts) => { const el = document.getElementById('terminal'); return el && ts.some(t => el.textContent.includes(t)) },
      texts,
      { timeout: timeoutMs }
    )
  }

  async runCode(code) {
    // Send code directly to the worker (editor is now CodeMirror, not a textarea)
    await this.sendToWorker({ type: 'run', code, filename: '/app/index.js' })
  }

  async createFile(path, content) {
    await this.sendToWorker({ type: 'write-file', path, content })
    await this.page.waitForTimeout(300)
  }

  async runTerminalCmd(cmd, timeoutMs = 15000) {
    this._cmdSeq++
    await this.page.locator('#terminal-panel').click()
    await this.page.keyboard.type(cmd)
    await this.page.keyboard.press('Enter')
    await this.waitForTerminal(`[cmd:${this._cmdSeq}:exit`, timeoutMs)
    const term = await this.getTerminal()
    const match = term.match(new RegExp(`\\[cmd:${this._cmdSeq}:exit(\\d+)\\]`))
    return match ? parseInt(match[1]) : -1
  }

  async installPackages(packages) {
    await this.sendToWorker({ type: 'npm-install', packages })
    await this.waitForTerminalAny(['Install complete', 'Install failed'], 600000)
    const term = await this.getTerminal()
    if (term.includes('Install failed')) {
      throw new Error('npm install failed: ' + term.split('\n').find(l => l.includes('failed') || l.includes('[error]'))?.trim())
    }
  }
}

setWorldConstructor(BrowserNodeWorld)
