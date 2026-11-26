const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const expected = require('../fixtures/sample-menu.expected.json');
const headers = { 'X-ForkCast-Request': '1' };

test('actual Qwen photo extraction and DeepSeek recommendations remain grounded after review', async ({ page }, testInfo) => {
  let state = await (await page.request.get('/api/state')).json();
  try {
    let response = await page.request.get('/api/menu');
    expect(response.status(), 'Step-2 menu API must exist').toBe(200);
    let workflow = await response.json();
    response = await page.request.put('/api/state', { headers, data: { revision: state.revision, state: { ...state.state, profile: expected.sample_profile, mood: 'Light', craving: expected.sample_craving } } });
    expect(response.ok(), 'Synthetic profile must save').toBe(true);
    state = await response.json();
    const image = fs.readFileSync(path.join(__dirname, '../fixtures/sample-menu.png'));
    response = await page.request.post('/api/menu/extract', { headers, timeout: 120000, data: { image_data: 'data:image/png;base64,' + image.toString('base64'), menu_revision: workflow.menu_revision, state_revision: state.revision } });
    expect(response.status(), 'Actual vision extraction should succeed').toBe(200);
    workflow = await response.json();
    expect(workflow.menu.reviewed).toBe(false);
    expect(workflow.menu.currency).toBe('USD');
    const observed = Object.fromEntries(workflow.menu.items.map(item => [item.name, item.price]));
    expect(observed).toEqual(Object.fromEntries(expected.items.map(item => [item.name, item.price])));
    expect(new Set(workflow.menu.items.map(item => item.id)).size).toBe(expected.items.length);
    response = await page.request.post('/api/recommendations', { headers, data: { menu_revision: workflow.menu_revision, state_revision: state.revision } });
    expect([400, 409, 422], 'Unreviewed extraction must not generate recommendations').toContain(response.status());
    const reviewedMenu = { restaurant_name: workflow.menu.restaurant_name, currency: workflow.menu.currency, items: workflow.menu.items.map(item => ({ id: item.id, name: item.name, description: item.description, price: item.name === 'Herb Lentil Bowl' ? 11.75 : item.price, price_note: item.price_note })) };
    response = await page.request.put('/api/menu', { headers, data: { menu: reviewedMenu, menu_revision: workflow.menu_revision, state_revision: state.revision } });
    expect(response.status(), 'Reviewed menu should save').toBe(200);
    workflow = await response.json();
    expect(workflow.menu.reviewed).toBe(true);
    response = await page.request.post('/api/recommendations', { headers, timeout: 120000, data: { menu_revision: workflow.menu_revision, state_revision: state.revision } });
    expect(response.status(), 'Actual text recommendations should succeed').toBe(200);
    workflow = await response.json();
    const recommendations = workflow.recommendations;
    expect(recommendations.items.length).toBeGreaterThan(0);
    expect(recommendations.items.length).toBeLessThanOrEqual(3);
    const catalogue = new Map(workflow.menu.items.map(item => [item.id, item]));
    for (const item of recommendations.items) {
      expect(expected.remaining_choices).toContain(item.name);
      expect(catalogue.has(item.item_id)).toBe(true);
      const source = catalogue.get(item.item_id);
      expect(item.name).toBe(source.name);
      expect(item.price).toBe(source.price);
      expect((source.name + ' ' + source.description).includes(item.evidence)).toBe(true);
      expect(item.cautions.length).toBeGreaterThan(0);
      if (item.name === 'Garden Side Salad') {
        expect(item.price).toBeNull();
        expect(item.budget_status).toBe('unknown');
      }
      if (item.name === 'Herb Lentil Bowl') expect(item.price).toBe(11.75);
    }
    const names = recommendations.items.map(item => item.name);
    await testInfo.attach('actual-synthetic-menu-pipeline', { body: JSON.stringify({ observed, reviewedMenu, recommendations }, null, 2), contentType: 'application/json' });
    response = await page.request.get('/api/menu');
    expect((await response.json()).recommendations.items.map(item => item.name)).toEqual(names);
    // Direct source-to-result integration is verified above; UI reads the same persisted results.
    await page.goto('/#picks');
    await expect(page.locator('#view-picks')).toContainText(names[0]);
    // Relevant profile changes must invalidate old results, without another model call.
    response = await page.request.put('/api/state', { headers, data: { revision: state.revision, state: { ...state.state, profile: { ...expected.sample_profile, dislikes: 'Lentils, lettuce, mushrooms' }, mood: 'Light', craving: expected.sample_craving } } });
    expect(response.ok()).toBe(true);
    state = await response.json();
    response = await page.request.get('/api/menu');
    workflow = await response.json();
    expect(workflow.context_changed).toBe(true);
    expect(workflow.recommendations).toBeNull();
  } finally {
    const current = await (await page.request.get('/api/state')).json();
    await page.request.delete('/api/state', { headers, data: { revision: current.revision } });
  }
});
