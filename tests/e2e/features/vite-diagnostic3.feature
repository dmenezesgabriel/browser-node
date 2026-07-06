Feature: Vite diagnostic 3
  Background:
    Given the browser-node environment is ready

  Scenario: Vite createServer only
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      const fs = require('fs')
      fs.mkdirSync('/vite-app3/src', { recursive: true })
      fs.writeFileSync('/vite-app3/index.html',
        '<html><body><div id="app"></div><script type="module" src="/src/main.js"></script></body></html>')
      fs.writeFileSync('/vite-app3/src/main.js',
        'document.getElementById("app").textContent = "Hello Vite!"')
      const { createServer } = require('vite')
      async function main() {
        console.log('before createServer')
        await createServer({ root: '/vite-app3', server: { port: 3030 } })
        console.log('after createServer (no listen)')
      }
      main().catch(e => console.error('Vite failed:', e.stack || e.message))
      """
    Then the terminal should contain "after createServer"

  Scenario: Vite listen only (with config.server.port)
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      const fs = require('fs')
      fs.mkdirSync('/vite-app4/src', { recursive: true })
      fs.writeFileSync('/vite-app4/index.html',
        '<html><body><div id="app"></div><script type="module" src="/src/main.js"></script></body></html>')
      fs.writeFileSync('/vite-app4/src/main.js',
        'document.getElementById("app").textContent = "Hello Vite!"')
      const { createServer } = require('vite')
      async function main() {
        console.log('before createServer')
        const server = await createServer({ root: '/vite-app4', server: { port: 3040 } })
        console.log('after createServer')
        server.listen().then(() => { console.log('listen resolved') }).catch(e => console.error('listen error:', e.message))
        console.log('listen called')
      }
      main().catch(e => console.error('Vite failed:', e.stack || e.message))
      """
    Then the terminal should contain "listen called"
