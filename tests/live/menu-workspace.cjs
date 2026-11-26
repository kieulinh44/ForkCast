const { test, expect } = require('@playwright/test');
const headers = { 'X-ForkCast-Request': '1' };
async function start(request) {
  const state = await (await request.get('/api/state')).json();
  const workflow = await (await request.get('/api/menu')).json();
  const response = await request.put('/api/menu', { headers, data: { menu_revision: workflow.menu_revision, state_revision: state.revision, menu: { restaurant_name: 'Sample manual cafe', currency: 'USD', items: [{ name: 'Rice bowl', description: 'Rice, beans, and lemon', price: 12, price_note: '' }, { name: 'Side salad', description: 'Lettuce and tomatoes', price: null, price_note: 'Ask for current price' }] } } });
  expect(response.status()).toBe(200);
  return response.json();
}
async function clear(request) {
  const response = await request.get('/api/state');
  if (response.ok()) await request.delete('/api/state', { headers, data: { revision: (await response.json()).revision } });
}
test.afterEach(async ({ page }) => { await clear(page.request); });

test('real reviewed menu edits persist and stay isolated from another guest', async ({ page, browser, baseURL }) => {
  await start(page.request);
  await page.goto('/#menu');
  await expect(page.getByLabel('Dish 1 name', { exact: true })).toHaveValue('Rice bowl');
  await expect(page.getByLabel('Dish 2 price', { exact: true })).toHaveValue('');
  await page.getByLabel('Dish 1 name', { exact: true }).fill('Corrected rice bowl');
  await page.getByRole('button', { name: 'Save reviewed menu', exact: true }).click();
  await expect(page.locator('#review-status')).toContainText('Reviewed menu saved');
  await page.reload();
  await expect(page.getByLabel('Dish 1 name', { exact: true })).toHaveValue('Corrected rice bowl');
  const other = await browser.newContext({ baseURL });
  try {
    await other.request.get('/api/state');
    const empty = await (await other.request.get('/api/menu')).json();
    expect(empty.menu).toBeNull();
    expect(empty.recommendations).toBeNull();
  } finally { await clear(other.request); await other.close(); }
});

test('real menu conflicts preserve stale-tab input instead of overwriting', async ({ page, context }) => {
  await start(page.request);
  await page.goto('/#menu');
  await expect(page.getByLabel('Dish 1 name', { exact: true })).toHaveValue('Rice bowl');
  const second = await context.newPage();
  await second.goto('/#menu');
  await expect(second.getByLabel('Dish 1 name', { exact: true })).toHaveValue('Rice bowl');
  await page.getByLabel('Dish 1 name', { exact: true }).fill('Newer saved bowl');
  await page.locator('#save-reviewed').click();
  await expect(page.locator('#review-status')).toContainText('Reviewed menu saved');
  await second.getByLabel('Dish 1 name', { exact: true }).fill('Stale unsaved bowl');
  await second.locator('#save-reviewed').click();
  await expect(second.locator('#workflow-message')).toContainText('another tab');
  await expect(second.getByLabel('Dish 1 name', { exact: true })).toHaveValue('Stale unsaved bowl');
  const current = await (await page.request.get('/api/menu')).json();
  expect(current.menu.items[0].name).toBe('Newer saved bowl');
  await second.close();
});

test('real invalid photo preserves menu and clear-all removes its persisted workflow', async ({ page }) => {
  const initial = await start(page.request);
  const response = await page.request.post('/api/menu/extract', { headers, data: { menu_revision: initial.menu_revision, state_revision: initial.state_revision, image_data: 'data:image/jpeg;base64,aGVsbG8=' } });
  expect(response.status()).toBe(422);
  expect((await (await page.request.get('/api/menu')).json()).menu).toEqual(initial.menu);
  await page.goto('/#menu');
  await expect(page.getByLabel('Dish 1 name', { exact: true })).toHaveValue('Rice bowl');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Clear saved data', exact: true }).click();
  await expect(page.locator('#menu-editor')).toBeHidden();
  await page.reload();
  await expect(page.locator('#manual-menu')).toBeEnabled();
  await expect(page.locator('#menu-editor')).toBeHidden();
  const empty = await (await page.request.get('/api/menu')).json();
  expect(empty.menu).toBeNull();
  expect(empty.recommendations).toBeNull();
});
