Feature: Terminal shell commands

  Background:
    Given the browser-node environment is ready

  Scenario: echo prints text to the terminal
    When I run terminal command "echo hello from terminal"
    Then the terminal should contain "hello from terminal"

  Scenario: ls lists files after creating one
    When I create file "/app/listed.txt" with content "x"
    And I run terminal command "ls /app"
    Then the terminal should contain "listed.txt"

  Scenario: mkdir -p creates nested directory
    When I run terminal command "mkdir -p /app/nested/deep"
    And I run terminal command "ls /app/nested"
    Then the terminal should contain "deep"

  Scenario: touch creates an empty file
    When I run terminal command "touch /app/touched.txt"
    And I run terminal command "ls /app"
    Then the terminal should contain "touched.txt"

  Scenario: cat reads a file's contents
    Given I create file "/app/greet.txt" with content "hello cat"
    When I run terminal command "cat /app/greet.txt"
    Then the terminal should contain "hello cat"

  Scenario: cd changes working directory
    When I run terminal command "cd /tmp"
    And I run terminal command "pwd"
    Then the terminal should contain "/tmp"

  Scenario: node executes a JS file and shows output
    Given I create file "/app/hello.js" with content "console.log('node works')"
    When I run terminal command "node /app/hello.js"
    Then the terminal should contain "node works"

  Scenario: running node on the same file twice produces output both times
    Given I create file "/app/counter.js" with content "console.log('run output')"
    When I run terminal command "node /app/counter.js"
    And I run terminal command "node /app/counter.js"
    Then the terminal should contain "run output"

  Scenario: unknown command shows command not found error
    When I run terminal command "notacommand"
    Then the terminal should contain "command not found"

  Scenario: which node reports shell built-in
    When I run terminal command "which node"
    Then the terminal should contain "shell built-in"

  Scenario: which nonexistent shows not found in the terminal
    When I run terminal command "which nonexistentprog"
    Then the terminal should contain "not found"

  Scenario: grep finds matching lines in a file
    Given I create file "/app/data.txt" with content "apple\nbanana\ncherry"
    When I run terminal command "grep banana /app/data.txt"
    Then the terminal should contain "banana"
    And the terminal should NOT contain "apple"

  Scenario: find locates files by name pattern
    Given I create file "/app/find-me.txt" with content "findable"
    When I run terminal command "find /app -name find-me.txt"
    Then the terminal should contain "find-me.txt"

  Scenario: mv renames a file
    Given I create file "/app/before.txt" with content "renamed"
    When I run terminal command "mv /app/before.txt /app/after.txt"
    And I run terminal command "ls /app"
    Then the terminal should contain "after.txt"
    And the terminal should NOT contain "before.txt"

  Scenario: npm run executes a package.json script
    Given I create file "/app/package.json" with content "{\"scripts\":{\"greet\":\"echo npm-script-ran\"}}"
    When I run terminal command "cd /app"
    And I run terminal command "npm run greet"
    Then the terminal should contain "npm-script-ran"

  Scenario: process.exit terminates the command without an error
    When I run the following code:
      """
      console.log('before exit')
      process.exit(0)
      """
    Then the terminal should contain "before exit"
    And the terminal should NOT contain "process.exit"

  Scenario: child process writes propagate back to the parent VFS
    When I run the following code:
      """
      const { fork } = require('child_process')
      const fs = require('fs')
      fs.writeFileSync('/app/child-writer.js', 'require("fs").writeFileSync("/app/from-child.txt", "hello-from-child")')
      const cp = fork('/app/child-writer.js')
      cp.on('exit', () => {
        try {
          console.log('parent-read: ' + fs.readFileSync('/app/from-child.txt', 'utf8'))
        } catch (e) { console.log('parent-read-failed: ' + e.message) }
      })
      """
    Then the terminal should contain "parent-read: hello-from-child"

  Scenario: worker_threads runs a worker with workerData and message passing
    When I run the following code:
      """
      const { Worker } = require('worker_threads')
      const fs = require('fs')
      fs.writeFileSync('/app/echo-worker.js', [
        'const { parentPort, workerData } = require("worker_threads")',
        'parentPort.postMessage("echo:" + workerData.msg)'
      ].join('\n'))
      const w = new Worker('/app/echo-worker.js', { workerData: { msg: 'ping' } })
      w.on('message', (m) => console.log('worker-said: ' + m))
      w.on('error', (e) => console.log('worker-error: ' + e.message))
      """
    Then the terminal should contain "worker-said: echo:ping"
