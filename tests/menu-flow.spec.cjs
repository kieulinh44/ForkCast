const { test, expect } = require('@playwright/test');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
async function setup(page) {
  const api = { state: {profile:{},mood:'Comforting',craving:'warm soup',feedback:[],menuUrl:''}, revision:0, menu_revision:0, menu:null,recommendations:null, calls:[],fail:'', hold:null };
  await page.route('**/api/health', r => r.fulfill({json:{ok:true,database:{ok:true,schema_version:2},services:{},features:{menu_extraction:true,recommendations:true}}}));
  await page.route('**/api/state', async r => { if(r.request().method()==='PUT'){api.state=r.request().postDataJSON().state;api.revision++;} if(r.request().method()==='DELETE'){api.state={profile:{},mood:'',craving:'',feedback:[],menuUrl:''};api.revision++;api.menu=null;api.recommendations=null;api.menu_revision++;} await r.fulfill({json:{state:api.state,revision:api.revision}}); });
  await page.route(/\/api\/(menu(?:\/extract)?|recommendations)$/, async r => {
    const method=r.request().method(), path=new URL(r.request().url()).pathname;
    api.calls.push({method,path,body:method==='GET'?null:r.request().postDataJSON()});
    if(api.hold && method!=='GET') await api.hold;
    if(api.fail && method!=='GET') return r.fulfill({status:api.fail==='conflict'?409:502,json:{detail:'private raw upstream error'}});
    if(method==='DELETE'){api.menu=null;api.recommendations=null;api.menu_revision++;}
    if(method==='PUT'){api.menu={...r.request().postDataJSON().menu,items:r.request().postDataJSON().menu.items.map((x,i)=>({...x,id:x.id||`dish-${i}`})),reviewed:true,source:r.request().postDataJSON().manual_replacement || !api.menu ? 'manual' : api.menu.source,warnings:[]};api.recommendations=null;api.menu_revision++;}
    if(path.endsWith('/extract')){api.menu={restaurant_name:'Sample Diner',currency:null,items:[{id:'photo-1',name:'Soup <script>',description:'Warm tomato soup',price:null,price_note:'Price unclear'}],reviewed:false,source:'photo',warnings:['Check unclear prices']};api.menu_revision++;api.recommendations=null;}
    if(path==='/api/recommendations'){const x=api.menu.items[0];api.recommendations={items:[{item_id:x.id,name:x.name,description:x.description,price:x.price,currency:api.menu.currency,reason:'Matches your saved craving.',evidence:x.description,budget_status:'unknown',cautions:['Confirm ingredients with staff.']}],message:'',excluded:[],warnings:[]};api.menu_revision++;}
    await r.fulfill({json:{menu_revision:api.menu_revision,state_revision:api.revision,menu:api.menu,recommendations:api.recommendations,context_changed:api.context_changed||false}});
  });
  await page.goto('/#menu');
  return api;
}
async function manual(page){await page.getByRole('button',{name:'Enter menu manually'}).click();await page.getByLabel('Dish 1 name',{exact:true}).fill('Tomato soup');await page.getByLabel('Dish 1 description',{exact:true}).fill('Warm tomato soup');}
test('manual review is required before explicit grounded generation',async({page})=>{const api=await setup(page);await manual(page);await expect(page.locator('#generate-recommendations')).toBeDisabled();await page.getByRole('button',{name:'Save reviewed menu',exact:true}).click();await expect(page.locator('#review-status')).toContainText('Reviewed menu saved');await page.getByRole('button',{name:'Continue to dish recommendations'}).click();await expect(page.locator('#recommendation-context')).toContainText('warm soup');await page.getByRole('button',{name:'Generate recommendations',exact:true}).click();await expect(page.locator('.recommendation-card')).toContainText('Tomato soup');await expect(page.locator('.recommendation-card')).toContainText('Price unknown');await expect(page.locator('.recommendation-card')).toContainText('Budget cannot be verified');expect(api.calls.filter(c=>c.path==='/api/recommendations')).toHaveLength(1);expect(api.menu.currency).toBeNull();expect(api.menu.items[0].price).toBeNull();});
test('photo stays local until Analyze, then editable extraction saves exact IDs and safe text',async({page})=>{
  const api=await setup(page);
  await page.locator('#menu-file').setInputFiles({name:'menu.png',mimeType:'image/png',buffer:png});
  await expect(page.locator('#menu-preview')).toBeVisible();
  expect(api.calls.filter(c=>c.path.endsWith('/extract'))).toHaveLength(0);
  await page.getByRole('button',{name:'Analyze photo with AI'}).click();
  await expect(page.getByLabel('Dish 1 name',{exact:true})).toHaveValue('Soup <script>');
  await expect(page.locator('#continue-menu')).toBeDisabled();
  await page.getByLabel('Dish 1 name',{exact:true}).fill('Corrected soup <img src=x>');
  await page.getByRole('button',{name:'Save reviewed menu',exact:true}).click();
  await expect(page.locator('#review-status')).toContainText('Reviewed menu saved');
  expect(api.menu.items[0].id).toBe('photo-1');
  expect(api.menu.source).toBe('photo');
  expect(api.calls.find(c=>c.method==='PUT').body.manual_replacement || false).toBe(false);
  expect(api.calls.find(c=>c.path.endsWith('/extract')).body.image_data).toMatch(/^data:image\/jpeg;base64,/);
  await page.locator('#continue-menu').click();
  await page.locator('#generate-recommendations').click();
  await expect(page.locator('.recommendation-card h2')).toHaveText('Corrected soup <img src=x>');
  await expect(page.locator('.recommendation-card img')).toHaveCount(0);
});
test('malformed AI results preserve the last valid menu and recommendation cards',async({page})=>{
  const api=await setup(page);await manual(page);await page.locator('#save-reviewed').click();await expect(page.locator('#review-status')).toContainText('Reviewed menu saved');await page.locator('#continue-menu').click();await page.locator('#generate-recommendations').click();await expect(page.locator('.recommendation-card')).toHaveCount(1);
  await page.route('**/api/recommendations',r=>r.fulfill({json:{menu_revision:99,state_revision:0,menu:api.menu,recommendations:{items:[{name:'FAKE'}]},context_changed:false}}));
  await page.locator('#generate-recommendations').click();
  await expect(page.locator('#recommendation-status')).toContainText('invalid');
  await expect(page.locator('.recommendation-card h2')).toHaveText('Tomato soup');
});
test('profile budget currency defaults to USD for old profiles and saves selected comparison currency',async({page})=>{
  const api=await setup(page);await page.goto('/#profile');
  await expect(page.getByLabel('Budget currency',{exact:true})).toHaveValue('USD');
  await page.getByLabel('Budget currency',{exact:true}).selectOption('CAD');
  await expect(page.getByLabel('Budget per dish (CAD)',{exact:true})).toBeVisible();
  await page.getByLabel('Budget per dish (CAD)',{exact:true}).fill('25');
  await page.getByRole('button',{name:'Save taste profile'}).click();
  await expect.poll(()=>api.state.profile.currency).toBe('CAD');
  await page.goto('/#system');
  await expect(page.locator('#features-health')).toContainText('Explicit photo analysis');
  expect(api.calls.filter(x=>x.method==='POST')).toHaveLength(0);
});
test('dirty editor survives background saved-state refresh and keeps current cards hidden',async({page})=>{
  await setup(page);await manual(page);await page.locator('#save-reviewed').click();await expect(page.locator('#review-status')).toContainText('Reviewed menu saved');await page.locator('#continue-menu').click();await page.locator('#generate-recommendations').click();await expect(page.locator('.recommendation-card')).toHaveCount(1);
  await page.goto('/#menu');await page.getByLabel('Dish 1 name',{exact:true}).fill('Unsaved soup');
  await page.goto('/#feedback');await page.getByLabel('Dish name',{exact:true}).fill('Meal note');await page.getByLabel('Your rating').selectOption('4');await page.getByRole('button',{name:'Save meal feedback'}).click();await expect(page.locator('#toast')).toContainText('saved');
  await page.goto('/#menu');await expect(page.getByLabel('Dish 1 name',{exact:true})).toHaveValue('Unsaved soup');await expect(page.locator('#review-status')).toContainText('Unsaved');
  await page.goto('/#picks');await expect(page.locator('.recommendation-card')).toHaveCount(0);await expect(page.locator('#generate-recommendations')).toBeDisabled();
});
test('unknown menu currency and price variants stay explicit on grounded cards',async({page})=>{
 const api=await setup(page);await manual(page);await page.getByLabel('Dish 1 price note',{exact:true}).fill('Cup or bowl; price varies');await page.getByLabel('Dish 1 price',{exact:true}).fill('12');await page.locator('#save-reviewed').click();await expect(page.locator('#review-status')).toContainText('Reviewed menu saved');await page.locator('#continue-menu').click();await page.locator('#generate-recommendations').click();await expect(page.locator('.recommendation-card')).toContainText('currency unknown');await expect(page.locator('.recommendation-card')).toContainText('Cup or bowl; price varies');expect(api.menu.currency).toBeNull();
});
test('menu-only clear requires confirmation and preserves saved craving',async({page})=>{
 const api=await setup(page);await manual(page);await page.locator('#save-reviewed').click();await expect(page.locator('#review-status')).toContainText('Reviewed menu saved');
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Clear menu and recommendations',exact:true}).click();expect(api.menu).not.toBeNull();
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Clear menu and recommendations',exact:true}).click();await expect(page.locator('#menu-editor')).toBeHidden();expect(api.menu).toBeNull();expect(api.state.craving).toBe('warm soup');
});
test('late background GET cannot overwrite a newer reviewed-menu save',async({page})=>{
 const api=await setup(page);await manual(page);await page.locator('#save-reviewed').click();await expect(page.locator('#review-status')).toContainText('Reviewed menu saved');
 let release;const held=new Promise(r=>release=r);let pending=false;const snapshot={menu_revision:api.menu_revision,state_revision:1,menu:structuredClone(api.menu),recommendations:null,context_changed:false};
 await page.route('**/api/menu',async r=>{if(r.request().method()!=='GET')return r.fallback();pending=true;await held;await r.fulfill({json:snapshot});});
 await page.goto('/#profile');await page.getByLabel('Display name').fill('Changed');await page.getByRole('button',{name:'Save taste profile'}).click();await expect.poll(()=>pending).toBe(true);await page.goto('/#menu');await page.getByLabel('Dish 1 name',{exact:true}).fill('Newer soup');await page.locator('#save-reviewed').click();await expect(page.locator('#review-status')).toContainText('Reviewed menu saved');release();await page.waitForTimeout(100);await expect(page.getByLabel('Dish 1 name',{exact:true})).toHaveValue('Newer soup');
});
test('failed save and AI generation can retry without losing input or prior results',async({page})=>{
 const api=await setup(page);await manual(page);api.fail='server';await page.locator('#save-reviewed').click();await expect(page.locator('#workflow-message')).toContainText('failed');await expect(page.getByLabel('Dish 1 name',{exact:true})).toHaveValue('Tomato soup');expect(api.menu).toBeNull();api.fail='';await page.locator('#save-reviewed').click();await expect(page.locator('#review-status')).toContainText('Reviewed menu saved');await page.locator('#continue-menu').click();await page.locator('#generate-recommendations').click();await expect(page.locator('.recommendation-card')).toHaveCount(1);api.fail='server';await page.locator('#generate-recommendations').click();await expect(page.locator('#recommendation-status')).toContainText('failed');await expect(page.locator('.recommendation-card h2')).toHaveText('Tomato soup');expect(await page.locator('body').textContent()).not.toContain('private raw upstream error');api.fail='';await page.locator('#generate-recommendations').click();await expect(page.locator('#recommendation-status')).toContainText('Suggestions');
});
test('empty, blank, and negative-price menus never reach the API; add/remove stays accessible',async({page})=>{
 const api=await setup(page);await manual(page);await page.getByRole('button',{name:'Remove dish 1',exact:true}).click();await page.locator('#save-reviewed').click();await expect(page.locator('#workflow-message')).toContainText('Add 1–40');expect(api.calls.filter(x=>x.method==='PUT')).toHaveLength(0);await page.getByRole('button',{name:'Add dish',exact:true}).click();await page.getByLabel('Dish 1 name',{exact:true}).fill('   ');await page.locator('#save-reviewed').click();expect(api.calls.filter(x=>x.method==='PUT')).toHaveLength(0);await page.getByLabel('Dish 1 name',{exact:true}).fill('Soup');await page.getByLabel('Dish 1 price',{exact:true}).fill('-1');await page.locator('#save-reviewed').click();expect(api.calls.filter(x=>x.method==='PUT')).toHaveLength(0);await page.getByRole('button',{name:'Add dish',exact:true}).click();await expect(page.getByLabel('Dish 2 name',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Remove dish 1',exact:true}).click();await expect(page.getByLabel('Dish 1 name',{exact:true})).toHaveValue('');
});
for(const outcome of ['ready','error']) test(`meal photo ${outcome} cannot unlock feedback during recommendation generation`,async({page})=>{
 await page.addInitScript(()=>{const original=HTMLImageElement.prototype.decode;const gate=new Promise(r=>window.releaseMeal=r);HTMLImageElement.prototype.decode=async function(){await original.call(this);window.photoPending=true;if(await gate)throw Error('bad photo');};});
 const api=await setup(page);await manual(page);await page.locator('#save-reviewed').click();await expect(page.locator('#review-status')).toContainText('Reviewed menu saved');await page.goto('/#feedback');await page.getByLabel('Dish name',{exact:true}).fill('Keep this note');await page.getByLabel('Your rating').selectOption('4');await page.locator('#meal-gallery').setInputFiles({name:'meal.png',mimeType:'image/png',buffer:png});await expect.poll(()=>page.evaluate(()=>window.photoPending)).toBe(true);
 let release;api.hold=new Promise(r=>release=r);await page.goto('/#picks');await page.locator('#generate-recommendations').click();await expect(page.locator('#generate-recommendations')).toBeDisabled();await page.evaluate(fail=>window.releaseMeal(fail),outcome==='error');await page.goto('/#feedback');await expect(page.getByRole('button',{name:'Save meal feedback'})).toBeDisabled();await page.locator('#feedback-form').evaluate(f=>f.requestSubmit());await expect(page.getByLabel('Dish name',{exact:true})).toHaveValue('Keep this note');expect(api.state.feedback).toEqual([]);release();await expect(page.getByRole('button',{name:'Save meal feedback'})).toBeEnabled();
});
test('rapid Generate clicks share the existing storage lock and send one request',async({page})=>{
 const api=await setup(page);await manual(page);await page.locator('#save-reviewed').click();await expect(page.locator('#review-status')).toContainText('Reviewed menu saved');await page.locator('#continue-menu').click();let release;api.hold=new Promise(r=>release=r);await page.locator('#generate-recommendations').evaluate(b=>{b.click();b.click();b.click();});await expect.poll(()=>api.calls.filter(x=>x.path==='/api/recommendations').length).toBe(1);await page.goto('/#profile');await expect(page.getByLabel('Display name')).toBeDisabled();await page.locator('#profile-form').evaluate(f=>f.requestSubmit());expect(api.state.profile).toEqual({});release();await expect(page.getByLabel('Display name')).toBeEnabled();
});
test('context changes hide stale results promptly and retain dirty menu edits',async({page})=>{
 const api=await setup(page);await manual(page);await page.locator('#save-reviewed').click();await expect(page.locator('#review-status')).toContainText('Reviewed menu saved');await page.locator('#continue-menu').click();await page.locator('#generate-recommendations').click();await expect(page.locator('.recommendation-card')).toHaveCount(1);api.recommendations=null;api.context_changed=true;await page.goto('/#profile');await page.getByLabel('Favorite foods').fill('noodles');await page.getByRole('button',{name:'Save taste profile'}).click();await expect(page.locator('#toast')).toContainText('saved');await page.goto('/#picks');await expect(page.locator('.recommendation-card')).toHaveCount(0);await expect(page.locator('#recommendation-status')).toContainText('changed');expect(api.calls.filter(x=>x.path==='/api/recommendations')).toHaveLength(1);await page.locator('#generate-recommendations').click();await expect(page.locator('.recommendation-card')).toHaveCount(1);
});
test('current guest clear resets menu, selected photo, editor and recommendations',async({page})=>{
 const api=await setup(page);await manual(page);await page.locator('#save-reviewed').click();await expect(page.locator('#review-status')).toContainText('Reviewed menu saved');await page.locator('#menu-file').setInputFiles({name:'menu.png',mimeType:'image/png',buffer:png});await expect(page.locator('#menu-preview')).toBeVisible();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Clear saved data',exact:true}).click();await expect(page.locator('#menu-editor')).toBeHidden();await expect(page.locator('#menu-preview')).toBeHidden();await expect(page.locator('#menu-file')).toHaveValue('');await page.goto('/#picks');await expect(page.locator('#generate-recommendations')).toBeDisabled();expect(api.menu).toBeNull();
});
test('409 preserves unsaved edits and requires reload instead of overwriting',async({page})=>{
 const api=await setup(page);await manual(page);api.fail='conflict';await page.locator('#save-reviewed').click();await expect(page.locator('#workflow-message')).toContainText('another tab');await expect(page.getByLabel('Dish 1 name',{exact:true})).toHaveValue('Tomato soup');await expect(page.locator('#continue-menu')).toBeDisabled();expect(api.menu).toBeNull();
});
test('menu loading failure offers an explicit retry without any AI request',async({page})=>{
 const api=await setup(page);await page.route('**/api/menu',r=>r.fulfill({status:503,json:{detail:'private'}}));await page.reload();await expect(page.locator('#workflow-message')).toContainText('failed');await expect(page.locator('#manual-menu')).toBeDisabled();await page.unroute('**/api/menu');await page.getByRole('button',{name:'Retry loading menu',exact:true}).click();await expect(page.locator('#manual-menu')).toBeEnabled();expect(api.calls.filter(x=>x.method==='POST')).toHaveLength(0);
});
test('server-mode home and system status distinguish implemented AI from unavailable preview and learning',async({page})=>{
 await setup(page);await page.goto('/#overview');await expect(page.locator('.hero-note')).toContainText('reviewed');await expect(page.locator('#view-overview .preview-note h3')).toHaveText('Read. Review. Choose.');await page.goto('/#system');await expect(page.locator('#features-health')).toContainText('learning');await page.goto('/#picks');await expect(page.locator('#recommendation-status')).toContainText('Save a reviewed menu');
});
test('dish editor uses a compact desktop grid and stacks without overflow at 320px', async ({ page }) => {
  const boxes = () => page.locator('.dish-editor label').evaluateAll(labels => labels.map(label => {
    const box = label.getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width };
  }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await setup(page);
  await manual(page);
  const desktop = await boxes();
  expect(Math.abs(desktop[0].top - desktop[1].top)).toBeLessThan(1);
  expect(desktop[1].left).toBeGreaterThan(desktop[0].left + desktop[0].width);
  await page.setViewportSize({ width: 320, height: 800 });
  const mobile = await boxes();
  for (let index = 1; index < mobile.length; index++) {
    expect(Math.abs(mobile[index].left - mobile[0].left)).toBeLessThan(1);
    expect(mobile[index].top).toBeGreaterThan(mobile[index - 1].top);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#save-reviewed').click();
  await expect(page.locator('#review-status')).toContainText('Reviewed menu saved');
  await page.locator('#continue-menu').click();
  await page.locator('#generate-recommendations').click();
  await expect(page.locator('.recommendation-card')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: process.env.HOME + '/.hermes/cache/scratch/forkcast-step2-mobile.png', fullPage: true });
});
for (const retry of [false, true]) test(`explicit manual replacement of a photo records manual provenance (retry=${retry})`, async ({ page }) => {
  const api = await setup(page);
  await page.locator('#menu-file').setInputFiles({name:'menu.png',mimeType:'image/png',buffer:png});
  await page.locator('#analyze-menu').click();
  await expect(page.getByLabel('Dish 1 name', {exact:true})).toHaveValue('Soup <script>');
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#manual-menu').click();
  await page.locator('#save-reviewed').click();
  await expect(page.locator('#review-status')).toContainText('Reviewed menu saved');
  expect(api.calls.filter(call => call.method === 'PUT').at(-1).body.manual_replacement || false).toBe(false);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#manual-menu').click();
  await page.getByLabel('Dish 1 name', {exact:true}).fill('Unrelated pasta');
  if (retry) {
    api.fail = 'server';
    await page.locator('#save-reviewed').click();
    await expect(page.locator('#workflow-message')).toContainText('failed');
    expect(api.calls.filter(call => call.method === 'PUT').at(-1).body.manual_replacement).toBe(true);
    api.fail = '';
    // A state-only refresh must retain the pending manual action and dirty editor.
    const response = page.waitForResponse(r => r.url().endsWith('/api/menu') && r.request().method() === 'GET');
    await page.evaluate(() => window.dispatchEvent(new Event('forkcast:saved')));
    await (await response).finished();
    await expect(page.getByLabel('Dish 1 name', {exact:true})).toHaveValue('Unrelated pasta');
  }
  await page.locator('#save-reviewed').click();
  await expect(page.locator('#review-status')).toContainText('Reviewed menu saved');
  expect(api.calls.filter(call => call.method === 'PUT').at(-1).body.manual_replacement).toBe(true);
  expect(api.menu.source).toBe('manual');
  await page.locator('#continue-menu').click();
  await expect(page.locator('#recommendation-context')).toContainText('Manually entered menu');
  // Acceptance resets intent: later ordinary edits must not send a replacement action.
  await page.goto('/#menu');
  await page.getByLabel('Dish 1 name', {exact:true}).fill('Edited pasta');
  await page.locator('#save-reviewed').click();
  await expect(page.locator('#review-status')).toContainText('Reviewed menu saved');
  expect(api.calls.filter(call => call.method === 'PUT').at(-1).body.manual_replacement || false).toBe(false);
});

module.exports={setup,manual,png};

test('recommendation context labels favorites, dislikes, dietary requirements and allergies separately', async ({ page }) => {
  const api = await setup(page);
  api.state.profile = { favorites: 'Lemon', dislikes: 'Mushrooms', dietary: 'Vegetarian', allergies: 'Peanuts', spice: 'Mild' };
  await page.reload();
  await manual(page);
  await page.locator('#save-reviewed').click();
  await expect(page.locator('#review-status')).toContainText('Reviewed menu saved');
  await page.locator('#continue-menu').click();
  for (const label of ['Favorites: Lemon', 'Dislikes: Mushrooms', 'Dietary needs: Vegetarian', 'Allergies: Peanuts', 'Spice preference: Mild']) await expect(page.locator('#recommendation-context')).toContainText(label);
});

test('late menu refresh from before a local feedback save is ignored without a false tab conflict', async ({ page }) => {
  const api = await setup(page);
  await manual(page);
  await page.locator('#save-reviewed').click();
  await expect(page.locator('#review-status')).toContainText('Reviewed menu saved');
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let pending = false;
  let first = true;
  const old = { menu_revision: api.menu_revision, state_revision: api.revision, menu: structuredClone(api.menu), recommendations: null, context_changed: false };
  await page.route('**/api/menu', async route => {
    if (route.request().method() !== 'GET' || !first) return route.fallback();
    first = false;
    pending = true;
    await held;
    await route.fulfill({ json: old });
  });
  await page.evaluate(() => window.dispatchEvent(new Event('forkcast:saved')));
  await expect.poll(() => pending).toBe(true);
  await page.goto('/#feedback');
  await page.getByLabel('Dish name', { exact: true }).fill('Saved note');
  await page.getByLabel('Your rating').selectOption('4');
  await page.getByRole('button', { name: 'Save meal feedback' }).click();
  await expect(page.locator('#toast')).toContainText('saved');
  const response = page.waitForResponse(response => response.url().endsWith('/api/menu') && response.request().method() === 'GET' && response.status() === 200 && response.request().timing().startTime > 0);
  release();
  await (await response).finished();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.goto('/#menu');
  await expect(page.locator('#workflow-message')).not.toContainText('another tab');
  await expect(page.getByLabel('Dish 1 name', { exact: true })).toHaveValue('Tomato soup');
});

test('clear-all confirmation explicitly includes reviewed menus and recommendations', async ({ page }) => {
  await setup(page);
  let prompt = '';
  page.once('dialog', dialog => { prompt = dialog.message(); return dialog.dismiss(); });
  await page.getByRole('button', { name: 'Clear saved data', exact: true }).click();
  expect(prompt).toContain('reviewed menu');
  expect(prompt).toContain('recommendations');
});

test('a background refresh cannot rebase unsaved edits onto another tab menu revision', async ({ page }) => {
  const api = await setup(page);
  await manual(page);
  await page.locator('#save-reviewed').click();
  await expect(page.locator('#review-status')).toContainText('Reviewed menu saved');
  const originalRevision = api.menu_revision;
  await page.getByLabel('Dish 1 name', { exact: true }).fill('Tab A unsaved edit');
  api.menu.items[0].name = 'Tab B newer saved edit';
  api.menu_revision += 1;
  let attemptedRevision = null;
  await page.route('**/api/menu', async route => {
    if (route.request().method() !== 'PUT') return route.fallback();
    attemptedRevision = route.request().postDataJSON().menu_revision;
    if (attemptedRevision !== api.menu_revision) return route.fulfill({ status: 409, json: { detail: 'State changed' } });
    return route.fallback();
  });
  await page.evaluate(() => window.dispatchEvent(new Event('forkcast:saved')));
  await expect(page.locator('#workflow-message')).toContainText('another tab');
  await expect(page.getByLabel('Dish 1 name', { exact: true })).toHaveValue('Tab A unsaved edit');
  await page.locator('#save-reviewed').click();
  await expect.poll(() => attemptedRevision).not.toBeNull();
  expect(attemptedRevision).toBe(originalRevision);
  expect(api.menu.items[0].name).toBe('Tab B newer saved edit');
});

test('Home shows the persisted menu review state instead of claiming it has not been read', async ({ page }) => {
  await setup(page);
  await manual(page);
  await page.locator('#save-reviewed').click();
  await expect(page.locator('#review-status')).toContainText('Reviewed menu saved');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.locator('#menu-status')).toHaveText('Reviewed menu · 1 dish');
});
