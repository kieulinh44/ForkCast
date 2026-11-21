const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests', testMatch: '*.spec.cjs',
  // Parallel Chrome starts can exceed the local Python server's connection queue.
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:8014', channel: 'chrome' },
  webServer: { command: 'python -m http.server 8014 --bind 127.0.0.1', url: 'http://127.0.0.1:8014', reuseExistingServer: !process.env.CI },
});
