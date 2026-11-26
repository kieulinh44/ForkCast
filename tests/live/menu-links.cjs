const { test, expect } = require('@playwright/test');
const entry = (page, url) => page.getByRole('listitem', { name: `Saved menu: ${url}`, exact: true });
test.afterEach(async ({ page }) => {
  const response = await page.request.get('/api/state');
  if (!response.ok()) return;
  const state = await response.json();
  await page.request.delete('/api/state', { headers: { 'X-ForkCast-Request': '1' }, data: { revision: state.revision } });
});

test('SQLite saves multiple menus, keeps legacy links, and removes only the requested menu', async ({ page }) => {
  const first = 'https://example.com/legacy-menu';
  const second = 'https://other.example/dinner-menu';
  const initial = await (await page.request.get('/api/state')).json();
  const response = await page.request.put('/api/state', { headers: { 'X-ForkCast-Request': '1' }, data: { revision: initial.revision, state: { ...initial.state, menuUrl: first } } });
  expect(response.ok()).toBe(true);
  await page.goto('/#menu');
  await expect(entry(page, first)).toBeVisible();
  await page.getByLabel('Restaurant menu link').fill(second);
  await page.getByRole('button', { name: 'Save menu link', exact: true }).click();
  await expect(entry(page, second)).toBeVisible();
  await page.reload();
  await expect(page.locator('.saved-menu-entry')).toHaveCount(2);
  const saved = await (await page.request.get('/api/state')).json();
  expect(saved.state.menuUrls).toEqual([first, second]);
  await page.getByLabel('Restaurant menu link').fill(second);
  await page.getByRole('button', { name: 'Save menu link', exact: true }).click();
  await expect(page.locator('#menu-link-message')).toContainText('already saved');
  expect((await (await page.request.get('/api/state')).json()).revision).toBe(saved.revision);
  await entry(page, first).getByRole('button', { name: 'Remove saved link', exact: true }).click();
  await expect(page.locator('.saved-menu-entry')).toHaveCount(1);
  await expect(entry(page, second)).toBeVisible();
  await page.reload();
  await expect(entry(page, second)).toBeVisible();
  expect((await (await page.request.get('/api/state')).json()).state.menuUrls).toEqual([second]);
});
