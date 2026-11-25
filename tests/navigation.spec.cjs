const { test, expect } = require('@playwright/test');

test('Home breadcrumb returns to Home from every tab with mouse and keyboard', async ({ page }) => {
  for (const view of ['brief', 'profile', 'menu', 'mood', 'picks', 'feedback', 'preferences', 'system']) {
    await page.goto(`/#${view}`);
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb', exact: true });
    const workspace = breadcrumb.getByRole('link', { name: 'Home', exact: true });
    await expect(workspace).toHaveAttribute('href', '#overview');
    await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText(await page.locator('#breadcrumb').textContent());
    await workspace.click();
    await expect(page.locator('#view-overview')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.goBack();
    await expect(page.locator(`#view-${view}`)).toBeVisible();
    await workspace.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#view-overview')).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#brief');
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.locator('#view-overview')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
