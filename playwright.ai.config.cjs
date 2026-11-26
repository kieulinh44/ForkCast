const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/ai', testMatch: '*.cjs', workers: 1, timeout: 240000,
  use: { baseURL: process.env.FORKCAST_LIVE_URL || 'http://127.0.0.1:8014', channel: 'chrome' },
  // Explicit opt-in suite: calls the configured class models with synthetic fixtures only.
});
