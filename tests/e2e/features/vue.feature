Feature: Vue.js server-side rendering
  As a developer using browser-node
  I want to use Vue.js with SSR
  So that I can render Vue components to HTML strings

  Background:
    Given the browser-node environment is ready

  Scenario: Vue renders a component with createSSRApp
    When I install the following packages:
      | package               | version |
      | vue                   | latest  |
      | @vue/server-renderer  | latest  |
    And I run the following code:
      """
      const { createSSRApp } = require('vue')
      const { renderToString } = require('@vue/server-renderer')
      const http = require('http')
      async function main() {
        const app = createSSRApp({
          data: () => ({ message: 'Hello Vue!' }),
          template: '<div>{{ message }}</div>'
        })
        const html = await renderToString(app)
        console.log('Vue rendered HTML length:', html.length)
        http.createServer((req, res) => {
          res.writeHead(200, { 'content-type': 'text/html' })
          res.end('<html><body>' + html + '</body></html>')
        }).listen(3000, () => console.log('Vue server running on http://localhost:3000'))
      }
      main().catch(e => console.error('Vue failed:', e.stack || e.message || e))
      """
    Then the terminal should contain "Vue server running"

  Scenario: Vue component with props renders correctly
    When I install the following packages:
      | package               | version |
      | vue                   | latest  |
      | @vue/server-renderer  | latest  |
    And I run the following code:
      """
      const { createSSRApp, h } = require('vue')
      const { renderToString } = require('@vue/server-renderer')
      async function main() {
        const Greeting = {
          props: ['name'],
          render() { return h('h1', 'Hello, ' + this.name + '!') }
        }
        const app = createSSRApp(Greeting, { name: 'World' })
        const html = await renderToString(app)
        const ok = html.includes('Hello, World!')
        console.log('Vue props render:', ok ? 'ok' : 'failed — ' + html)
        if (!ok) throw new Error('Missing greeting in HTML')
        console.log('Vue props test passed')
      }
      main().catch(e => console.error('Vue failed:', e.stack || e.message || e))
      """
    Then the terminal should contain "Vue props test passed"

  Scenario: Vue reactive data updates propagate
    When I install the following packages:
      | package               | version |
      | vue                   | latest  |
      | @vue/server-renderer  | latest  |
    And I run the following code:
      """
      const { ref, computed } = require('vue')
      const count = ref(0)
      const double = computed(() => count.value * 2)
      count.value = 5
      console.log('Vue ref:', count.value)
      console.log('Vue computed:', double.value)
      if (double.value !== 10) throw new Error('computed wrong: ' + double.value)
      console.log('Vue reactivity working correctly')
      """
    Then the terminal should contain "Vue reactivity working correctly"

  Scenario: Vue missing module causes an error
    When I install the following packages:
      | package               | version |
      | vue                   | latest  |
      | @vue/server-renderer  | latest  |
    And I run the following code:
      """
      const { createSSRApp } = require('vue')
      const missing = require('@vue/nonexistent-plugin')
      """
    Then the terminal should show a runtime error
    And the terminal should NOT contain "Vue server running"
