Feature: Vite dev server inside browser-node
  As a developer using browser-node
  I want to run a Vite dev server
  So that I can serve and transform frontend projects from inside the browser

  Background:
    Given the browser-node environment is ready

  Scenario: Vite dev server starts and announces its URL
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      const fs = require('fs')
      fs.mkdirSync('/vite-app/src', { recursive: true })
      fs.writeFileSync('/vite-app/index.html',
        '<!DOCTYPE html><html><body><div id="app"></div>' +
        '<script type="module" src="/src/main.js"></script></body></html>')
      fs.writeFileSync('/vite-app/src/main.js',
        'document.getElementById("app").textContent = "Hello Vite!"')
      const { createServer } = require('vite')
      async function main() {
        const server = await createServer({ root: '/vite-app', server: { port: 3000 } })
        await server.listen()
        console.log('Vite dev server running on http://localhost:3000')
      }
      main().catch(e => console.error('Vite failed:', e.stack || e.message))
      """
    Then the terminal should contain "Vite dev server running"
