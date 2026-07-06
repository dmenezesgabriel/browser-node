@diagnostic
Feature: Vite Diagnostic

  Scenario: Trace the chokidar watch crash
    Given the browser-node environment is ready
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      // Step 1: set up the app
      var fs = require('fs')
      fs.mkdirSync('/vite-app/src', { recursive: true })
      fs.writeFileSync('/vite-app/index.html', '<html></html>')
      fs.writeFileSync('/vite-app/src/main.js', 'console.log("hi")')

      // Step 2: Access the real chokidar by requiring vite
      // which bundles its own chokidar at module load time
      var createServer
      try {
        var vite = require('vite')
        console.log('s1: vite required')
        createServer = vite.createServer
      } catch(e) {
        console.error('s1-err:', e.message)
      }

      // Step 3: Try calling createServer without watch:null
      // to trigger the bundled chokidar
      try {
        var server = await createServer({
          root: '/vite-app',
          logLevel: 'silent',
          server: { port: 5199, host: '0.0.0.0' }
        })
        console.log('s2: server created')
      } catch(e) {
        console.error('s2-err:', e.message)
      }
      console.log('s3')
      """
    Then the terminal should contain "s3"