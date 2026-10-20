import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // core is pure TypeScript: no rendering, UI or IFC library (see CLAUDE.md).
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'src/core must not import three.' },
            { group: ['react', 'react/*', 'react-dom', 'react-dom/*'], message: 'src/core must not import react.' },
            { group: ['web-ifc', 'web-ifc/*'], message: 'src/core must not import web-ifc.' },
          ],
        },
      ],
    },
  },
)
