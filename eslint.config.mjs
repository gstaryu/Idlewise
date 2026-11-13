import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'dist-*/**',
      'out/**',
      'release/**',
      'artifacts/**',
      'scripts/**',
      'tests/**',
      'vitest.config.ts',
      'playwright.config.ts',
      'tests/report/**',
      'tests/artifacts/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true }, projectService: true },
      globals: {
        window: 'readonly',
        document: 'readonly',
        location: 'readonly',
        history: 'readonly',
        navigator: 'readonly',
        console: 'writable',
        localStorage: 'writable',
        sessionStorage: 'writable',
        setTimeout: 'writable',
        clearTimeout: 'writable',
        setInterval: 'writable',
        clearInterval: 'writable',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        React: 'readonly',
      },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-explicit-any': 'off',
      'no-global-assign': ['error', { exceptions: ['console', 'localStorage', 'sessionStorage'] }],
    },
  },
]
