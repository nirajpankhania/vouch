// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // user-facing output goes through report/terminal.ts; flag stray logging
      'no-console': ['warn', { allow: ['error'] }],
    },
  },
);
