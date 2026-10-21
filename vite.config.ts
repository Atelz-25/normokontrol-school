/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';

// Политика из брифа (раздел 2): странице запрещены любые сетевые запросы.
const CSP = "default-src 'self'; connect-src 'none'; img-src 'self' data:";

// CSP вставляем только в сборку: в dev-режиме Vite общается с браузером
// через WebSocket для горячей перезагрузки, и connect-src 'none' её бы сломал.
function cspMetaTag(): Plugin {
  return {
    name: 'csp-meta-tag',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  // Сайт живёт по адресу https://atelz-25.github.io/normokontrol-school/
  base: '/normokontrol-school/',
  plugins: [cspMetaTag()],
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
