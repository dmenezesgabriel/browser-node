Feature: Fastify HTTP server
  As a developer using browser-node
  I want to run a Fastify server
  So that I can use a high-performance Node.js framework in the browser

  Background:
    Given the browser-node environment is ready

  Scenario: Fastify server starts successfully
    When I install the packages "fastify"
    And I run the following code:
      """
      const Fastify = require('fastify')
      const app = Fastify({ logger: false })
      app.get('/', async () => ({ hello: 'world' }))
      app.listen({ port: 3000, host: '0.0.0.0' }, (err) => {
        if (err) { console.error('Fastify error:', err.message); return }
        console.log('Fastify server running on http://localhost:3000')
      })
      """
    Then the terminal should contain "Fastify server running"

  Scenario: Fastify handles async route handlers
    When I install the packages "fastify"
    And I run the following code:
      """
      const Fastify = require('fastify')
      const app = Fastify({ logger: false })
      app.get('/data', async (req, reply) => {
        const result = await Promise.resolve({ value: 42 })
        return result
      })
      app.listen({ port: 3000 }, () => console.log('Fastify async route ready'))
      """
    Then the terminal should contain "Fastify async route ready"

  Scenario: Fastify reports plugin/decorator errors at boot
    When I install the packages "fastify"
    And I run the following code:
      """
      const Fastify = require('fastify')
      const app = Fastify({ logger: false })
      // accessing undefined.property should throw synchronously
      const x = undefined.nonexistent
      app.listen({ port: 3000 }, () => console.log('should not reach here'))
      """
    Then the terminal should show a runtime error
    And the terminal should NOT contain "should not reach here"

  Scenario: Fastify with JSON schema validation
    When I install the packages "fastify"
    And I run the following code:
      """
      const Fastify = require('fastify')
      const app = Fastify({ logger: false })
      app.get('/typed', {
        schema: { response: { 200: { type: 'object', properties: { ok: { type: 'boolean' } } } } }
      }, async () => ({ ok: true }))
      app.listen({ port: 3000 }, () => console.log('Fastify schema server running'))
      """
    Then the terminal should contain "Fastify schema server running"

  Scenario: Fastify loads pino internals (buffer.constants.MAX_STRING_LENGTH) without crash
    When I install the packages "fastify"
    And I run the following code:
      """
      const Fastify = require('fastify')
      const buffer = require('buffer')
      const ts = require('thread-stream')
      console.log('thread-stream loaded:', typeof ts)
      console.log('MAX_STRING_LENGTH:', buffer.constants.MAX_STRING_LENGTH)
      """
    Then the terminal should contain "MAX_STRING_LENGTH: 4294967296"

  Scenario: Fastify server responds to HTTP GET
    When I install the packages "fastify"
    And I run the following code:
      """
      const Fastify = require('fastify')
      const http = require('http')
      const app = Fastify({ logger: false })
      app.get('/test', async () => ({ status: 'ok' }))
      app.listen({ port: 3001 }, () => {
        http.get('http://localhost:3001/test', (res) => {
          let data = ''
          res.on('data', chunk => data += chunk)
          res.on('end', () => {
            const json = JSON.parse(data)
            console.log('GET response status:', json.status)
          })
        }).on('error', e => console.error('GET failed:', e.message))
      })
      """
    Then the terminal should contain "GET response status: ok"
