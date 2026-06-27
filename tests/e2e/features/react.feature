Feature: React server-side rendering
  As a developer using browser-node
  I want to use React with SSR
  So that I can render React components to HTML strings

  Background:
    Given the browser-node environment is ready

  Scenario: React renders a component to HTML string
    When I install the following packages:
      | package    | version |
      | react      | latest  |
      | react-dom  | latest  |
    And I run the following code:
      """
      const React = require('react')
      const ReactDOMServer = require('react-dom/server')
      const App = () => React.createElement('div', null,
        React.createElement('h1', null, 'Hello React!'))
      const html = ReactDOMServer.renderToString(React.createElement(App))
      console.log('React rendered:', html.length > 0 ? 'ok' : 'empty')
      console.log('React SSR complete')
      """
    Then the terminal should contain "React SSR complete"

  Scenario: React runs an HTTP server with SSR
    When I install the following packages:
      | package    | version |
      | react      | latest  |
      | react-dom  | latest  |
    And I run the following code:
      """
      const http = require('http')
      const React = require('react')
      const ReactDOMServer = require('react-dom/server')
      const App = () => React.createElement('div', null, React.createElement('h1', null, 'Hello React!'))
      const html = ReactDOMServer.renderToString(React.createElement(App))
      http.createServer((req, res) => {
        res.writeHead(200, { 'content-type': 'text/html' })
        res.end('<html><body>' + html + '</body></html>')
      }).listen(3000, () => console.log('React server running on http://localhost:3000'))
      """
    Then the terminal should contain "React server running"

  Scenario: React createElement with props and children
    When I install the following packages:
      | package    | version |
      | react      | latest  |
      | react-dom  | latest  |
    And I run the following code:
      """
      const React = require('react')
      const ReactDOMServer = require('react-dom/server')
      const Card = ({ title, children }) =>
        React.createElement('div', { className: 'card' },
          React.createElement('h2', null, title),
          children)
      const html = ReactDOMServer.renderToString(
        React.createElement(Card, { title: 'Test' },
          React.createElement('p', null, 'content')))
      const hasH2 = html.includes('<h2')
      console.log('React props+children:', hasH2 ? 'ok' : 'missing h2')
      """
    Then the terminal should contain "React props+children: ok"

  Scenario: React missing module causes an error
    When I install the following packages:
      | package    | version |
      | react      | latest  |
      | react-dom  | latest  |
    And I run the following code:
      """
      const React = require('react')
      const Missing = require('nonexistent-react-addon')
      """
    Then the terminal should show a runtime error
