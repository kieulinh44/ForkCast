const { test, expect } = require('@playwright/test');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
async function clearGuest(request) {
  const response = await request.get('/api/state');
  if (!response.ok()) return;
  const envelope = await response.json();
  await request.delete('/api/state', { headers: { 'X-ForkCast-Request': '1' }, data: { revision: envelope.revision } });
}
test.beforeEach(async ({ page }) => {
  const response = await page.request.get('/api/health');
  expect(response.status(), 'A real Python backend must be running').toBe(200);
  expect((await response.json()).database.ok).toBe(true);
});
test.afterEach(async ({ page, context }) => {
  await context.setOffline(false);
  await clearGuest(page.request);
});

test('real backend persists the entire existing dining flow including a resized review photo', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/#profile');
  await page.getByLabel('Display name').fill('Live sample diner');
  await page.getByLabel('Budget per dish').fill('20');
  await page.getByLabel('Dietary & religious requirements').fill('Sample vegetarian preference');
  await page.getByRole('button', { name: 'Save taste profile' }).click();
  await expect(page.locator('#toast')).toContainText('to this server');
  await page.reload();
  await expect(page.getByLabel('Display name')).toHaveValue('Live sample diner');
  await page.goto('/#mood');
  await page.getByLabel('Comforting', { exact: true }).check();
  await page.getByRole('button', { name: 'Save craving & continue' }).click();
  await expect(page.locator('#view-menu')).toBeVisible();
  await page.getByLabel('Restaurant menu link').fill('https://example.com/menu');
  await page.getByRole('button', { name: 'Save menu link', exact: true }).click();
  await expect(page.locator('#menu-link-message')).toContainText('to this server');
  await page.goto('/#feedback');
  await page.getByLabel('Dish name').fill('Sample vegetable bowl');
  await page.getByLabel('Your rating').selectOption('4');
  await page.getByLabel('Your notes').fill('Sample crunchy vegetables');
  await page.locator('#meal-gallery').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('#meal-photo-message')).toContainText('Photo ready');
  await page.getByRole('button', { name: 'Save meal feedback' }).click();
  await expect(page.getByLabel('Dish name')).toHaveValue('');
  await page.reload();
  await expect(page.locator('#feedback-list')).toContainText('Sample vegetable bowl');
  await expect(page.locator('#feedback-list .review-photo')).toBeVisible();
  const saved = await (await page.request.get('/api/state')).json();
  expect(saved.state.profile.name).toBe('Live sample diner');
  expect(saved.state.mood).toBe('Comforting');
  expect(saved.state.menuUrl).toBe('https://example.com/menu');
  expect(saved.state.feedback[0].photo).toMatch(/^data:image\/jpeg;base64,/);
  expect(errors).toEqual([]);
});

test('independent browser contexts never share guest data', async ({ page, browser, baseURL }) => {
  await page.goto('/#profile');
  await page.getByLabel('Display name').fill('Only guest A');
  await page.getByRole('button', { name: 'Save taste profile' }).click();
  await expect(page.locator('#toast')).toContainText('to this server');
  const other = await browser.newContext({ baseURL });
  try {
    const privatePage = await other.newPage();
    await privatePage.goto('/#profile');
    await expect(privatePage.getByLabel('Display name')).toBeEnabled();
    await expect(privatePage.getByLabel('Display name')).toHaveValue('');
    await privatePage.getByLabel('Display name').fill('Only guest B');
    await privatePage.getByRole('button', { name: 'Save taste profile' }).click();
    await expect(privatePage.locator('#toast')).toContainText('to this server');
    await page.reload();
    await expect(page.getByLabel('Display name')).toHaveValue('Only guest A');
  } finally {
    await clearGuest(other.request);
    await other.close();
  }
});

test('a stale live tab cannot overwrite another tab', async ({ page, context }) => {
  await page.goto('/#profile');
  await expect(page.getByLabel('Display name')).toBeEnabled();
  const second = await context.newPage();
  await second.goto('/#profile');
  await expect(second.getByLabel('Display name')).toBeEnabled();
  await page.getByLabel('Display name').fill('Newer saved version');
  await page.getByRole('button', { name: 'Save taste profile' }).click();
  await expect(page.locator('#toast')).toContainText('to this server');
  await second.getByLabel('Display name').fill('Stale unsaved version');
  await second.getByRole('button', { name: 'Save taste profile' }).click();
  await expect(second.locator('#toast')).toContainText('Data changed in another tab');
  await expect(second.getByLabel('Display name')).toHaveValue('Stale unsaved version');
  const saved = await (await page.request.get('/api/state')).json();
  expect(saved.state.profile.name).toBe('Newer saved version');
  await second.close();
});

test('offline saves keep the craving and do not advance, then online retry works', async ({ page, context }) => {
  await page.goto('/#mood');
  await page.getByLabel("Or tell us what you're craving").fill('Sample warm noodles');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Save craving & continue' }).click();
  await expect(page.locator('#toast')).toContainText('Cannot reach the server');
  await expect(page.locator('#view-mood')).toBeVisible();
  await expect(page.getByLabel("Or tell us what you're craving")).toHaveValue('Sample warm noodles');
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Save craving & continue' }).click();
  await expect(page.locator('#view-menu')).toBeVisible();
});

test('confirmed clear is persisted for this live guest', async ({ page }) => {
  await page.goto('/#profile');
  await page.getByLabel('Display name').fill('Sample clear test');
  await page.getByRole('button', { name: 'Save taste profile' }).click();
  await expect(page.locator('#toast')).toContainText('to this server');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Clear saved data', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('Saved data cleared');
  await page.reload();
  await expect(page.getByLabel('Display name')).toHaveValue('');
});

test('server health exposes feature boundaries but no secrets or endpoints', async ({ page }) => {
  const response = await page.request.get('/api/health');
  const health = await response.json();
  expect(health.features).toEqual({ menu_extraction: false, recommendations: false, preference_learning: false });
  expect(JSON.stringify(health)).not.toMatch(/api_key|base_url|dobolyi|Bearer/i);
  for (const path of ['/.env', '/.git/config', '/data/forkcast.sqlite3', '/backend/main.py']) expect((await page.request.get(path)).status()).toBe(404);
  await page.goto('/#system');
  await expect(page.locator('#database-health')).toContainText('Ready');
  await expect(page.locator('#view-system')).toContainText('not a live AI availability check');
});
