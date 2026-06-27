Feature: Angular core and RxJS
  As a developer using browser-node
  I want to load Angular core packages
  So that I can use Angular's reactive primitives and dependency injection utilities

  Background:
    Given the browser-node environment is ready

  Scenario: Angular core and RxJS BehaviorSubject work correctly
    When I install the following packages:
      | package            | version |
      | @angular/core      | latest  |
      | @angular/compiler  | latest  |
      | rxjs               | latest  |
      | zone.js            | latest  |
    And I run the following code:
      """
      const http = require('http')
      async function main() {
        const core = require('@angular/core')
        console.log('Angular core loaded, version:', core.VERSION.full)
        const { BehaviorSubject } = require('rxjs')
        const state = new BehaviorSubject({ status: 'ok' })
        let received = null
        state.subscribe(v => { received = v })
        state.next({ status: 'ready' })
        if (!received || received.status !== 'ready') throw new Error('BehaviorSubject not working')
        console.log('RxJS working, last value:', received.status)
        const compiler = require('@angular/compiler')
        console.log('Angular compiler loaded:', typeof compiler.parseTemplate)
        http.createServer((req, res) => {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ framework: 'Angular', version: core.VERSION.full, rxjs: 'ok' }))
        }).listen(3000, () => console.log('Angular server running on http://localhost:3000'))
      }
      main().catch(e => console.error('Angular failed:', e.stack || e.message || e))
      """
    Then the terminal should contain "Angular server running"

  Scenario: Angular version is accessible
    When I install the following packages:
      | package            | version |
      | @angular/core      | latest  |
      | @angular/compiler  | latest  |
      | rxjs               | latest  |
      | zone.js            | latest  |
    And I run the following code:
      """
      const core = require('@angular/core')
      const version = core.VERSION
      console.log('Angular major version:', version.major)
      if (!version.full || !version.major) throw new Error('VERSION missing')
      console.log('Angular version check passed')
      """
    Then the terminal should contain "Angular version check passed"

  Scenario: RxJS Observable operators work
    When I install the following packages:
      | package            | version |
      | @angular/core      | latest  |
      | rxjs               | latest  |
      | zone.js            | latest  |
    And I run the following code:
      """
      const { from, firstValueFrom } = require('rxjs')
      const { map, filter } = require('rxjs/operators')
      async function main() {
        const result = await firstValueFrom(
          from([1, 2, 3, 4, 5]).pipe(
            filter(x => x % 2 === 0),
            map(x => x * 10)
          )
        )
        console.log('RxJS result:', result)
        if (result !== 20) throw new Error('Expected 20, got ' + result)
        console.log('RxJS operators working correctly')
      }
      main().catch(e => console.error('RxJS failed:', e.message))
      """
    Then the terminal should contain "RxJS operators working correctly"

  Scenario: Angular core error propagates to terminal
    When I install the following packages:
      | package            | version |
      | @angular/core      | latest  |
      | rxjs               | latest  |
      | zone.js            | latest  |
    And I run the following code:
      """
      async function main() {
        const { BehaviorSubject } = require('rxjs')
        const s = new BehaviorSubject(null)
        let val = null
        s.subscribe(v => { val = v })
        s.next('test')
        if (val !== 'test') throw new Error('Unexpected value: ' + val)
        // Force an error
        throw new Error('deliberate Angular test error')
      }
      main().catch(e => console.error('Angular failed:', e.message))
      """
    Then the terminal should contain "Angular failed: deliberate Angular test error"
