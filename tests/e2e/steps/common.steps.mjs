import { Given, When, Then } from '@cucumber/cucumber'

// ── Shared state ─────────────────────────────────────────────────────────────
// `this` is the BrowserNodeWorld instance.

Given('the browser-node environment is ready', { timeout: 30000 }, async function () {
  // openPage() is called in Before hook; this step just asserts worker is ready.
  const term = await this.getTerminal()
  if (!term.includes('Worker ready')) {
    throw new Error('Worker not ready — terminal: ' + term.slice(-200))
  }
})

When('I install the package(s) {string}', { timeout: 600000 }, async function (pkgList) {
  const packages = {}
  for (const entry of pkgList.split(',').map(s => s.trim())) {
    const [name, version = 'latest'] = entry.split('@').filter(Boolean).reduce((acc, part, i, arr) => {
      if (i === 0 && entry.startsWith('@')) return acc
      if (i === arr.length - 1 && /^\d/.test(part)) { acc[0] = acc[0]; acc[1] = part; return acc }
      acc[0] = (acc[0] ? acc[0] + '@' + part : (entry.startsWith('@') ? '@' + part : part))
      return acc
    }, ['', ''])
    packages[name || entry] = version || 'latest'
  }
  await this.installPackages(packages)
})

When('I install the following packages:', { timeout: 600000 }, async function (dataTable) {
  const packages = {}
  for (const row of dataTable.hashes()) {
    packages[row.package] = row.version ?? 'latest'
  }
  await this.installPackages(packages)
})

When('I run the following code:', { timeout: 30000 }, async function (code) {
  await this.runCode(code)
})

Then('the terminal should contain {string}', { timeout: 120000 }, async function (text) {
  await this.waitForTerminal(text, 120000)
})

Then('the terminal should show a runtime error', { timeout: 15000 }, async function () {
  await this.waitForTerminalAny(['[error]', 'Error:', 'failed:'], 15000)
})

Then('the terminal should NOT contain {string}', async function (text) {
  const term = await this.getTerminal()
  if (term.includes(text)) {
    throw new Error(`Terminal unexpectedly contains "${text}". Terminal: ${term.slice(-300)}`)
  }
})
