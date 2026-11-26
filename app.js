/* Navigation is deliberately independent of future AI/backend integrations. */
'use strict';
document.documentElement.classList.add('js');
const navToggle = document.getElementById('nav-toggle');
const mainNav = document.getElementById('main-nav');
function closeNavigation() {
  mainNav.classList.remove('is-open');
  navToggle.setAttribute('aria-expanded', 'false');
}
navToggle.addEventListener('click', () => {
  const open = navToggle.getAttribute('aria-expanded') !== 'true';
  mainNav.classList.toggle('is-open', open);
  navToggle.setAttribute('aria-expanded', String(open));
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && navToggle.getAttribute('aria-expanded') === 'true') {
    closeNavigation();
    navToggle.focus();
  }
});
const viewNames = { overview: 'Home', profile: 'Taste profile', menu: 'Restaurant menu', mood: 'Cravings', picks: 'Dish recommendations', feedback: 'Meal history', preferences: 'Learned preferences', system: 'System status' };
function showView(name, focus = false) {
  const view = Object.hasOwn(viewNames, name) ? name : 'overview';
  document.querySelectorAll('.view').forEach(section => { section.hidden = section.id !== `view-${view}`; });
  document.querySelectorAll('.nav-item, .footer [data-view]').forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.getElementById('breadcrumb').textContent = viewNames[view];
  document.title = `ForkCast · ${viewNames[view]}`;
  closeNavigation();
  if (focus) document.getElementById('main').focus();
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
  const name = button.dataset.view;
  if (location.hash === `#${name}`) showView(name, true);
  else location.hash = name;
}));
window.addEventListener('hashchange', () => showView(location.hash.slice(1), true));
showView(location.hash.slice(1));

// Server mode uses an isolated guest workspace. Browser-only drafts migrate only after explicit approval.
let storage;
try { storage = window.localStorage; } catch { storage = null; }
let draft = ForkCastState.load(storage);
const legacyDraft = draft;
const serverClient = ForkCastServer.create(window.fetch.bind(window));
let storageMode = 'loading';
let storageReady = false;
let saveBusy = false;
let lastSaveError = '';
let lastConnectionError = '';
let savedProfile = JSON.stringify(draft.profile);
let savedMenuUrls = ForkCastState.menuLinks(draft);
let savedMood = JSON.stringify([draft.mood, draft.craving]);
let mealPhoto = '';
let mealPhotoVersion = 0;
let mealPhotoProcessing = false;
let toastTimer;
function notify(message) {
  const toast = document.getElementById('toast');
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
}
async function saveDraft(state) {
  if (!storageReady || saveBusy) {
    lastSaveError = 'Please wait for storage to be ready before saving.';
    return false;
  }
  saveBusy = true;
  lockSavedForms(true);
  try {
    if (storageMode === 'server') await serverClient.save(state);
    else if (!ForkCastState.save(storage, state)) throw new Error('Browser storage is unavailable. Changes last only until you close or refresh this page.');
    rememberSavedState(state);
    lastSaveError = '';
    return true;
  } catch (error) {
    lastSaveError = error.message || 'Your changes were not saved. Your current input is still here.';
    return false;
  } finally {
    saveBusy = false;
    lockSavedForms(!storageReady);
    renderSummary();
  }
}
async function persist(message) {
  const saved = await saveDraft(draft);
  notify(saved ? message : lastSaveError);
  renderSummary();
  return saved;
}
function renderSummary() {
  const hasProfile = Object.values(draft.profile).some(Boolean);
  const profileStatus = savedProfile === JSON.stringify(draft.profile) ? 'Profile saved' : 'Profile not saved';
  document.getElementById('profile-status').textContent = hasProfile ? profileStatus : 'Set up your profile';
  const moodPersisted = savedMood === JSON.stringify([draft.mood, draft.craving]);
  const moodStatus = moodPersisted ? (draft.mood || 'Craving saved') : 'Craving not saved';
  document.getElementById('mood-status').textContent = draft.mood || draft.craving ? moodStatus : 'Choose a craving';
  const hasPhoto = !document.getElementById('menu-preview').hidden;
  const menuUrls = ForkCastState.menuLinks(draft);
  const linksPersisted = JSON.stringify(savedMenuUrls) === JSON.stringify(menuUrls);
  const linkStatus = linksPersisted ? (menuUrls.length === 1 ? 'Link saved · not read' : `${menuUrls.length} links saved · not read`) : 'Links not saved · not read';
  document.getElementById('menu-status').textContent = hasPhoto ? 'Photo preview · not read' : (menuUrls.length ? linkStatus : 'Add a restaurant menu');
}
function renderFeedback() {
  const list = document.getElementById('feedback-list');
  list.replaceChildren();
  const entries = draft.feedback.filter(entry => entry && typeof entry.dish === 'string' && typeof entry.notes === 'string' && Number.isInteger(entry.rating) && entry.rating >= 1 && entry.rating <= 5);
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No meal notes yet. Your first review starts the story.';
    list.append(empty);
  }
  entries.forEach(entry => {
    const article = document.createElement('article');
    article.className = 'feedback-entry';
    const name = document.createElement('strong');
    name.textContent = entry.dish;
    const rating = document.createElement('small');
    rating.textContent = `${entry.rating} / 5 · Saved ${storageDescription()}`;
    const notes = document.createElement('p');
    notes.textContent = entry.notes;
    article.append(name, rating, notes);
    if (typeof entry.photo === 'string' && entry.photo.length <= 700000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(entry.photo)) {
      const photo = document.createElement('img');
      photo.className = 'review-photo';
      photo.alt = `Meal photo for ${entry.dish}`;
      photo.src = entry.photo;
      photo.loading = 'lazy';
      article.append(photo);
    }
    list.append(article);
  });
}
function restoreForms() {
  const profileForm = document.getElementById('profile-form');
  profileForm.reset();
  Object.entries(draft.profile).forEach(([key, value]) => {
    const field = profileForm.elements.namedItem(key);
    if (key === 'currency' && /^[A-Z]{3}$/.test(value) && !Array.from(field.options).some(option => option.value === value)) field.add(new Option(value, value));
    if (field && 'value' in field && typeof value === 'string') field.value = value;
  });
  updateBudgetLabel();
  const moodForm = document.getElementById('mood-form');
  moodForm.reset();
  for (const radio of moodForm.querySelectorAll('input[type=radio]')) radio.checked = radio.value === draft.mood;
  moodForm.elements.craving.value = draft.craving;
  renderMenuLink();
  renderSummary();
  renderFeedback();
}
function updateBudgetLabel() {
  document.getElementById('budget-label').textContent = `Budget per dish (${document.getElementById('profile-currency').value || 'USD'})`;
}
document.getElementById('profile-currency').addEventListener('change', updateBudgetLabel);
document.getElementById('profile-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!storageReady || saveBusy) return;
  draft.profile = Object.fromEntries(Array.from(new FormData(event.currentTarget), ([key, value]) => [key, value.trim()]));
  await persist(`Taste profile saved ${storageDescription()}.`);
});
document.getElementById('mood-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!storageReady || saveBusy) return;
  const form = new FormData(event.currentTarget);
  draft.mood = form.get('mood') || '';
  draft.craving = form.get('craving').trim();
  if (!draft.mood && !draft.craving) return notify('Choose a mood or describe a craving first.');
  if (await persist(`Mood and craving saved ${storageDescription()}.`)) location.hash = 'menu';
});
document.getElementById('feedback-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!storageReady || saveBusy) return notify('Please wait for storage to be ready before saving.');
  if (mealPhotoProcessing) return notify('Please wait while your photo is prepared.');
  const feedbackForm = event.currentTarget;
  const data = new FormData(feedbackForm);
  const dish = data.get('dish').trim();
  const rating = Number(data.get('rating'));
  if (!dish || !Number.isInteger(rating) || rating < 1 || rating > 5) return notify('Add a dish name and a rating from 1 to 5.');
  const entry = { dish, rating, notes: data.get('notes').trim() };
  if (mealPhoto) entry.photo = mealPhoto;
  const next = { ...draft, feedback: [entry, ...draft.feedback] };
  if (!await saveDraft(next)) {
    notify(storageMode === 'server' ? lastSaveError : 'Review not saved: browser storage is full or unavailable. Your draft is still here. Remove the photo and retry, or free browser storage.');
    return;
  }
  draft = next;
  notify(`Meal feedback saved ${storageDescription()}.`);
  renderFeedback();
  feedbackForm.reset();
  resetMealPhoto();
});
document.getElementById('clear-data').addEventListener('click', async () => {
  if (!storageReady || saveBusy) return;
  const prompt = storageMode === 'server'
    ? 'Clear saved profile, craving, menu link, reviewed menu, recommendations, reviews, and meal photos for this guest browser on the server, plus any browser-only draft on this device? Other guests are not affected. This cannot be undone.'
    : 'Clear your ForkCast profile, mood, saved menu link, meal feedback, and saved meal photos from this browser? This cannot be undone.';
  if (!window.confirm(prompt)) return;
  saveBusy = true;
  lockSavedForms(true);
  try {
    if (storageMode === 'server') await serverClient.clear();
    else storage.removeItem(ForkCastState.KEY);
    draft = ForkCastState.emptyState();
    rememberSavedState(draft);
    let localCopyRemoved = true;
    if (storageMode === 'server') {
      try { if (storage) storage.removeItem(ForkCastState.KEY); }
      catch { localCopyRemoved = false; }
    }
    document.getElementById('storage-banner').hidden = true;
    document.getElementById('feedback-form').reset();
    resetMealPhoto();
    clearPhoto();
    menuFile.value = '';
    menuMessage.textContent = '';
    restoreForms();
    window.dispatchEvent(new Event('forkcast:cleared'));
    notify(storageMode === 'server' ? (localCopyRemoved ? 'Saved data cleared for this guest browser.' : 'Server data cleared, but a browser-only copy could not be removed.') : 'Local drafts cleared.');
  } catch (error) {
    notify(storageMode === 'server' ? error.message : 'Browser storage is unavailable. Saved data could not be cleared; your current details are still here.');
  } finally {
    saveBusy = false;
    lockSavedForms(!storageReady);
  }
});

const menuFile = document.getElementById('menu-file');
const menuPreview = document.getElementById('menu-preview');
const menuMessage = document.getElementById('menu-message');
const removePhoto = document.getElementById('remove-photo');
let imageUrl;
function clearPhoto() {
  menuPreview.onload = null;
  menuPreview.onerror = null;
  menuPreview.hidden = true;
  menuPreview.removeAttribute('src');
  removePhoto.hidden = true;
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = null;
  renderSummary();
}
menuFile.addEventListener('change', () => {
  clearPhoto();
  menuMessage.textContent = '';
  const file = menuFile.files[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    menuMessage.textContent = 'Choose a JPEG, PNG, or WebP image.';
    menuFile.value = '';
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    menuMessage.textContent = 'This image is too large. Choose an image up to 10 MB.';
    menuFile.value = '';
    return;
  }
  imageUrl = URL.createObjectURL(file);
  menuPreview.onload = () => {
    menuPreview.hidden = false;
    removePhoto.hidden = false;
    menuMessage.textContent = `${file.name} · Preview only. No AI analysis has been run.`;
    renderSummary();
  };
  menuPreview.onerror = () => {
    clearPhoto();
    menuFile.value = '';
    menuMessage.textContent = 'This image could not be opened. Try a different photo.';
  };
  menuPreview.src = imageUrl;
});
removePhoto.addEventListener('click', () => {
  clearPhoto();
  menuFile.value = '';
  menuMessage.textContent = 'Photo removed.';
  menuFile.focus();
});
window.addEventListener('pagehide', clearPhoto);

function validMenuUrl(value) {
  return ForkCastState.normalizeMenuUrl(value);
}
function renderMenuLink({ restoreInput = true } = {}) {
  const urls = storageReady ? savedMenuUrls : [];
  if (restoreInput) document.getElementById('menu-url').value = validMenuUrl(draft.menuUrl);
  document.getElementById('menu-url').removeAttribute('aria-invalid');
  document.getElementById('saved-menu-empty').hidden = urls.length > 0;
  document.getElementById('saved-menu-details').hidden = urls.length === 0;
  document.getElementById('saved-menu-title').textContent = urls.length ? `Saved restaurant links (${urls.length})` : 'Saved restaurant links';
  document.getElementById('saved-menu-status').textContent = urls.length ? `Saved ${storageDescription()}.` : '';
  const list = document.getElementById('saved-menu-list');
  list.replaceChildren();
  urls.forEach((url, index) => {
    const item = document.createElement('li');
    item.className = 'saved-menu-entry';
    item.setAttribute('aria-label', `Saved menu: ${url}`);
    const name = document.createElement('strong');
    name.className = 'saved-menu-name';
    name.textContent = new URL(url).hostname.replace(/^www\./, '');
    const address = document.createElement('p');
    address.className = 'saved-menu-url';
    address.id = `saved-menu-url-${index}`;
    address.textContent = url;
    const actions = document.createElement('div');
    actions.className = 'menu-link-actions';
    const open = document.createElement('a');
    open.className = 'secondary';
    open.href = url;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.textContent = 'Visit website (new tab)';
    open.setAttribute('aria-describedby', address.id);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'secondary';
    remove.dataset.removeMenuUrl = url;
    remove.disabled = saveBusy || !storageReady;
    remove.textContent = 'Remove saved link';
    remove.setAttribute('aria-describedby', address.id);
    actions.append(open, remove);
    item.append(name, address, actions);
    list.append(item);
  });
  document.getElementById('menu-link-message').textContent = urls.length ? `Menu links saved ${storageDescription()}. No website analysis has been run.` : '';
}
document.getElementById('menu-url').addEventListener('input', event => {
  const input = event.currentTarget;
  input.removeAttribute('aria-invalid');
  const value = input.value.trim();
  const alreadySaved = savedMenuUrls.includes(validMenuUrl(value));
  document.getElementById('menu-link-message').textContent = alreadySaved ? 'This link is already saved. See its entry below.' : value ? 'Changes not saved. Choose Save menu link to add this URL. Your saved links below have not changed.' : '';
});
document.getElementById('menu-link-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = document.getElementById('menu-url');
  const url = validMenuUrl(input.value.trim());
  if (!url) {
    input.setAttribute('aria-invalid', 'true');
    document.getElementById('menu-link-message').textContent = 'Enter a valid http:// or https:// menu URL without a username or password.';
    input.focus();
    return;
  }
  if (savedMenuUrls.includes(url)) {
    document.getElementById('menu-link-message').textContent = 'This link is already saved. Your saved links have not changed.';
    return;
  }
  if (savedMenuUrls.length >= 50) {
    document.getElementById('menu-link-message').textContent = 'You can save up to 50 restaurant links. Remove one before adding another.';
    return;
  }
  const next = { ...draft, menuUrl: url, menuUrls: [...savedMenuUrls, url] };
  const saved = await saveDraft(next);
  if (saved) draft = next;
  renderMenuLink({ restoreInput: saved });
  renderSummary();
  if (saved) input.value = '';
  if (!saved) document.getElementById('menu-link-message').textContent = `Link not saved. Your input is still here and the saved entry has not changed. ${lastSaveError}`;
});
document.getElementById('saved-menu-list').addEventListener('click', async event => {
  const button = event.target.closest('button[data-remove-menu-url]');
  if (!button || saveBusy || !storageReady) return;
  const removedUrl = validMenuUrl(button.dataset.removeMenuUrl);
  if (!savedMenuUrls.includes(removedUrl)) return;
  const remaining = savedMenuUrls.filter(url => url !== removedUrl);
  const next = { ...draft, menuUrl: validMenuUrl(draft.menuUrl) === removedUrl ? (remaining.at(-1) || '') : draft.menuUrl, menuUrls: remaining };
  const saved = await saveDraft(next);
  if (saved) draft = next;
  renderMenuLink({ restoreInput: saved });
  renderSummary();
  if (saved) document.getElementById('menu-url').value = '';
  document.getElementById('menu-link-message').textContent = saved ? `Saved link removed: ${removedUrl}` : `Link not removed. The saved entry is unchanged. ${lastSaveError}`;
  document.getElementById('menu-url').focus();
});

// Normalize meal photos to a small JPEG before browser-local storage.
// No original photo bytes or camera metadata are retained.
function resetMealPhoto(message = '') {
  mealPhotoVersion++;
  mealPhoto = '';
  mealPhotoProcessing = false;
  const preview = document.getElementById('meal-photo-preview');
  preview.hidden = true;
  preview.removeAttribute('src');
  document.getElementById('meal-camera').value = '';
  document.getElementById('meal-gallery').value = '';
  document.getElementById('remove-meal-photo').hidden = true;
  document.getElementById('meal-photo-message').textContent = message;
  updateFeedbackSubmitState();
}
async function prepareMealPhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP photo. Convert HEIC photos to JPEG first.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose a photo up to 10 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try { await image.decode(); }
    catch { throw new Error('This photo could not be opened. Choose another image.'); }
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40000000) throw new Error('This photo has too many pixels. Choose a smaller image.');
    const ratio = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Photo preparation is unavailable in this browser.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const photo = canvas.toDataURL('image/jpeg', 0.75);
    if (!photo.startsWith('data:image/jpeg;base64,') || photo.length > 700000) throw new Error('This photo is still too large to save locally. Try a smaller photo.');
    return photo;
  } finally { URL.revokeObjectURL(url); }
}
async function selectMealPhoto(event) {
  const file = event.currentTarget.files[0];
  if (!file) return; // Cancelling the picker keeps an existing selection.
  resetMealPhoto();
  const version = mealPhotoVersion;
  mealPhotoProcessing = true;
  updateFeedbackSubmitState();
  document.getElementById('remove-meal-photo').hidden = false;
  document.getElementById('meal-photo-message').textContent = 'Preparing your photo…';
  try {
    const photo = await prepareMealPhoto(file);
    if (version !== mealPhotoVersion) return;
    mealPhoto = photo;
    const preview = document.getElementById('meal-photo-preview');
    preview.src = photo;
    preview.hidden = false;
    document.getElementById('meal-photo-message').textContent = `Photo ready. Save your review and photo ${storageDescription()}.`;
  } catch (error) {
    if (version === mealPhotoVersion) resetMealPhoto(error.message || 'Photo could not be prepared. Try another image.');
  } finally {
    if (version === mealPhotoVersion) {
      mealPhotoProcessing = false;
      updateFeedbackSubmitState();
    }
  }
}
document.getElementById('meal-camera').addEventListener('change', selectMealPhoto);
document.getElementById('meal-gallery').addEventListener('change', selectMealPhoto);
document.getElementById('remove-meal-photo').addEventListener('click', () => {
  resetMealPhoto('Photo removed. You can save the review without a photo.');
  document.getElementById('meal-gallery').focus();
});


function updateFeedbackSubmitState() {
  document.querySelector('#feedback-form button[type=submit]').disabled = !storageReady || saveBusy || mealPhotoProcessing;
}
function lockSavedForms(locked) {
  document.querySelectorAll('form input, form select, form textarea, form button, #clear-data, #import-local').forEach(control => { control.disabled = locked; });
  updateFeedbackSubmitState();
  window.dispatchEvent(new Event('forkcast:lock'));
}
function rememberSavedState(state) {
  savedProfile = JSON.stringify(state.profile);
  savedMenuUrls = ForkCastState.menuLinks(state);
  savedMood = JSON.stringify([state.mood, state.craving]);
  window.dispatchEvent(new Event('forkcast:saved'));
}
function hasSavedDetails(state) {
  return Object.values(state.profile).some(Boolean) || !!state.mood || !!state.craving || state.feedback.length > 0 || ForkCastState.menuLinks(state).length > 0;
}
function storageDescription() {
  return storageMode === 'server' ? 'to this server for this guest browser' : 'on this browser';
}
function updateStorageLabels() {
  const pill = document.querySelector('.pill');
  pill.textContent = storageMode === 'server' ? 'Server storage · Explicit AI actions' : storageMode === 'local' ? 'Browser-only preview · No AI connected' : 'Server unavailable · No data saved';
  if (storageMode !== 'server') return;
  document.querySelector('.hero-note').textContent = 'Analyze a sample menu photo, save the reviewed dishes, then explicitly generate recommendations. AI service availability is not guaranteed.';
  document.querySelector('#view-overview .preview-note h3').textContent = 'Read. Review. Choose.';
  document.querySelector('.journey-row[data-view="picks"] .row-tag').textContent = 'Reviewed menu required';
  document.getElementById('clear-data').textContent = 'Clear saved data';
  document.querySelector('#profile-form .form-footer p').textContent = 'Saved to SQLite for this guest browser. No accounts or cross-device sync yet.';
  document.querySelector('#mood-form .form-footer p').textContent = 'This saves your craving to the server, then opens the restaurant-menu step.';
  document.querySelector('#feedback-form .form-footer p').textContent = 'Review and resized meal photo save to this server for this guest browser. Preference learning is not connected.';
  document.getElementById('meal-photo-help').textContent = 'One JPEG, PNG, or WebP photo up to 10 MB. The app resizes it before saving with your review to the server. Original photo metadata is not retained. Meal photos are not sent to an AI service.';
  document.querySelector('#view-feedback .section-heading .muted').textContent = 'Saved to this guest workspace';
  document.getElementById('menu-link-help').textContent = 'Paste a full http:// or https:// restaurant menu URL. The link saves to this server for this guest browser; the website is not imported or analyzed.';
  document.querySelector('#view-overview .preview-note p').textContent = 'Saved cravings and preferences personalize explicit dish recommendations from a reviewed menu. Photo analysis uses Qwen; ranking uses DeepSeek. Configuration does not guarantee availability. Links are save-only; learning is not connected.';
}
async function initializePersistence() {
  lockSavedForms(true);
  try {
    const envelope = await serverClient.initialize();
    storageMode = serverClient.mode;
    draft = storageMode === 'server' ? envelope.state : legacyDraft;
    if (storageMode === 'server' && hasSavedDetails(legacyDraft)) document.getElementById('storage-banner').hidden = false;
    storageReady = true;
    rememberSavedState(draft);
  } catch (error) {
    storageMode = 'offline';
    lastConnectionError = error.message;
    storageReady = false;
    draft = ForkCastState.emptyState();
    notify(error.message + ' Reload to reconnect.');
  }
  restoreForms();
  updateStorageLabels();
  renderSystemStatus();
  lockSavedForms(!storageReady);
}
document.getElementById('import-local').addEventListener('click', async () => {
  if (storageMode !== 'server' || !storageReady || saveBusy) return;
  if (!window.confirm('Import this browser-only draft? It will replace the server data for this guest browser and remove the browser-only copy after a successful save. Other guests are not affected.')) return;
  if (!await saveDraft(legacyDraft)) { notify(lastSaveError); return; }
  draft = legacyDraft;
  let removed = true;
  try { if (storage) storage.removeItem(ForkCastState.KEY); } catch { removed = false; }
  document.getElementById('storage-banner').hidden = true;
  restoreForms();
  notify(removed ? 'Browser-only draft imported to this server.' : 'Draft imported to the server; the browser-only backup could not be removed.');
});
document.getElementById('dismiss-import').addEventListener('click', () => {
  document.getElementById('storage-banner').hidden = true;
});
function renderSystemStatus() {
  const connected = storageMode === 'server' && !lastConnectionError;
  const health = serverClient.health;
  document.getElementById('features-health').textContent = connected && health.features && (health.features.menu_extraction || health.features.menu_analysis || health.features.recommendations) ? 'Explicit photo analysis and reviewed-menu recommendations are implemented. Availability is not checked here. Preference learning is not connected.' : 'Menu reading and recommendations are unavailable here. Preference learning is not connected.';
  document.getElementById('server-health').textContent = connected ? 'Connected · same-origin Python API' : storageMode === 'local' ? 'Browser-only preview · Python backend not running at this address' : 'Unavailable · reload to reconnect';
  document.getElementById('database-health').textContent = connected ? `Ready · schema ${health.database.schema_version}` : 'Not available to this page';
  for (const role of ['text', 'vision']) {
    const configured = health && health.services && health.services[role] && health.services[role].configured;
    document.getElementById(role + '-health').textContent = configured ? 'Configured · live availability not checked here' : 'Not configured or not available';
  }
  document.getElementById('guest-storage-description').textContent = storageMode === 'server' ? 'Your saved profile, craving, restaurant link, reviewed/extracted menu, recommendations, reviews, and meal photos are stored in SQLite on this server, isolated to this guest browser. Original menu-photo uploads and previews are not stored. There are no accounts or cross-device syncing yet.' : 'This page is not using server persistence. Browser-only preview data stays in this browser; it is not automatically imported when a backend becomes available.';
  document.getElementById('connection-message').textContent = lastConnectionError || (connected ? 'Server and database checked. No AI requests were made.' : 'Start the documented Python backend, then reload this page.');
  document.getElementById('refresh-status').textContent = storageMode === 'offline' ? 'Reload to reconnect' : 'Refresh connection status';
}
document.getElementById('refresh-status').addEventListener('click', async event => {
  if (storageMode === 'offline') { location.reload(); return; }
  const button = event.currentTarget;
  button.disabled = true;
  try {
    if (storageMode === 'server') await serverClient.checkHealth();
    lastConnectionError = '';
  } catch (error) { lastConnectionError = error.message; }
  finally { button.disabled = false; renderSystemStatus(); }
});
window.ForkCastApp = {
  get mode() { return storageMode; },
  get ready() { return storageReady; },
  get busy() { return saveBusy; },
  get revision() { return serverClient.revision; },
  get menuLinks() { return [...savedMenuUrls]; },
  get context() { const [mood, craving] = JSON.parse(savedMood); return { profile: JSON.parse(savedProfile), mood, craving }; },
  async withServerOperation(task) {
    if (!storageReady || saveBusy || storageMode !== 'server') throw new Error('Please wait for the server to be ready.');
    saveBusy = true;
    lockSavedForms(true);
    try { return await task(); }
    finally { saveBusy = false; lockSavedForms(!storageReady); }
  }
};
window.ForkCastApp.readinessPromise = initializePersistence().then(() => { window.dispatchEvent(new Event('forkcast:ready')); });
