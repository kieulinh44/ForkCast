const { test, expect } = require('@playwright/test');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

async function startPhotoAndProfileSave(page) {
  const api = { writes: 0, pending: false, state: { profile: {}, mood: '', craving: '', feedback: [], menuUrl: '' } };
  const saved = new Promise(resolve => { api.release = resolve; });
  await page.route('**/api/health', route => route.fulfill({ json: { ok: true, database: { ok: true, schema_version: 1 }, services: {} } }));
  await page.route('**/api/state', async route => {
    if (route.request().method() === 'PUT') {
      api.pending = true;
      await saved;
      api.state = route.request().postDataJSON().state;
      api.writes++;
    }
    await route.fulfill({ json: { state: api.state, revision: api.writes } });
  });
  await page.addInitScript(() => {
    const decode = HTMLImageElement.prototype.decode;
    const photo = new Promise(resolve => { window.releasePhoto = resolve; });
    HTMLImageElement.prototype.decode = async function () {
      await decode.call(this);
      window.photoPending = true;
      const fail = await photo;
      if (fail) throw new Error('Controlled photo failure');
    };
  });
  await page.goto('/#feedback');
  await page.getByLabel('Dish name').fill('Keep my bowl');
  await page.getByLabel('Your rating').selectOption('4');
  await page.getByLabel('Your notes').fill('Keep my notes');
  await page.locator('#meal-gallery').setInputFiles({ name: 'meal.png', mimeType: 'image/png', buffer: png });
  await expect.poll(() => page.evaluate(() => window.photoPending)).toBe(true);
  await page.getByRole('button', { name: 'Taste profile', exact: true }).click();
  await page.getByLabel('Display name').fill('Pending diner');
  await page.getByRole('button', { name: 'Save taste profile' }).click();
  await expect.poll(() => api.pending).toBe(true);
  await page.getByRole('button', { name: 'Meal history', exact: true }).click();
  await expect(page.getByLabel('Dish name')).toBeDisabled();
  return api;
}

for (const outcome of ['ready', 'error']) {
  test(`photo ${outcome} cannot unlock feedback during a pending profile save`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const api = await startPhotoAndProfileSave(page);
    await page.evaluate(fail => window.releasePhoto(fail), outcome === 'error');
    await expect(page.locator('#meal-photo-message')).toContainText(outcome === 'ready' ? 'Photo ready' : 'could not be opened');
    await expect.soft(page.getByRole('button', { name: 'Save meal feedback' })).toBeDisabled();
    await expect(page.getByLabel('Dish name')).toBeDisabled();
    // requestSubmit can dispatch even when native validation skips disabled fields.
    await page.locator('#feedback-form').evaluate(async form => {
      form.requestSubmit();
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect.soft(errors).toEqual([]);
    await expect(page.getByLabel('Dish name')).toHaveValue('Keep my bowl');
    await expect(page.getByLabel('Your notes')).toHaveValue('Keep my notes');
    expect(api.writes).toBe(0);
    api.release();
    await expect(page.getByLabel('Dish name')).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Save meal feedback' })).toBeEnabled();
    expect(api.writes).toBe(1);
    expect(api.state.feedback).toEqual([]);
    expect(api.state.profile.name).toBe('Pending diner');
    if (outcome === 'ready') {
      await expect(page.locator('#meal-photo-message')).toHaveText('Photo ready. Save your review and photo to this server for this guest browser.');
      await expect(page.locator('#meal-photo-preview')).toBeVisible();
    } else {
      await expect(page.locator('#meal-photo-preview')).toBeHidden();
    }
  });
}

test('finishing a save keeps feedback locked until its photo is prepared', async ({ page }) => {
  const api = await startPhotoAndProfileSave(page);
  api.release();
  await expect(page.getByLabel('Dish name')).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Save meal feedback' })).toBeDisabled();
  await page.locator('#feedback-form').evaluate(form => form.requestSubmit());
  await expect(page.locator('#toast')).toContainText('Please wait while your photo is prepared.');
  expect(api.writes).toBe(1);
  await expect(page.getByLabel('Dish name')).toHaveValue('Keep my bowl');
  await page.evaluate(() => window.releasePhoto(false));
  await expect(page.getByRole('button', { name: 'Save meal feedback' })).toBeEnabled();
});
