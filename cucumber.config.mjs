// Cucumber v13 ESM config: default export is the profile config directly.
// When loaded via import(), 'definitions.default' == this object, so
// profile 'default' is found at definitions['default'] without extra nesting.
export default {
  paths: [
    'tests/e2e/features/buffer_shim.feature',
    'tests/e2e/features/express.feature',
    'tests/e2e/features/fastify.feature',
    'tests/e2e/features/react.feature',
    'tests/e2e/features/angular.feature',
    'tests/e2e/features/nextjs.feature',
    'tests/e2e/features/vue.feature',
    'tests/e2e/features/vite.feature',
    'tests/e2e/features/terminal.feature',
    'tests/e2e/features/ui.feature',
  ],
  import: [
    'tests/e2e/world.mjs',
    'tests/e2e/hooks.mjs',
    'tests/e2e/steps/common.steps.mjs',
    'tests/e2e/steps/terminal.steps.mjs',
  ],
  format: [
    'progress-bar',
    'json:tests/e2e/results.json',
  ],
  timeout: 660000,
}
