const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/live', testMatch: '*.cjs', workers: 1,
  use: { baseURL: process.env.FORKCAST_LIVE_URL || 'http://127.0.0.1:8014', channel: 'chrome' },
  // Requires a real running backend. Never reuse the browser-only preview as a mock API.
});
