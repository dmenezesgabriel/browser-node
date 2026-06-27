import { When, Then, Given } from '@cucumber/cucumber'

When('I run terminal command {string}', { timeout: 15000 }, async function (cmd) {
  this._lastExitCode = await this.runTerminalCmd(cmd)
})

When('I create file {string} with content {string}', async function (path, content) {
  await this.createFile(path, content.replace(/\\n/g, '\n'))
})

Then('the terminal exit code should be {int}', async function (expected) {
  if (this._lastExitCode !== expected) {
    throw new Error(`Expected exit code ${expected} but got ${this._lastExitCode}`)
  }
})

When('I click {string}', async function (selector) {
  await this.page.locator(selector).click()
  await this.page.waitForTimeout(300)
})

When('I accept the new file dialog with path {string}', async function (path) {
  this.page.on('dialog', async (dialog) => {
    await dialog.accept(path)
  })
  await this.page.locator('#btn-new-file').click()
  await this.page.waitForTimeout(500)
})
