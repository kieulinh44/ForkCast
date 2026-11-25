const { test, expect } = require('@playwright/test');
const empty = () => ({ profile: {}, mood: '', craving: '', feedback: [], menuUrl: '' });
const healthy = { ok: true, database: { ok: true, schema_version: 1 }, services: { text: { configured: true }, vision: { configured: true } }, features: { menu_extraction: false, recommendations: false, preference_learning: false } };
async function stubApi(page, initial = empty()) {
  const api = { state: initial, revision: 0, failWrites: false, writes: 0, failReads: false };
  await page.route('**/api/health', route => route.fulfill({ status: api.failReads ? 503 : 200, json: api.failReads ? { ok: false } : healthy }));
  await page.route('**/api/state', async route => {
    const method = route.request().method();
    if (method !== 'GET') {
      if (api.failWrites) return route.fulfill({ status: 503, json: {} });
      const body = route.request().postDataJSON();
      if (body.revision !== api.revision) return route.fulfill({ status: 409, json: {} });
      api.state = method === 'DELETE' ? empty() : body.state;
      api.revision += 1;
      api.writes += 1;
    }
    await route.fulfill({ status: 200, json: { state: api.state, revision: api.revision } });
  });
  return api;
}

test('backend workspace loads without silently importing a browser-only draft', async ({ page }) => {
  const server = await stubApi(page, { ...empty(), profile: { name: 'Server diner' } });
  await page.addInitScript(() => localStorage.setItem('forkcast.draft.v1', JSON.stringify({ profile: { name: 'Local diner' }, mood: '', craving: '', feedback: [], menuUrl: '' })));
  await page.goto('/#profile');
  await expect(page.getByLabel('Display name')).toHaveValue('Server diner');
  expect(server.writes).toBe(0);
  await expect(page.locator('#storage-banner')).toContainText('browser-only draft');
});

test('saving a profile writes SQLite-mode state instead of claiming a browser-only save', async ({ page }) => {
  const server = await stubApi(page);
  await page.goto('/#profile');
  await page.getByLabel('Display name').fill('New server diner');
  await page.getByRole('button', { name: 'Save taste profile' }).click();
  await expect.poll(() => server.state.profile.name).toBe('New server diner');
  await expect(page.locator('#toast')).toContainText('to this server');
  await page.reload();
  await expect(page.getByLabel('Display name')).toHaveValue('New server diner');
});

test('clearing server data persists the reset and does not return after reload', async ({ page }) => {
  const server = await stubApi(page, { ...empty(), profile: { name: 'Clear me' } });
  await page.goto('/#profile');
  await expect(page.getByLabel('Display name')).toHaveValue('Clear me');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Clear saved data', exact: true }).click();
  await expect.poll(() => server.writes).toBe(1);
  await page.reload();
  await expect(page.getByLabel('Display name')).toHaveValue('');
});

test('a saved server review clears its form only after the save succeeds', async ({ page }) => {
  const server = await stubApi(page);
  await page.goto('/#feedback');
  await page.getByLabel('Dish name').fill('Sample bowl');
  await page.getByLabel('Your rating').selectOption('4');
  await page.getByLabel('Your notes').fill('Good crunch');
  await page.getByRole('button', { name: 'Save meal feedback' }).click();
  await expect.poll(() => server.state.feedback.length).toBe(1);
  await expect(page.getByLabel('Dish name')).toHaveValue('');
  await expect(page.locator('#feedback-list')).toContainText('Saved to this server');
});

test('legacy data is imported only after approval and removed locally only after success', async ({ page }) => {
  const server = await stubApi(page);
  await page.addInitScript(() => localStorage.setItem('forkcast.draft.v1', JSON.stringify({ profile: { name: 'Imported diner' }, mood: 'Light', craving: 'Fresh', feedback: [], menuUrl: '' })));
  await page.goto('/#profile');
  await expect(page.getByLabel('Display name')).toHaveValue('');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Import browser-only draft', exact: true }).click();
  await expect.poll(() => server.state.profile.name).toBe('Imported diner');
  await expect(page.getByLabel('Display name')).toHaveValue('Imported diner');
  await expect(page.locator('#storage-banner')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('forkcast.draft.v1'))).toBeNull();
});

test('system status separates a working database from configured but untested AI features', async ({ page }) => {
  await stubApi(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'System status', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connection & storage', exact: true })).toBeVisible();
  await expect(page.locator('#database-health')).toContainText('Ready');
  await expect(page.locator('#text-health')).toContainText('Configured');
  await expect(page.locator('#vision-health')).toContainText('Configured');
  await expect(page.locator('#view-system')).toContainText('not a live AI availability check');
  await expect(page.locator('#view-system')).toContainText('not deployed');
});

test('server save failure retains profile input and can be retried without a local fallback', async ({ page }) => {
  const server = await stubApi(page);
  await page.goto('/#profile');
  await page.getByLabel('Display name').fill('Retry diner');
  server.failWrites = true;
  await page.getByRole('button', { name: 'Save taste profile' }).click();
  await expect(page.locator('#toast')).toContainText('Server storage is unavailable');
  await expect(page.getByLabel('Display name')).toHaveValue('Retry diner');
  expect(server.writes).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('forkcast.draft.v1'))).toBeNull();
  server.failWrites = false;
  await page.getByRole('button', { name: 'Save taste profile' }).click();
  await expect.poll(() => server.state.profile.name).toBe('Retry diner');
});

test('a stale tab does not overwrite the newer server revision', async ({ page }) => {
  const server = await stubApi(page);
  await page.goto('/#profile');
  await page.getByLabel('Display name').fill('Unsaved diner');
  server.revision += 1;
  await page.getByRole('button', { name: 'Save taste profile' }).click();
  await expect(page.locator('#toast')).toContainText('Data changed in another tab');
  await expect(page.getByLabel('Display name')).toHaveValue('Unsaved diner');
  expect(server.writes).toBe(0);
});

test('failed clearing leaves saved server data and current forms intact', async ({ page }) => {
  const server = await stubApi(page, { ...empty(), profile: { name: 'Keep me' } });
  await page.goto('/#profile');
  await expect(page.getByLabel('Display name')).toHaveValue('Keep me');
  server.failWrites = true;
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Clear saved data', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('Server storage is unavailable');
  await expect(page.getByLabel('Display name')).toHaveValue('Keep me');
  expect(server.state.profile.name).toBe('Keep me');
});

test('failed import retains the browser-only backup and existing server data', async ({ page }) => {
  const server = await stubApi(page, { ...empty(), profile: { name: 'Existing server diner' } });
  await page.addInitScript(() => localStorage.setItem('forkcast.draft.v1', JSON.stringify({ profile: { name: 'Backup diner' }, mood: '', craving: '', feedback: [], menuUrl: '' })));
  await page.goto('/#profile');
  await expect(page.getByLabel('Display name')).toHaveValue('Existing server diner');
  server.failWrites = true;
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Import browser-only draft' }).click();
  await expect(page.locator('#toast')).toContainText('Server storage is unavailable');
  await expect(page.locator('#storage-banner')).toBeVisible();
  await expect(page.getByLabel('Display name')).toHaveValue('Existing server diner');
  expect(await page.evaluate(() => localStorage.getItem('forkcast.draft.v1'))).toContain('Backup diner');
});

test('unavailable backend at startup does not silently use browser-local saves', async ({ page }) => {
  const server = await stubApi(page);
  server.failReads = true;
  await page.goto('/#profile');
  await expect(page.getByLabel('Display name')).toBeDisabled();
  await expect(page.locator('.pill')).toContainText('Server unavailable');
  await page.getByRole('button', { name: 'System status', exact: true }).click();
  await expect(page.locator('#server-health')).toContainText('Unavailable');
});
