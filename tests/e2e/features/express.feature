Feature: Express.js HTTP server
  As a developer using browser-node
  I want to run an Express.js server
  So that I can serve HTTP routes without a real backend

  Background:
    Given the browser-node environment is ready

  Scenario: Express server starts and announces its port
    When I install the packages "express"
    And I run the following code:
      """
      const express = require('express')
      const app = express()
      app.get('/', (req, res) => res.send('<h1>Hello from Express!</h1>'))
      app.listen(3000, () => console.log('Express server running on http://localhost:3000'))
      """
    Then the terminal should contain "Express server running"

  Scenario: Express handles a named route
    When I install the packages "express"
    And I run the following code:
      """
      const express = require('express')
      const app = express()
      app.get('/health', (req, res) => res.json({ status: 'ok' }))
      app.listen(3000, () => console.log('Express ready'))
      """
    Then the terminal should contain "Express ready"

  Scenario: Syntax error in Express code surfaces in the terminal
    When I install the packages "express"
    And I run the following code:
      """
      const express = require('express'
      // missing closing paren — syntax error
      """
    Then the terminal should show a runtime error

  Scenario: Express middleware chain works
    When I install the packages "express"
    And I run the following code:
      """
      const express = require('express')
      const app = express()
      app.use((req, res, next) => { req.extra = 'mw'; next() })
      app.get('/', (req, res) => res.send('middleware: ' + req.extra))
      app.listen(3000, () => console.log('Express middleware server running'))
      """
    Then the terminal should contain "Express middleware server running"
