Feature: Vite try-catch vs no-try-catch diagnostic
  Background:
    Given the browser-node environment is ready

  Scenario: 1: require in try-catch, createServer in separate try-catch (KNOWN PASS)
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

  Scenario: 2: require at top, createServer with try-catch
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
      try {
        const server = await vite.createServer({ root: '/vite-app', server: { port: 3030 } })
        console.log('after createServer')
      } catch(e) { console.error('err:', e.message) }
      """
    Then the terminal should contain "after createServer"

  Scenario: 3: require in try-catch, createServer at top
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
      const server = await vite.createServer({ root: '/vite-app', server: { port: 3030 } })
      console.log('s2')
      """
    Then the terminal should contain "s2"

  Scenario: 4: require at top, createServer at top (no try-catch anywhere)
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
      const server = await vite.createServer({ root: '/vite-app', server: { port: 3030 } })
      console.log('after createServer')
      """
    Then the terminal should contain "after createServer"

  Scenario: 5: var at top (no try-catch), createServer with try-catch
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      var fs = require('fs')
      fs.mkdirSync('/vite-app/src', { recursive: true })
      fs.writeFileSync('/vite-app/index.html', '<html></html>')
      fs.writeFileSync('/vite-app/src/main.js', 'console.log("hi")')
      var vite = require('vite')
      try {
        var server = await vite.createServer({ root: '/vite-app', server: { port: 3030 } })
        console.log('after createServer')
      } catch(e) { console.error('err:', e.message) }
      """
    Then the terminal should contain "after createServer"

  Scenario: 6: let at top (no try-catch), createServer with try-catch
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      const fs = require('fs')
      fs.mkdirSync('/vite-app/src', { recursive: true })
      fs.writeFileSync('/vite-app/index.html', '<html></html>')
      fs.writeFileSync('/vite-app/src/main.js', 'console.log("hi")')
      let vite = require('vite')
      try {
        const server = await vite.createServer({ root: '/vite-app', server: { port: 3030 } })
        console.log('after createServer')
      } catch(e) { console.error('err:', e.message) }
      """
    Then the terminal should contain "after createServer"

  Scenario: 7: const at top (no try-catch), createServer with try-catch (KNOWN FAIL)
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
      try {
        const server = await vite.createServer({ root: '/vite-app', server: { port: 3030 } })
        console.log('after createServer')
      } catch(e) { console.error('err:', e.message) }
      """
    Then the terminal should contain "after createServer"
