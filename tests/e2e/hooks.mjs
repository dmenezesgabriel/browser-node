import { BeforeAll, AfterAll, Before, After } from '@cucumber/cucumber'
import { launchBrowser, closeBrowser } from './world.mjs'

BeforeAll({ timeout: 30000 }, async () => {
  await launchBrowser()
})

AfterAll(async () => {
  await closeBrowser()
})

Before({ timeout: 90000 }, async function () {
  await this.openPage()
})

After(async function () {
  await this.closePage()
})
