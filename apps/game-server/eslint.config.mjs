import { defineConfig, globalIgnores } from 'eslint/config'
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  // Node-only scripts (deploy helpers, build helpers). These run under Node,
  // not the Cloudflare Workers runtime, so they have `process` / `console` /
  // etc. Without this block ESLint flags every reference as `no-undef`.
  {
    files: ['scripts/**/*.mjs', 'scripts/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  globalIgnores([
    '.wrangler/**',
    'node_modules/**',
    'dist/**',
    'worker-configuration.d.ts',
  ]),
])
