import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'node_modules',
      'playwright-report',
      'test-results',
      'public',
      'fixtures',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Бриф, раздел 2.5: текст документа только через textContent (защита от XSS).
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Используйте textContent и DOM API.' },
        { property: 'outerHTML', message: 'Используйте textContent и DOM API.' },
        { property: 'insertAdjacentHTML', message: 'Используйте textContent и DOM API.' },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    // Ядро должно работать в Node и в Web Worker, поэтому DOM ему запрещён.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'Ядро не знает про DOM.' },
        { name: 'document', message: 'Ядро не знает про DOM.' },
        { name: 'DOMParser', message: 'DOMParser нет в Web Worker и в Node.' },
        { name: 'localStorage', message: 'Хранилище — забота интерфейса.' },
      ],
    },
  },
  {
    // В тестах «!» допустим: если значения нет, тест и должен упасть.
    files: ['tests/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  prettier,
);
