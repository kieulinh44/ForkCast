const { test, expect } = require('@playwright/test');

test('Home displays the ForkCast logo instead of a broken food image on desktop and mobile', async ({ page }) => {
  await page.goto('/');
  const logo = page.getByRole('img', { name: 'ForkCast logo', exact: true });
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute('src', 'assets/forkcast-logo.svg');
  const response = await page.request.get('/assets/forkcast-logo.svg');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('image/svg+xml');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 950 });
    await expect(logo).toBeVisible();
    expect(await logo.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.hero-art').screenshot({ path: `test-results/forkcast-logo-${width}.png` });
  }
});
