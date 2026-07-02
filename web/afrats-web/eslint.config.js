import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // argsIgnorePattern mirrors varsIgnorePattern so PascalCase params used
      // only in JSX (e.g. `{ icon: Icon }` -> <Icon/>) aren't mis-flagged —
      // this config has no eslint-plugin-react / jsx-uses-vars to mark them used.
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^[A-Z_]' }],
      // React Compiler's set-state-in-effect is an advisory cascading-render
      // performance hint, not a functional bug — keep it as a warning so it
      // does not fail the lint gate.
      'react-hooks/set-state-in-effect': 'warn',
      // Fast-refresh-only concern (dev HMR), no runtime impact — warn, don't fail.
      'react-refresh/only-export-components': 'warn',
    },
  },
])
