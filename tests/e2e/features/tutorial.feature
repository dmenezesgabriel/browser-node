Feature: Next.js Tutorial emulation
  As a developer
  I want to follow the "Build Your First Next.js App From Scratch" tutorial
  To verify the browser-node environment can handle standard Next.js workflows

  Scenario: Run create-next-app and start dev server
    Given the browser-node environment is ready
    When I run terminal command "npx -y create-next-app@latest /nextjs-blog --js --tailwind --src-dir --no-app --eslint --import-alias '@/*' --use-npm --skip-install" with timeout 300s
    Then the terminal should contain "Success!"
    When I install the following packages:
      | package    | version |
      | next       | latest  |
      | react      | latest  |
      | react-dom  | latest  |
    And I run the following code:
      """
      const fs = require('fs')
      process.env.NEXT_TELEMETRY_DISABLED = '1'
      ;['dev/server', 'static/development', 'server'].forEach(d =>
        fs.mkdirSync('/nextjs-blog/.next/' + d, { recursive: true }))
      ;['dev/server/instrumentation.js', 'dev/server/middleware.js'].forEach(f =>
        fs.writeFileSync('/nextjs-blog/.next/' + f, '"use strict"; module.exports = {}'))
      const next = require('next')
      const app = next({ dev: true, dir: '/nextjs-blog', port: 3000 })
      const handle = app.getRequestHandler()
      async function main() {
        await app.prepare()
        const http = require('http')
        http.createServer((req, res) => handle(req, res)).listen(3000, () => {
          console.log('Next.js server running on http://localhost:3000')
        })
      }
      main().catch(e => console.error('Next.js failed:', e.stack || e.message || e))
      """
    Then the terminal should contain "Next.js server running on http://localhost:3000"
