Feature: Vite trace two scenarios
  Background:
    Given the browser-node environment is ready

  Scenario: A: require in try-catch, createServer in separate try-catch (PASS)
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      const fs = require('fs')
      fs.mkdirSync('/vite-app/src', { recursive: true })
      fs.writeFileSync('/vite-app/index.html', '<html></html>')
      fs.writeFileSync('/vite-app/src/main.js', 'console.log("hi")')
      let vite
      try {
        vite = require('vite')
        console.log('s1: vite required')
      } catch(e) { console.error('s1-err:', e.message) }
      try {
        const server = await vite.createServer({ root: '/vite-app', server: { port: 3030 } })
        console.log('s2: server created')
      } catch(e) { console.error('s2-err:', e.message) }
      console.log('s3')
      """
    Then the terminal should contain "s3"

  Scenario: B: require at top (no try-catch), createServer with try-catch (FAIL)
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      const fs = require('fs')
      fs.mkdirSync('/vite-app/src', { recursive: true })
      fs.writeFileSync('/vite-app/index.html', '<html></html>')
      fs.writeFileSync('/vite-app/src/main.js', 'console.log("hi")')
      const vite = require('vite')
      console.log('s1: vite required')
      try {
        const server = await vite.createServer({ root: '/vite-app', server: { port: 3030 } })
        console.log('after createServer')
      } catch(e) { console.error('err:', e.message) }
      """
    Then the terminal should contain "after createServer"
