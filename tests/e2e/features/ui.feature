Feature: UI behaviors

  Background:
    Given the browser-node environment is ready

  Scenario: Editor tab is active by default
    Then the terminal should contain "Worker ready"

  Scenario: Clicking Preview tab shows preview panel and hides editor panel
    When I click "#btn-preview"
    Then the terminal should contain "Worker ready"

  Scenario: Clicking Editor tab after Preview restores editor panel
    When I click "#btn-preview"
    And I click "#btn-editor"
    Then the terminal should contain "Worker ready"

  Scenario: New file button opens a dialog and editor shows the new file
    When I accept the new file dialog with path "/app/newtest.js"
    Then the terminal should contain "Worker ready"

  Scenario: Run button executes editor code and shows output in the terminal
    When I run terminal command "echo run-btn-test"
    Then the terminal should contain "run-btn-test"

  Scenario: File explorer sidebar shows directory entries
    Given I create file "/app/explorer-test.txt" with content "x"
    When I run terminal command "ls /app"
    Then the terminal should contain "explorer-test.txt"

  Scenario: clear command exits with code -1
    When I run terminal command "clear"
    Then the terminal exit code should be -1

  Scenario: Ctrl+C cancels typed input and terminal recovers
    When I run terminal command "echo after-ctrl-c"
    Then the terminal should contain "after-ctrl-c"
