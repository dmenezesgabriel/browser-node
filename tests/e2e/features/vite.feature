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

  Scenario: Vite transforms a JavaScript module
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      const fs = require('fs')
      fs.mkdirSync('/vite-app2/src', { recursive: true })
      fs.writeFileSync('/vite-app2/index.html',
        '<html><body><script type="module" src="/src/app.js"></script></body></html>')
      fs.writeFileSync('/vite-app2/src/app.js',
        'export const greeting = "Hello World"\nconsole.log(greeting)')
      const { createServer } = require('vite')
      async function main() {
        const server = await createServer({ root: '/vite-app2', server: { port: 3001 } })
        await server.listen()
        // Pass absolute VFS path — Vite 8's OXC resolver requires it for in-memory VFS
        const result = await server.transformRequest('/vite-app2/src/app.js')
        if (!result || !result.code || result.code.length === 0) {
          throw new Error('Transform returned empty result')
        }
        console.log('Transform code length:', result.code.length)
        console.log('Vite JS transform works')
      }
      main().catch(e => console.error('Vite failed:', e.stack || e.message))
      """
    Then the terminal should contain "Vite JS transform works"

  Scenario: Vite transforms a TypeScript file
    When I install the following packages:
      | package    | version |
      | vite       | latest  |
      | typescript | latest  |
    And I run the following code:
      """
      const fs = require('fs')
      fs.mkdirSync('/vite-ts/src', { recursive: true })
      fs.writeFileSync('/vite-ts/index.html',
        '<html><body><script type="module" src="/src/main.ts"></script></body></html>')
      fs.writeFileSync('/vite-ts/src/main.ts',
        'const msg: string = "Hello TypeScript"\nconsole.log(msg)\nexport default msg')
      const { createServer } = require('vite')
      async function main() {
        const server = await createServer({ root: '/vite-ts', server: { port: 3002 } })
        await server.listen()
        // Absolute VFS path — required by Vite 8's OXC resolver for in-memory VFS
        const result = await server.transformRequest('/vite-ts/src/main.ts')
        if (!result || !result.code) throw new Error('No code in transform result')
        const hasString = result.code.includes('Hello TypeScript')
        console.log('TS type annotation stripped:', !result.code.includes(': string'))
        console.log('String literal preserved:', hasString)
        if (!hasString) throw new Error('Expected string literal in output')
        console.log('Vite TypeScript transform works')
      }
      main().catch(e => console.error('Vite failed:', e.stack || e.message))
      """
    Then the terminal should contain "Vite TypeScript transform works"


  Scenario: Two Vite servers run on separate ports simultaneously
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      const fs = require('fs')
      ;['/vite-s1', '/vite-s2'].forEach((dir, i) => {
        fs.mkdirSync(dir + '/src', { recursive: true })
        fs.writeFileSync(dir + '/index.html',
          `<html><body><script type="module" src="/src/app.js"></script></body></html>`)
        fs.writeFileSync(dir + '/src/app.js', `console.log('server ${i + 1}')`)
      })
      const { createServer } = require('vite')
      async function main() {
        const s1 = await createServer({ root: '/vite-s1', server: { port: 3010 } })
        const s2 = await createServer({ root: '/vite-s2', server: { port: 3011 } })
        await Promise.all([s1.listen(), s2.listen()])
        console.log('Vite server 1 running on port 3010')
        console.log('Vite server 2 running on port 3011')
        console.log('Both Vite servers running')
      }
      main().catch(e => console.error('Vite failed:', e.stack || e.message))
      """
    Then the terminal should contain "Both Vite servers running"
