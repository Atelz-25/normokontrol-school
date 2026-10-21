// E2E-тесты идут по собранной версии (как на GitHub Pages), потому что CSP есть только в сборке.
import { defineConfig } from '@playwright/test';

const PORT = 4173;
// 127.0.0.1, а не localhost: на некоторых машинах localhost — это IPv6, и сервер «не находится».
const BASE = `http://127.0.0.1:${PORT}/normokontrol-school/`;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: BASE },
  // PW_CHANNEL=msedge запускает тесты в уже установленном Edge (тоже Chromium),
  // если скачать браузер Playwright не получается. В CI переменная не задана.
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', channel: process.env.PW_CHANNEL } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
