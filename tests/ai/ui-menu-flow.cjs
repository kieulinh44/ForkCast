const { test, expect } = require('@playwright/test');
const path = require('node:path');
const truth = require('../fixtures/sample-menu.expected.json');

test('real user photo-review-generate flow works with the configured class models', async ({ page }, info) => {
  const errors = [];
  const calls = { extract: 0, recommend: 0 };
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path === '/api/menu/extract') calls.extract++;
    if (request.method() === 'POST' && path === '/api/recommendations') calls.recommend++;
  });
  try {
    await page.goto('/#profile');
    await page.getByLabel('Display name').fill('Synthetic menu tester');
    await page.getByLabel('Budget currency', { exact: true }).selectOption('USD');
    await page.getByLabel('Budget per dish (USD)', { exact: true }).fill('20');
    await page.getByLabel('Favorite foods').fill('Lentils, lemon');
    await page.getByLabel('Foods you dislike').fill('Mushrooms');
    await page.getByLabel('Dietary & religious requirements').fill('Vegetarian');
    await page.getByLabel('Allergies', { exact: true }).fill('Peanuts');
    await page.getByRole('button', { name: 'Save taste profile' }).click();
    await expect(page.locator('#toast')).toContainText('to this server');
    await page.getByRole('button', { name: 'Cravings', exact: true }).click();
    await page.getByLabel('Light', { exact: true }).check();
    await page.getByLabel("Or tell us what you're craving").fill(truth.sample_craving);
    await page.getByRole('button', { name: 'Save craving & continue' }).click();
    await expect(page.locator('#view-menu')).toBeVisible();
    await page.locator('#menu-file').setInputFiles(path.join(__dirname, '../fixtures/sample-menu.png'));
    await expect(page.locator('#menu-preview')).toBeVisible();
    expect(calls).toEqual({ extract: 0, recommend: 0 });
    await page.getByRole('button', { name: 'Analyze photo with AI', exact: true }).click();
    await expect(page.getByLabel('Dish 1 name', { exact: true })).toHaveValue('Herb Lentil Bowl', { timeout: 120000 });
    for (const [index, dish] of truth.items.entries()) {
      await expect(page.getByLabel(`Dish ${index + 1} name`, { exact: true })).toHaveValue(dish.name);
      await expect(page.getByLabel(`Dish ${index + 1} price`, { exact: true })).toHaveValue(dish.price === null ? '' : String(dish.price));
    }
    await expect(page.locator('#continue-menu')).toBeDisabled();
    await expect(page.locator('#generate-recommendations')).toBeDisabled();
    await page.getByLabel('Dish 1 price', { exact: true }).fill('13.25');
    await page.getByRole('button', { name: 'Save reviewed menu', exact: true }).click();
    await expect(page.locator('#review-status')).toContainText('Reviewed menu saved');
    await page.getByRole('button', { name: 'Continue to dish recommendations', exact: true }).click();
    await page.getByRole('button', { name: 'Generate recommendations', exact: true }).click();
    await expect(page.locator('.recommendation-card').first()).toBeVisible({ timeout: 120000 });
    const names = await page.locator('.recommendation-card h2').allTextContents();
    expect(names.length).toBeGreaterThan(0);
    expect(names.length).toBeLessThanOrEqual(3);
    names.forEach(name => expect(truth.remaining_choices).toContain(name));
    const lentils = page.locator('.recommendation-card').filter({ has: page.getByRole('heading', { name: 'Herb Lentil Bowl', exact: true }) });
    if (names.includes('Herb Lentil Bowl')) await expect(lentils).toContainText('13.25 USD');
    const salad = page.locator('.recommendation-card').filter({ has: page.getByRole('heading', { name: 'Garden Side Salad', exact: true }) });
    if (names.includes('Garden Side Salad')) {
      await expect(salad).toContainText('Price unknown');
      await expect(salad).toContainText('Budget cannot be verified');
    }
    expect(calls).toEqual({ extract: 1, recommend: 1 });
    await page.screenshot({ path: process.env.HOME + '/.hermes/cache/scratch/forkcast-step2-real-picks.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: process.env.HOME + '/.hermes/cache/scratch/forkcast-step2-real-mobile.png', fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.reload();
    await expect(page.locator('.recommendation-card h2')).toHaveText(names);
    await page.goto('/#menu');
    await expect(page.getByLabel('Dish 1 price', { exact: true })).toHaveValue('13.25');
    await expect(page.getByLabel('Dish 5 price', { exact: true })).toHaveValue('');
    await page.screenshot({ path: process.env.HOME + '/.hermes/cache/scratch/forkcast-step2-real-editor.png', fullPage: true });
    expect(errors).toEqual([]);
    await info.attach('actual-ui-result', { body: JSON.stringify({ names, calls, pageErrors: errors }), contentType: 'application/json' });
  } finally {
    const response = await page.request.get('/api/state');
    if (response.ok()) {
      const current = await response.json();
      await page.request.delete('/api/state', { headers: { 'X-ForkCast-Request': '1' }, data: { revision: current.revision } });
    }
  }
});
