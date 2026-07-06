Feature: Vite esbuild diagnostic
  Background:
    Given the browser-node environment is ready

  Scenario: require esbuild directly
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      try {
        const esbuild = require('esbuild')
        console.log('esbuild keys:', Object.keys(esbuild).join(', '))
        console.log('esbuild require OK')
      } catch(e) {
        console.error('esbuild require failed:', e.message)
      }
      """
    Then the terminal should contain "esbuild require OK"
