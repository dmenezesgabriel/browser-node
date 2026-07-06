Feature: Vite VFS diagnostic
  Background:
    Given the browser-node environment is ready

  Scenario: Check Vite and esbuild VFS after install
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      const fs = require('fs')
      function ls(dir) {
        try {
          const entries = fs.readdirSync(dir)
          console.log(dir + ':', entries.slice(0, 20).join(', ') + (entries.length > 20 ? '...' : ''))
        } catch(e) { console.log(dir + ': NOT FOUND (' + e.message + ')') }
      }
      ls('/node_modules/esbuild')
      ls('/node_modules/esbuild/lib')
      try {
        const pkg = JSON.parse(fs.readFileSync('/node_modules/esbuild/package.json', 'utf8'))
        console.log('esbuild main:', pkg.main)
        console.log('esbuild exports:', JSON.stringify(pkg.exports))
      } catch(e) { console.log('esbuild package.json error:', e.message) }
      ls('/node_modules/vite')
      console.log('VFS diagnostic done')
      """
    Then the terminal should contain "VFS diagnostic done"
