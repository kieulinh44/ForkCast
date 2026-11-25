const { test, expect } = require('@playwright/test');

test('Corner Diner navigation exposes honest picks and learned-preferences screens', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Not sure what to order?' })).toBeVisible();
  await page.getByRole('button', { name: 'Dish recommendations', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dish recommendations' })).toBeVisible();
  await expect(page.locator('#view-picks')).toContainText('not connected');
  await page.getByRole('button', { name: 'Learned preferences', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your taste, getting clearer.' })).toBeVisible();
  await expect(page.locator('#view-preferences')).toContainText('not connected');
  await expect(page.locator('#view-preferences')).toContainText('never override');
});

test('mobile navigation opens, closes after selection, and supports Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Menu', exact: true });
  const nav = page.getByRole('navigation', { name: 'Main navigation', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(nav).toBeHidden();
  await toggle.click();
  await expect(nav).toBeVisible();
  await page.getByRole('button', { name: 'Restaurant menu', exact: true }).click();
  await expect(page.locator('#view-menu')).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(nav).toBeHidden();
  await toggle.click();
  await page.keyboard.press('Escape');
  await expect(nav).toBeHidden();
  await expect(toggle).toBeFocused();
});

test('failed profile persistence is not labelled as saved on Overview', async ({ page }) => {
  await page.goto('/#profile');
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('full'); }; });
  await page.getByLabel('Display name').fill('Sample diner');
  await page.getByRole('button', { name: 'Save taste profile' }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.locator('#profile-status')).toHaveText('Profile not saved');
});

test('clearing drafts also removes the current menu preview', async ({ page }) => {
  await page.goto('/#menu');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  await page.locator('#menu-file').setInputFiles({ name: 'menu.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('#menu-preview')).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Clear local drafts' }).click();
  await expect(page.locator('#menu-preview')).toBeHidden();
  await expect(page.locator('#menu-file')).toHaveValue('');
});

test('Overview distinguishes a saved menu link from an analysed menu', async ({ page }) => {
  await page.goto('/#menu');
  await page.getByLabel('Restaurant menu link').fill('https://example.com/menu');
  await page.getByRole('button', { name: 'Save menu link', exact: true }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.locator('#menu-status')).toHaveText('Link saved · not read');
});

test('failed craving persistence stays visibly unsaved', async ({ page }) => {
  await page.goto('/#mood');
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('full'); }; });
  await page.getByLabel("Or tell us what you're craving").fill('Something tangy');
  await page.getByRole('button', { name: 'Save craving & continue' }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.locator('#mood-status')).toHaveText('Craving not saved');
});

test('desktop uses visible navigation without a redundant mobile Menu button', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('#nav-toggle')).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'Main navigation', exact: true })).toBeVisible();
});
