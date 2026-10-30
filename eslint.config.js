import eslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  { ignores: ['.output/**', '.wxt/**', 'node_modules/**', 'coverage/**'] },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
    },
    plugins: { '@typescript-eslint': eslint },
    rules: {
      ...eslint.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];
