// E2E-тесты идут по собранной версии (как на GitHub Pages), потому что CSP есть только в сборке.
import { defineConfig } from '@playwright/test';

const PORT = 4173;
const BASE = `http://localhost:${PORT}/normokontrol-school/`;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: BASE },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
