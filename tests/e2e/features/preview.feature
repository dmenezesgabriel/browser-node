Feature: Example apps render in the preview tab
  As a developer using browser-node
  I want the example projects to actually render in the preview
  So that the environment is usable end-to-end, not just at the terminal

  Background:
    Given the browser-node environment is ready

  Scenario: express-todo renders its UI in the preview
    When I run terminal command "cd /examples/express-todo"
    And I run terminal command "npm install" with timeout 300s
    And I start a server with command "node index.js" until I see "Todo server on http"
    And I open the preview
    Then the preview should render "Express Todos"

  Scenario: node-http-todo renders its UI in the preview
    When I run terminal command "cd /examples/node-http-todo"
    And I run terminal command "npm install" with timeout 300s
    And I start a server with command "node index.js" until I see "Todo server on http"
    And I open the preview
    Then the preview should render "Node HTTP Todos"

  Scenario: angularjs-todo renders its UI in the preview
    When I run terminal command "cd /examples/angularjs-todo"
    And I run terminal command "npm install" with timeout 300s
    And I start a server with command "node server.js" until I see "Todo server on http"
    And I open the preview
    Then the preview should render "AngularJS Todos"

  Scenario: fastify-todo renders its UI in the preview
    When I run terminal command "cd /examples/fastify-todo"
    And I run terminal command "npm install" with timeout 300s
    And I start a server with command "node index.js" until I see "Todo server on http"
    And I open the preview
    Then the preview should render "Fastify Todos"

  Scenario: react-todo renders its UI in the preview
    When I run terminal command "cd /examples/react-todo"
    And I run terminal command "npm install" with timeout 300s
    And I start a server with command "npm run dev" until I see "Vite dev server running"
    And I open the preview
    Then the preview should render "React Todos"

  Scenario: vue-todo renders its UI in the preview
    When I run terminal command "cd /examples/vue-todo"
    And I run terminal command "npm install" with timeout 300s
    And I start a server with command "npm run dev" until I see "Vite dev server running"
    And I open the preview
    Then the preview should render "Vue Todos"
