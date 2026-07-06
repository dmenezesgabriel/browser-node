Feature: Vite diagnostic 2
  Background:
    Given the browser-node environment is ready

  Scenario: Vite createServer exact match of passing test
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      var fs = require('fs')
      fs.mkdirSync('/vite-app/src', { recursive: true })
      fs.writeFileSync('/vite-app/index.html', '<html></html>')
      fs.writeFileSync('/vite-app/src/main.js', 'console.log("hi")')
      var createServer
      try {
        var vite = require('vite')
        console.log('s1: vite required')
        createServer = vite.createServer
      } catch(e) {
        console.error('s1-err:', e.message)
      }
      try {
        var server = await createServer({ root: '/vite-app', logLevel: 'silent', server: { port: 5199, host: '0.0.0.0' } })
        console.log('s2: server created')
      } catch(e) {
        console.error('s2-err:', e.message)
      }
      console.log('s3')
      """
    Then the terminal should contain "s3"

  Scenario: Vite createServer same but different port
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      var fs = require('fs')
      fs.mkdirSync('/vite-app/src', { recursive: true })
      fs.writeFileSync('/vite-app/index.html', '<html></html>')
      fs.writeFileSync('/vite-app/src/main.js', 'console.log("hi")')
      var createServer
      try {
        var vite = require('vite')
        console.log('s1: vite required')
        createServer = vite.createServer
      } catch(e) {
        console.error('s1-err:', e.message)
      }
      try {
        var server = await createServer({ root: '/vite-app', logLevel: 'silent', server: { port: 3000 } })
        console.log('s2: server created')
      } catch(e) {
        console.error('s2-err:', e.message)
      }
      console.log('s3')
      """
    Then the terminal should contain "s3"

  Scenario: Vite createServer no host
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      var fs = require('fs')
      fs.mkdirSync('/vite-app/src', { recursive: true })
      fs.writeFileSync('/vite-app/index.html', '<html></html>')
      fs.writeFileSync('/vite-app/src/main.js', 'console.log("hi")')
      var createServer
      try {
        var vite = require('vite')
        console.log('s1: vite required')
        createServer = vite.createServer
      } catch(e) {
        console.error('s1-err:', e.message)
      }
      try {
        var server = await createServer({ root: '/vite-app', logLevel: 'silent', server: { port: 5199 } })
        console.log('s2: server created')
      } catch(e) {
        console.error('s2-err:', e.message)
      }
      console.log('s3')
      """
    Then the terminal should contain "s3"

  Scenario: Vite createServer default host
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      var fs = require('fs')
      fs.mkdirSync('/vite-app/src', { recursive: true })
      fs.writeFileSync('/vite-app/index.html', '<html></html>')
      fs.writeFileSync('/vite-app/src/main.js', 'console.log("hi")')
      var createServer
      try {
        var vite = require('vite')
        console.log('s1: vite required')
        createServer = vite.createServer
      } catch(e) {
        console.error('s1-err:', e.message)
      }
      try {
        var server = await createServer({ root: '/vite-app', logLevel: 'silent', server: { host: '0.0.0.0', port: 3000 } })
        console.log('s2: server created')
      } catch(e) {
        console.error('s2-err:', e.message)
      }
      console.log('s3')
      """
    Then the terminal should contain "s3"

  Scenario: Vite createServer same but port 3000, host 0.0.0.0
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      var fs = require('fs')
      fs.mkdirSync('/vite-app/src', { recursive: true })
      fs.writeFileSync('/vite-app/index.html', '<html></html>')
      fs.writeFileSync('/vite-app/src/main.js', 'console.log("hi")')
      var createServer
      try {
        var vite = require('vite')
        console.log('s1: vite required')
        createServer = vite.createServer
      } catch(e) {
        console.error('s1-err:', e.message)
      }
      try {
        var server = await createServer({ root: '/vite-app', logLevel: 'silent', server: { host: '0.0.0.0', port: 5199 } })
        console.log('s2: server created')
      } catch(e) {
        console.error('s2-err:', e.message)
      }
      console.log('s3')
      """
    Then the terminal should contain "s3"

  Scenario: Vite createServer logLevel info, host 0.0.0.0
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      var fs = require('fs')
      fs.mkdirSync('/vite-app/src', { recursive: true })
      fs.writeFileSync('/vite-app/index.html', '<html></html>')
      fs.writeFileSync('/vite-app/src/main.js', 'console.log("hi")')
      var createServer
      try {
        var vite = require('vite')
        console.log('s1: vite required')
        createServer = vite.createServer
      } catch(e) {
        console.error('s1-err:', e.message)
      }
      try {
        var server = await createServer({ root: '/vite-app', server: { host: '0.0.0.0', port: 5199 } })
        console.log('s2: server created')
      } catch(e) {
        console.error('s2-err:', e.message)
      }
      console.log('s3')
      """
    Then the terminal should contain "s3"

  Scenario: Vite createServer original diag3 style with const+main
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      const fs = require('fs')
      fs.mkdirSync('/vite-app/src', { recursive: true })
      fs.writeFileSync('/vite-app/index.html', '<html></html>')
      fs.writeFileSync('/vite-app/src/main.js', 'console.log("hi")')
      const { createServer } = require('vite')
      async function main() {
        console.log('before createServer')
        const server = await createServer({ root: '/vite-app', server: { port: 3030 } })
        console.log('after createServer (no listen)')
      }
      main().catch(e => console.error('Vite failed:', e.stack || e.message))
      """
    Then the terminal should contain "after createServer"

  Scenario: Vite createServer same with port in createServer options
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      const fs = require('fs')
      fs.mkdirSync('/vite-app/src', { recursive: true })
      fs.writeFileSync('/vite-app/index.html', '<html></html>')
      fs.writeFileSync('/vite-app/src/main.js', 'console.log("hi")')
      const { createServer } = require('vite')
      async function main() {
        console.log('before createServer')
        console.log('testA')
        const server = await createServer({ root: '/vite-app', server: { host: '0.0.0.0', port: 5199 } })
        console.log('testB')
        console.log('after createServer (no listen)')
      }
      main().catch(e => console.error('Vite failed:', e.stack || e.message))
      """
    Then the terminal should contain "after createServer"

  Scenario: Vite const destructure but top-level await (no main function)
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      const fs = require('fs')
      fs.mkdirSync('/vite-app/src', { recursive: true })
      fs.writeFileSync('/vite-app/index.html', '<html></html>')
      fs.writeFileSync('/vite-app/src/main.js', 'console.log("hi")')
      const { createServer } = require('vite');
      (async () => {
        try {
          const server = await createServer({ root: '/vite-app', server: { host: '0.0.0.0', port: 5199 } })
          console.log('after createServer')
        } catch(e) {
          console.error('err:', e.message)
        }
      })()
      """
    Then the terminal should contain "after createServer"

  Scenario: Vite no destructure, const+await at top level
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      const fs = require('fs')
      fs.mkdirSync('/vite-app/src', { recursive: true })
      fs.writeFileSync('/vite-app/index.html', '<html></html>')
      fs.writeFileSync('/vite-app/src/main.js', 'console.log("hi")')
      const vite = require('vite');
      const createServer = vite.createServer;
      const server = await createServer({ root: '/vite-app', server: { host: '0.0.0.0', port: 5199 } })
      console.log('after createServer')
      """
    Then the terminal should contain "after createServer"

  Scenario: Vite var but with destructure at top+try-catch no main
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      var fs = require('fs')
      fs.mkdirSync('/vite-app/src', { recursive: true })
      fs.writeFileSync('/vite-app/index.html', '<html></html>')
      fs.writeFileSync('/vite-app/src/main.js', 'console.log("hi")')
      var createServer
      try {
        var { createServer: cs } = require('vite')
        console.log('s1: vite required')
        createServer = cs
      } catch(e) {
        console.error('s1-err:', e.message)
      }
      try {
        var server = await createServer({ root: '/vite-app', server: { port: 3030 } })
        console.log('s2: server created')
      } catch(e) {
        console.error('s2-err:', e.message)
      }
      console.log('s3')
      """
    Then the terminal should contain "s3"

  Scenario: Vite const+main+await at top level (no destructure)
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
      async function main() {
        console.log('before createServer')
        const server = await vite.createServer({ root: '/vite-app', server: { port: 3030 } })
        console.log('after createServer')
      }
      main().catch(e => console.error('Vite failed:', e.stack || e.message))
      """
    Then the terminal should contain "after createServer"

  Scenario: Vite const+main WITH await main() (no destructure)
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
      async function main() {
        console.log('before createServer')
        const server = await vite.createServer({ root: '/vite-app', server: { port: 3030 } })
        console.log('after createServer')
      }
      await main()
      """
    Then the terminal should contain "after createServer"

  Scenario: Vite const+main with destructure, WITH await main()
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      const fs = require('fs')
      fs.mkdirSync('/vite-app/src', { recursive: true })
      fs.writeFileSync('/vite-app/index.html', '<html></html>')
      fs.writeFileSync('/vite-app/src/main.js', 'console.log("hi")')
      const { createServer } = require('vite')
      async function main() {
        console.log('before createServer')
        const server = await createServer({ root: '/vite-app', server: { port: 3030 } })
        console.log('after createServer')
      }
      await main()
      """
    Then the terminal should contain "after createServer"

  Scenario: Vite const+main with destructure, with .catch() but ALSO await
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      const fs = require('fs')
      fs.mkdirSync('/vite-app/src', { recursive: true })
      fs.writeFileSync('/vite-app/index.html', '<html></html>')
      fs.writeFileSync('/vite-app/src/main.js', 'console.log("hi")')
      const { createServer } = require('vite')
      async function main() {
        console.log('before createServer')
        const server = await createServer({ root: '/vite-app', server: { port: 3030 } })
        console.log('after createServer')
      }
      await main().catch(e => console.error('Vite failed:', e.stack || e.message))
      """
    Then the terminal should contain "after createServer"

  Scenario: Vite var+try-catch but WITH async function main wrapper
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      var fs = require('fs')
      fs.mkdirSync('/vite-app/src', { recursive: true })
      fs.writeFileSync('/vite-app/index.html', '<html></html>')
      fs.writeFileSync('/vite-app/src/main.js', 'console.log("hi")')
      async function main() {
        var createServer
        try {
          var vite = require('vite')
          console.log('s1: vite required')
          createServer = vite.createServer
        } catch(e) { console.error('s1-err:', e.message) }
        try {
          var server = await createServer({ root: '/vite-app', server: { port: 3030 } })
          console.log('s2: server created')
        } catch(e) { console.error('s2-err:', e.message) }
        console.log('s3')
      }
      await main()
      """
    Then the terminal should contain "s3"

  Scenario: Vite var+try-catch inside async function main, NO await main()
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      var fs = require('fs')
      fs.mkdirSync('/vite-app/src', { recursive: true })
      fs.writeFileSync('/vite-app/index.html', '<html></html>')
      fs.writeFileSync('/vite-app/src/main.js', 'console.log("hi")')
      async function main() {
        var createServer
        try {
          var vite = require('vite')
          console.log('s1: vite required')
          createServer = vite.createServer
        } catch(e) { console.error('s1-err:', e.message) }
        try {
          var server = await createServer({ root: '/vite-app', server: { port: 3030 } })
          console.log('s2: server created')
        } catch(e) { console.error('s2-err:', e.message) }
        console.log('s3')
      }
      main().catch(e => console.error('e:', e))
      """
    Then the terminal should contain "s3"
