Feature: OPFS workspace persistence
  As a developer using browser-node
  I want my files to survive a page reload
  So that I don't lose work between sessions

  Background:
    Given the browser-node environment is ready

  @persistence
  Scenario: a written file survives a page reload
    Given OPFS persistence is enabled
    When I run terminal command "cd /app"
    And I run terminal command "echo persisted-across-reload > /app/keep.txt"
    And I reload the page
    And I run terminal command "cat /app/keep.txt"
    Then the terminal should contain "persisted-across-reload"

  @persistence
  Scenario: a fresh session does not restore persisted files
    When I run terminal command "cat /app/keep.txt"
    Then the terminal should contain "No such file or directory"
