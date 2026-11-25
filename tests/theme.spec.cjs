const { test, expect } = require('@playwright/test');

function contrast(hexA, hexB) {
  const luminance = hex => {
    const rgb = hex.replace('#', '').match(/../g).map(pair => parseInt(pair, 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const a = luminance(hexA);
  const b = luminance(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('Corner Diner theme preserves readable text and all nine views', async ({ page }) => {
  await page.goto('/');
  const palette = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(['paper', 'white', 'ink', 'muted', 'sage', 'accent'].map(key => [key, style.getPropertyValue(`--${key}`).trim()]));
  });
  expect(palette.paper).toBe('#fff0cf');
  expect(palette.ink).toBe('#213d62');
  for (const [foreground, background] of [['ink', 'paper'], ['muted', 'paper'], ['muted', 'white'], ['ink', 'sage'], ['white', 'ink'], ['white', 'accent'], ['accent', 'paper']]) {
    expect(contrast(palette[foreground], palette[background]), `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
  }
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    for (const view of ['overview', 'profile', 'menu', 'mood', 'picks', 'feedback', 'preferences', 'brief', 'system']) {
      await page.goto(`/#${view}`);
      await expect(page.locator(`#view-${view}`)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${view} at ${width}px`).toBe(true);
    }
  }
  await page.goto('/#overview');
  await expect(page.locator('.footer').getByText('Made by Linh · Jamie · Jana · Kelly · Mirina', { exact: false })).toBeVisible();
  await page.screenshot({ path: 'test-results/corner-diner-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/corner-diner-desktop.png', fullPage: true });
});
