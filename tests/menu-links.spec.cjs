const { test, expect } = require('@playwright/test');
const first = 'https://example.com/menu-one';
const second = 'https://example.com/menu-two';
const entry = (page, url) => page.getByRole('listitem', { name: `Saved menu: ${url}`, exact: true });

// Real browser-only storage, not a simulated saved list.
test('multiple saved menu links survive reload, reject duplicates, and remove independently', async ({ page }) => {
  await page.goto('/#menu');
  for (const url of [first, second]) {
    await page.getByLabel('Restaurant menu link').fill(url);
    await page.getByRole('button', { name: 'Save menu link', exact: true }).click();
    await expect(entry(page, url)).toBeVisible();
  }
  await expect(page.locator('.saved-menu-entry')).toHaveCount(2);
  await page.reload();
  await expect(entry(page, first)).toBeVisible();
  await expect(entry(page, second)).toBeVisible();
  await page.getByLabel('Restaurant menu link').fill(first);
  await page.getByRole('button', { name: 'Save menu link', exact: true }).click();
  await expect(page.locator('#menu-link-message')).toContainText('already saved');
  await expect(page.locator('.saved-menu-entry')).toHaveCount(2);
  await entry(page, first).getByRole('button', { name: 'Remove saved link', exact: true }).click();
  await expect(entry(page, first)).toHaveCount(0);
  await expect(entry(page, second)).toBeVisible();
  await page.reload();
  await expect(page.locator('.saved-menu-entry')).toHaveCount(1);
  await expect(entry(page, second).getByRole('link', { name: 'Visit website (new tab)', exact: true })).toHaveAttribute('href', second);
});

test('a legacy single link becomes the first saved entry without losing it', async ({ page }) => {
  await page.addInitScript(url => {
    if (!localStorage.getItem('forkcast.draft.v1')) localStorage.setItem('forkcast.draft.v1', JSON.stringify({ profile: {}, mood: '', craving: '', feedback: [], menuUrl: url }));
  }, first);
  await page.goto('/#menu');
  await expect(entry(page, first)).toBeVisible();
  await page.getByLabel('Restaurant menu link').fill(second);
  await page.getByRole('button', { name: 'Save menu link', exact: true }).click();
  await expect(page.locator('.saved-menu-entry')).toHaveCount(2);
  await page.reload();
  await expect(entry(page, first)).toBeVisible();
  await expect(entry(page, second)).toBeVisible();
});

for (const legacy of ['https://EXAMPLE.com:443/menu', 'https://example.com']) {
  test(`removing noncanonical legacy link ${legacy} persists without reviving it`, async ({ page }) => {
    const canonical = new URL(legacy).href;
    await page.addInitScript(url => {
      if (!localStorage.getItem('forkcast.draft.v1')) localStorage.setItem('forkcast.draft.v1', JSON.stringify({ profile: {}, mood: '', craving: '', feedback: [], menuUrl: url }));
    }, legacy);
    await page.goto('/#menu');
    await expect(entry(page, canonical)).toBeVisible();
    await entry(page, canonical).getByRole('button', { name: 'Remove saved link', exact: true }).click();
    await expect(page.locator('#menu-link-message')).toContainText('Saved link removed:');
    await page.reload();
    await expect(page.getByLabel('Restaurant menu link')).toBeEnabled();
    await expect(page.locator('.saved-menu-entry')).toHaveCount(0);
    await expect(entry(page, canonical)).toHaveCount(0);
    await page.getByLabel('Restaurant menu link').fill(second);
    await page.getByRole('button', { name: 'Save menu link', exact: true }).click();
    await expect(entry(page, second)).toBeVisible();
    await expect(page.locator('.saved-menu-entry')).toHaveCount(1);
    await expect(entry(page, canonical)).toHaveCount(0);
    await page.reload();
    await expect(entry(page, second)).toBeVisible();
    await expect(page.locator('.saved-menu-entry')).toHaveCount(1);
    await expect(entry(page, canonical)).toHaveCount(0);
  });
}
