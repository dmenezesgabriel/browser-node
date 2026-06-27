Feature: Next.js Tutorial emulation
  As a developer
  I want to follow the "Build Your First Next.js App From Scratch" tutorial
  To verify the browser-node environment can handle standard Next.js workflows

  Scenario: Run create-next-app and start dev server
    Given the browser-node environment is ready
    When I run terminal command "npx -y create-next-app@latest nextjs-blog --typescript --tailwind --src-dir --no-app --eslint --import-alias '@/*' --use-npm"
    Then the terminal should contain "Success! Created nextjs-blog"
    When I run terminal command "cd nextjs-blog && npm run dev"
    Then the terminal should contain "Ready in"
