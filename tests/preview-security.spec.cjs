const { test, expect } = require('@playwright/test');

test('preview serving does not expose credentials, source internals, or SQLite files', async ({ request }) => {
  for (const path of ['/.env', '/.git/config', '/data/forkcast.sqlite3', '/README.md', '/backend/main.py']) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
  }
});
