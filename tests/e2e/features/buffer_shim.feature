Feature: Buffer shim (node:buffer polyfill)
  As a developer using browser-node
  I want the buffer shim to export missing Node.js constants
  So that packages like pino/thread-stream that access buffer.constants work

  Background:
    Given the browser-node environment is ready

  Scenario: Buffer.MAX_STRING_LENGTH is available
    When I run the following code:
      """
      const { Buffer } = require('buffer')
      console.log('MAX_STRING_LENGTH:', typeof Buffer.MAX_STRING_LENGTH, Buffer.MAX_STRING_LENGTH)
      """
    Then the terminal should contain "MAX_STRING_LENGTH: number 4294967296"

  Scenario: buffer.constants.MAX_STRING_LENGTH is available
    When I run the following code:
      """
      const buffer = require('buffer')
      console.log('constants:', typeof buffer.constants)
      console.log('MAX_STRING_LENGTH:', typeof buffer.constants.MAX_STRING_LENGTH, buffer.constants.MAX_STRING_LENGTH)
      """
    Then the terminal should contain "MAX_STRING_LENGTH: number 4294967296"

  Scenario: kMaxLength is available from buffer package
    When I run the following code:
      """
      const buffer = require('buffer')
      console.log('kMaxLength:', typeof buffer.kMaxLength, buffer.kMaxLength)
      """
    Then the terminal should contain "kMaxLength: number"

  Scenario: Buffer.from with various encodings works
    When I run the following code:
      """
      const { Buffer } = require('buffer')
      const b1 = Buffer.from('hello')
      const b2 = Buffer.from('68656c6c6f', 'hex')
      const b3 = Buffer.from('aGVsbG8=', 'base64')
      console.log('from utf8:', b1.toString())
      console.log('from hex:', b2.toString())
      console.log('from base64:', b3.toString())
      """
    Then the terminal should contain "from utf8: hello"
    And the terminal should contain "from hex: hello"
    And the terminal should contain "from base64: hello"

  Scenario: Buffer.alloc and Buffer.concat work
    When I run the following code:
      """
      const { Buffer } = require('buffer')
      const b1 = Buffer.alloc(3, 0x41)
      const b2 = Buffer.from(' world')
      const combined = Buffer.concat([b1, b2])
      console.log('alloc:', b1.toString())
      console.log('concat:', combined.toString())
      """
    Then the terminal should contain "alloc: AAA"
    And the terminal should contain "concat: AAA world"

  Scenario: Buffer.isBuffer works
    When I run the following code:
      """
      const { Buffer } = require('buffer')
      const b = Buffer.from('test')
      const notB = 'not a buffer'
      console.log('isBuffer true:', Buffer.isBuffer(b))
      console.log('isBuffer false:', Buffer.isBuffer(notB))
      """
    Then the terminal should contain "isBuffer true: true"
    And the terminal should contain "isBuffer false: false"
