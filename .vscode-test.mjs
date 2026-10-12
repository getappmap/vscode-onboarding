import { defineConfig } from '@vscode/test-cli';

// Test on the oldest VS Code we support (engines.vscode) and on the newest.
const common = {
  files: 'out/test/vscode/**/*.test.js',
  workspaceFolder: './test-fixtures/sample-project',
};

export default defineConfig([
  { ...common, label: 'oldest', version: '1.134.0' },
  { ...common, label: 'newest', version: 'stable' },
]);
