const { test, expect } = require('@playwright/test');

test('a new visitor sees a plain-language craving-first ordering flow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Not sure what to order?' })).toBeVisible();
  await expect(page.locator('#view-overview .lede')).toContainText('restaurant');
  expect(await page.locator('#view-overview .journey-row').evaluateAll(items => items.map(x => x.dataset.view))).toEqual(['mood', 'menu', 'picks']);
  const navigation = page.getByRole('navigation', { name: 'Main navigation', exact: true });
  expect(await navigation.locator('button').allTextContents()).toEqual(['Home', 'Cravings', 'Restaurant menu', 'Dish recommendations', 'Taste profile', 'Meal history']);
  await page.getByRole('button', { name: 'What are you craving?', exact: true }).click();
  await expect(page.locator('#view-mood')).toBeVisible();
  await expect(page.locator('#view-mood .flow-steps [aria-current="step"]')).toContainText('Choose a craving');
});

test('saved craving continues to the restaurant menu and then recommendation status', async ({ page }) => {
  await page.goto('/#mood');
  await page.getByLabel('Comforting', { exact: true }).check();
  await page.getByRole('button', { name: 'Save craving & continue', exact: true }).click();
  await expect(page.locator('#view-menu')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb', exact: true })).toContainText('Restaurant menu');
  await expect(page.locator('#view-menu .flow-steps [aria-current="step"]')).toContainText('Add a restaurant menu');
  await page.getByRole('button', { name: 'Continue to dish recommendations', exact: true }).click();
  await expect(page.locator('#view-picks')).toBeVisible();
  await expect(page.locator('#view-picks')).toContainText('not connected');
  await page.getByRole('link', { name: 'Choose a craving', exact: false }).click();
  await expect(page.getByLabel('Comforting', { exact: true })).toBeChecked();
});

test('failed craving save does not advance or lose the entered craving', async ({ page }) => {
  await page.goto('/#mood');
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('full'); }; });
  await page.getByLabel("Or tell us what you're craving").fill('Warm noodles');
  await page.getByRole('button', { name: 'Save craving & continue', exact: true }).click();
  await expect(page.locator('#view-mood')).toBeVisible();
  await expect(page.getByLabel("Or tell us what you're craving")).toHaveValue('Warm noodles');
  await expect(page.locator('#toast')).toContainText('storage is unavailable');
});

test('interface copy uses American favorite spelling on every screen', async ({ page }) => {
  for (const view of ['overview', 'mood', 'menu', 'picks', 'profile', 'feedback', 'preferences']) {
    await page.goto('/#' + view);
    expect(await page.locator('body').textContent()).not.toMatch(/favourites?/i);
  }
});

test('mobile users can follow the journey with touch and keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'What are you craving?', exact: true }).click();
  await page.getByLabel("Or tell us what you're craving").fill('Something savory');
  await page.getByRole('button', { name: 'Save craving & continue', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#view-menu')).toBeVisible();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Dish recommendations', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#view-picks')).toBeVisible();
  await expect(page.locator('#nav-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#main')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
