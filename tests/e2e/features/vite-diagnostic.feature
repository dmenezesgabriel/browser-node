Feature: Vite diagnostic
  Background:
    Given the browser-node environment is ready

  Scenario: Just require vite
    When I install the following packages:
      | package | version |
      | vite    | latest  |
    And I run the following code:
      """
      try {
        const vite = require('vite')
        console.log('Vite keys:', Object.keys(vite).join(', '))
        console.log('Vite require OK')
      } catch(e) {
        console.error('Vite require failed:', e.message)
      }
      """
    Then the terminal should contain "Vite require OK"
