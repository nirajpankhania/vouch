import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  clean: true,
  sourcemap: false,
  // src/cli.ts carries the #!/usr/bin/env node shebang; tsup preserves it
  // in dist/cli.js and marks the file executable.
});
