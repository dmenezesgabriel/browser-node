export default {
  paths: ['tests/e2e/features/vite.feature'],
  import: [
    'tests/e2e/world.mjs',
    'tests/e2e/hooks.mjs',
    'tests/e2e/steps/common.steps.mjs',
    'tests/e2e/steps/terminal.steps.mjs',
  ],
  format: ['progress', 'summary'],
  timeout: 660000,
}
