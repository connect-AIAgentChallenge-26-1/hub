import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

export default [
  { ignores: ['dist', 'node_modules', 'coverage'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      // 'latest'는 contracts/envelope.test.js의 JSON import attribute
      // (`with { type: 'json' }`) 구문을 파싱하는 데 필요하다.
      ecmaVersion: 'latest',
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    files: ['**/*.test.{js,jsx}', 'src/test/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.es2021 },
    },
  },
  {
    // Node에서 직접 실행되는 CLI 스크립트(GitHub Actions 판정 로직, verify
    // 게이트). 브라우저 전역이 아니라 Node 전역(process 등)이 필요하다.
    files: ['scripts/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.es2021 },
    },
  },
]
