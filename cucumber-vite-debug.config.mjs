export default {
  paths: ['tests/e2e/features/vite-simple.feature'],
  import: [
    'tests/e2e/world.mjs',
    'tests/e2e/hooks.mjs',
    'tests/e2e/steps/common.steps.mjs',
    'tests/e2e/steps/terminal.steps.mjs',
  ],
  format: ['summary'],
  timeout: 660000,
  worldParameters: { debug: true },
}
