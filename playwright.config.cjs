const { defineConfig } = require('@playwright/test');
const port = process.env.FORKCAST_TEST_PORT || '18014';
const baseURL = `http://127.0.0.1:${port}`;
module.exports = defineConfig({
  testDir: './tests', testMatch: '*.spec.cjs',
  workers: 1,
  use: { baseURL, channel: 'chrome' },
  // Isolated restricted preview: never share the user's live backend or expose .env/data.
  webServer: { command: `python scripts/preview.py --port ${port}`, url: baseURL, reuseExistingServer: !process.env.CI },
});
