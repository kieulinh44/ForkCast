/* Explicit, reviewed-menu workflow. All user/model text uses textContent. */
(() => {
  'use strict';
  const app = window.ForkCastApp;
  const $ = id => document.getElementById(id);
  let envelope = { menu_revision: 0, menu: null, recommendations: null };
  let dirty = false;
  let manualReplacement = false;
  let epoch = 0;
  let contextKey = '';
  let loaded = false;
  const picks = document.createElement('div');
  picks.id = 'menu-recommendations';
  picks.hidden = true;
  picks.innerHTML = '<div class="panel"><span class="outline-label">FROM YOUR REVIEWED MENU</span><h2>Your next order</h2><p id="recommendation-context"></p><p id="recommendation-status" role="status" aria-live="polite"></p><button id="generate-recommendations" class="primary" type="button" disabled>Generate recommendations</button></div><div id="recommendation-results"></div>';
  $('legacy-picks').after(picks);
  function text(tag, value, className) { const el = document.createElement(tag); el.textContent = value; if (className) el.className = className; return el; }
  function message(value) { $('workflow-message').textContent = value; }
  function update() {
    const available = app.mode === 'server' && app.ready && loaded;
    if (available) {
      const count = envelope.menu?.items.length || 0;
      const linkCount = app.menuLinks.length;
      $('menu-status').textContent = envelope.menu ? (envelope.menu.reviewed ? `Reviewed menu · ${count} ${count === 1 ? 'dish' : 'dishes'}` : `Review ${count} extracted ${count === 1 ? 'dish' : 'dishes'}`) : !$('menu-preview').hidden ? 'Photo preview · not read' : linkCount ? (linkCount === 1 ? 'Link saved · not read' : `${linkCount} links saved · not read`) : 'Add a restaurant menu';
    }
    const locked = !available || app.busy;
    $('retry-menu').hidden = app.mode !== 'server' || loaded;
    $('retry-menu').disabled = app.busy;
    $('manual-menu').disabled = locked;
    $('clear-menu').disabled = locked;
    $('analyze-menu').disabled = locked || !$('menu-file').files[0] || $('menu-preview').hidden;
    $('menu-file').disabled = locked && app.mode === 'server';
    $('remove-photo').disabled = app.busy;
    $('save-reviewed').disabled = locked;
    $('add-dish').disabled = locked || $('menu-dishes').children.length >= 40;
    $('generate-recommendations').disabled = locked || dirty || !envelope.menu?.reviewed || !envelope.menu.items.length;
    $('continue-menu').disabled = app.mode === 'server' && (locked || dirty || !envelope.menu?.reviewed);
  }
  function editor(menu) {
    $('menu-editor').hidden = !menu;
    if (!menu) { $('menu-dishes').replaceChildren(); return; }
    $('restaurant-name').value = menu.restaurant_name || '';
    if (menu.currency && !Array.from($('menu-currency').options).some(o => o.value === menu.currency)) $('menu-currency').add(new Option(menu.currency, menu.currency));
    $('menu-currency').value = menu.currency || '';
    $('menu-dishes').replaceChildren();
    menu.items.forEach(addDish);
    $('review-status').textContent = menu.reviewed ? 'Reviewed menu saved · ' + menu.source : 'Not reviewed · Check extraction and save reviewed menu.';
    for (const warning of menu.warnings || []) $('review-status').append(text('span', ' ' + warning));
  }
  function addDish(item = {}) {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'dish-editor';
    fieldset.dataset.itemId = item.id || '';
    const legend = text('legend', '');
    fieldset.append(legend);
    for (const [key, label, limit] of [['name','name',160],['description','description',2000],['price','price',20],['price_note','price note',300]]) {
      const wrapper = text('label', '');
      const caption = text('span', label);
      const input = document.createElement(key === 'description' ? 'textarea' : 'input');
      input.dataset.field = key;
      input.value = item[key] ?? '';
      if (key === 'price') { input.type = 'number'; input.min = '0'; input.step = '0.01'; input.placeholder = 'Unknown — leave blank'; }
      else input.maxLength = limit;
      if (key === 'name') input.required = true;
      wrapper.append(caption, input);
      fieldset.append(wrapper);
    }
    const remove = text('button', 'Remove dish', 'text-button');
    remove.type = 'button';
    remove.addEventListener('click', () => { fieldset.remove(); renumber(); changed(); });
    fieldset.append(remove);
    $('menu-dishes').append(fieldset);
    renumber();
  }
  function renumber() {
    Array.from($('menu-dishes').children).forEach((row, i) => {
      row.querySelector('legend').textContent = `Dish ${i + 1}`;
      row.querySelectorAll('label').forEach(label => { label.firstChild.textContent = `Dish ${i + 1} ${label.querySelector('[data-field]').dataset.field.replace('_',' ')}`; });
      row.querySelector('button').setAttribute('aria-label', `Remove dish ${i + 1}`);
    });
  }
  function changed() {
    dirty = true;
    $('review-status').textContent = 'Unsaved changes · Save reviewed menu before continuing.';
    $('recommendation-results').replaceChildren();
    $('recommendation-status').textContent = 'Menu changed. Save reviewed menu, then regenerate.';
    update();
  }
  function readMenu() {
    const items = Array.from($('menu-dishes').children).map(row => {
      const item = { id: row.dataset.itemId || null };
      row.querySelectorAll('[data-field]').forEach(input => { item[input.dataset.field] = input.dataset.field === 'price' ? (input.value.trim() === '' ? null : Number(input.value)) : input.value.trim(); });
      return item;
    });
    if (!items.length || items.length > 40 || items.some(x => !x.name || (x.price !== null && (!Number.isFinite(x.price) || x.price < 0)))) throw new Error('Add 1–40 named dishes with valid nonnegative prices, or leave unknown prices blank.');
    return { restaurant_name: $('restaurant-name').value.trim(), currency: $('menu-currency').value || null, items };
  }
  function renderResults() {
    const target = $('recommendation-results');
    target.replaceChildren();
    const { profile, mood, craving } = app.context;
    const budget = profile.budget ? `Budget ${profile.budget} ${profile.currency || 'USD'} per dish (no currency conversion).` : 'No budget saved.';
    const sourceLabel = envelope.menu?.source === 'photo' ? 'Uploaded menu photo' : envelope.menu?.source === 'manual' ? 'Manually entered menu' : 'No menu';
    const preferences = [['Favorites', 'favorites'], ['Dislikes', 'dislikes'], ['Dietary needs', 'dietary'], ['Allergies', 'allergies'], ['Spice preference', 'spice']].map(([label, key]) => `${label}: ${profile[key] || 'Not provided'}`).join('; ');
    $('recommendation-context').textContent = `${envelope.menu?.restaurant_name || 'Restaurant name not provided'} · ${sourceLabel} · ${envelope.menu?.reviewed ? 'Reviewed menu' : 'Review required'}. Saved craving: ${craving || mood || 'None'}. ${budget} ${preferences}.`;
    const recs = dirty ? null : envelope.recommendations;
    if (dirty) $('recommendation-status').textContent = 'Unsaved menu changes. Save reviewed menu, then regenerate.';
    $('generate-recommendations').textContent = recs ? 'Regenerate recommendations' : 'Generate recommendations';
    if (!recs) {
      if (!dirty && !envelope.context_changed) $('recommendation-status').textContent = envelope.menu?.reviewed ? 'Ready. Generate recommendations explicitly from this saved reviewed menu.' : 'Save a reviewed menu before generating recommendations. Add a photo or enter dishes manually.';
      return;
    }
    $('recommendation-status').textContent = recs.message || (recs.items.length ? 'Suggestions from your reviewed menu. Always confirm details with staff.' : 'No matching dishes. Review exclusions or change your menu and preferences.');
    recs.items.slice(0,3).forEach(item => {
      const card = text('article', '', 'panel recommendation-card');
      const price = item.price === null ? 'Price unknown' : `${item.price} ${item.currency || '(currency unknown)'}`;
      card.append(text('span','MENU DISH','outline-label'), text('h2',item.name), text('p',item.description), text('p',price,'dish-price'), text('p', item.budget_status === 'within_budget' ? 'Within saved budget' : item.budget_status === 'not_set' ? 'No budget set' : 'Budget cannot be verified', 'row-tag'), text('p',item.reason), text('blockquote',item.evidence));
      const priceNote = envelope.menu.items.find(dish => dish.id === item.item_id).price_note;
      if (priceNote) card.append(text('p', `Listed price note: ${priceNote}`, 'muted'));
      for (const caution of item.cautions) card.append(text('p',caution,'safety'));
      target.append(card);
    });
    if (recs.excluded.length) { const box = text('section','','panel'); box.append(text('h2','Not suggested')); recs.excluded.forEach(x => box.append(text('p', `${x.name}: ${x.reason}`))); target.append(box); }
    for (const warning of recs.warnings) target.append(text('p',warning,'safety'));
  }
  function validateEnvelope(value) {
    const string = x => typeof x === 'string';
    const strings = x => Array.isArray(x) && x.every(string);
    const price = x => x === null || (typeof x === 'number' && Number.isFinite(x) && x >= 0);
    const currency = x => x === null || (string(x) && /^[A-Z]{3}$/.test(x));
    if (!value || !Number.isSafeInteger(value.menu_revision) || value.menu_revision < 0 || !Number.isSafeInteger(value.state_revision) || value.state_revision < 0 || typeof value.context_changed !== 'boolean' || !('menu' in value) || !('recommendations' in value)) return false;
    const menu = value.menu;
    if (menu !== null && (!menu || !string(menu.restaurant_name) || !currency(menu.currency) || typeof menu.reviewed !== 'boolean' || !['photo','manual'].includes(menu.source) || !strings(menu.warnings) || !Array.isArray(menu.items) || !menu.items.length || menu.items.length > 40 || menu.items.some(x => !x || !string(x.id) || !x.id || !string(x.name) || !x.name.trim() || !string(x.description) || !price(x.price) || !string(x.price_note)) || new Set(menu.items.map(x => x.id)).size !== menu.items.length)) return false;
    const recs = value.recommendations;
    if (recs === null) return true;
    if (!menu?.reviewed || !recs || !Array.isArray(recs.items) || recs.items.length > 3 || !string(recs.message) || !strings(recs.warnings) || !Array.isArray(recs.excluded) || recs.excluded.some(x => !x || !string(x.item_id) || !string(x.name) || !string(x.reason))) return false;
    if (new Set(recs.items.map(x => x?.item_id)).size !== recs.items.length) return false;
    return recs.items.every(x => {
      const dish = menu.items.find(d => d.id === x?.item_id);
      return dish && x.name === dish.name && x.description === dish.description && x.price === dish.price && x.currency === menu.currency && string(x.reason) && string(x.evidence) && x.evidence.length > 0 && (dish.name.includes(x.evidence) || dish.description.includes(x.evidence)) && ['within_budget','unknown','not_set'].includes(x.budget_status) && strings(x.cautions);
    });
  }
  function accept(value, replaceEditor = true) {
    if (!validateEnvelope(value)) throw new Error('The server returned an invalid menu response. Your previous work is still here; retry.');
    envelope = value;
    if (replaceEditor) { dirty = false; manualReplacement = false; editor(value.menu); }
    renderResults();
    if (value.context_changed) $('recommendation-status').textContent = 'Saved preferences or craving changed. Regenerate recommendations.';
    update();
  }
  async function request(path, method = 'GET', body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 100000);
    try {
      const response = await fetch(path, { method, credentials:'same-origin', cache:'no-store', signal:controller.signal, ...(body ? { headers:{'Content-Type':'application/json','X-ForkCast-Request':'1'}, body:JSON.stringify({...body, menu_revision:envelope.menu_revision, state_revision:app.revision}) } : {}) });
      if (!response.ok) throw new Error(response.status === 409 ? 'Data changed in another tab. Reload before saving; your current input is still here.' : response.status === 422 ? 'Could not use these details. Check the photo or menu fields and retry.' : 'The AI or server request failed. Your previous work is still here; retry.');
      return await response.json();
    } catch (error) { if (error.name === 'AbortError') throw new Error('Request timed out. Your previous work is still here; retry.'); if (error instanceof SyntaxError) throw new Error('The server returned an invalid response. Your previous work is still here; retry.'); throw error; }
    finally { clearTimeout(timer); }
  }
  async function operate(path, method, body, status) {
    if (app.busy) return;
    const version = ++epoch;
    try { await app.withServerOperation(async () => { message(status); const result = await request(path,method,body); if (version === epoch) { accept(result); message('Menu workspace saved.'); } }); }
    catch (error) { message(error.message); $('recommendation-status').textContent = error.message; }
    update();
  }
  async function preparePhoto(file) {
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Choose a JPEG, PNG, or WebP image up to 10 MB.');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url;
      try { await image.decode(); } catch { throw new Error('This image could not be opened. Choose another photo.'); }
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40000000) throw new Error('Choose a photo with no more than 40 megapixels.');
      const ratio = Math.min(1,2400 / Math.max(image.naturalWidth,image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1,Math.round(image.naturalWidth * ratio)); canvas.height = Math.max(1,Math.round(image.naturalHeight * ratio));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Photo preparation is unavailable. Enter the menu manually instead.');
      ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(image,0,0,canvas.width,canvas.height);
      for (const quality of [0.85,0.7,0.55]) {
        const data = canvas.toDataURL('image/jpeg',quality);
        if (data.startsWith('data:image/jpeg;base64,') && data.length < 4000000) return data;
      }
      throw new Error('This photo is still too large to analyze. Choose a smaller image.');
    } finally { URL.revokeObjectURL(url); }
  }
  $('analyze-menu').addEventListener('click', async () => {
    if (app.busy || !$('menu-file').files[0]) return;
    if ((envelope.menu || dirty) && !confirm('Replace the existing menu with this photo? Only a successful analysis replaces saved work. Unsaved editor changes will be replaced.')) return;
    const file = $('menu-file').files[0];
    const version = ++epoch;
    try {
      await app.withServerOperation(async () => {
        message('Preparing photo and analyzing with AI…');
        const image_data = await preparePhoto(file);
        if (version !== epoch) return;
        const result = await request('/api/menu/extract','POST',{image_data});
        if (version !== epoch) return;
        accept(result);
        message('Photo analyzed. Review every dish and save the reviewed menu before continuing.');
      });
    } catch (error) { if (version === epoch) message(error.message); }
    update();
  });
  $('menu-preview').addEventListener('load', () => setTimeout(update,0));
  $('menu-preview').addEventListener('error', () => setTimeout(update,0));
  $('menu-file').addEventListener('change', () => { message('New selected photo is a local preview, not your current reviewed menu. Click Analyze photo with AI to replace it.'); update(); });
  $('remove-photo').addEventListener('click', update);
  $('manual-menu').addEventListener('click', () => {
    if (envelope.menu && !confirm('Replace the current menu editor? Your saved menu is unchanged until you save.')) return;
    manualReplacement = true;
    editor({restaurant_name:'',currency:null,items:[{}],reviewed:false,source:'manual',warnings:[]}); changed();
  });
  $('clear-menu').addEventListener('click', async () => {
    if (app.busy || !confirm('Clear this guest’s menu and recommendations? Saved profile and craving are kept.')) return;
    await operate('/api/menu','DELETE',{},'Clearing menu…');
  });
  $('add-dish').addEventListener('click', () => { if ($('menu-dishes').children.length < 40) { addDish(); changed(); } });
  $('menu-editor').addEventListener('input', changed);
  $('menu-editor').addEventListener('submit', event => { event.preventDefault(); if (app.busy) return; try { const menu = readMenu(); void operate('/api/menu','PUT',{menu, ...(manualReplacement ? {manual_replacement:true} : {})},'Saving reviewed menu…'); } catch (error) { message(error.message); } });
  $('generate-recommendations').addEventListener('click', () => { if (!dirty && envelope.menu?.reviewed) void operate('/api/recommendations','POST',{},'Generating recommendations…'); });
  $('retry-menu').addEventListener('click', () => { if (!app.busy) void refresh(); });
  window.addEventListener('forkcast:lock', update);
  window.addEventListener('forkcast:cleared', () => { epoch++; envelope = {menu_revision:0,menu:null,recommendations:null}; dirty = false; manualReplacement = false; editor(null); renderResults(); message('Menu and recommendations cleared.'); void refresh(); });
  async function refresh() {
    if (app.mode !== 'server') return;
    const version = epoch;
    try {
      const value = await request('/api/menu');
      if (version !== epoch || value.menu_revision < envelope.menu_revision || value.state_revision < app.revision) return;
      if (value.state_revision !== app.revision || (dirty && value.menu_revision !== envelope.menu_revision)) throw new Error('Data changed in another tab. Reload before saving; your current input is still here.');
      loaded = true; accept(value, !dirty);
    }
    catch (error) { message(error.message); }
    update();
  }
  window.addEventListener('forkcast:saved', () => {
    const key = JSON.stringify(app.context);
    if (contextKey && key !== contextKey) { epoch++; envelope.recommendations = null; renderResults(); $('recommendation-status').textContent = 'Saved preferences or craving changed. Regenerate recommendations.'; }
    contextKey = key;
    void refresh();
  });
  app.readinessPromise.then(async () => {
    contextKey = JSON.stringify(app.context);
    if (app.mode === 'server') { $('legacy-picks').hidden = true; picks.hidden = false; await refresh(); }
    else message('AI actions unavailable: Python backend is not connected in this browser-only preview.');
    update();
  });
})();
