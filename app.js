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
const viewNames = { overview: 'Home', profile: 'Taste profile', menu: 'Restaurant menu', mood: 'Cravings', picks: 'Dish recommendations', feedback: 'Meal history', preferences: 'Learned preferences', brief: 'Project brief' };
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

// All saved drafts belong to this browser. Never send dietary data to a server.
let storage;
try { storage = window.localStorage; } catch { storage = null; }
let draft = ForkCastState.load(storage);
let savedProfile = JSON.stringify(draft.profile);
let savedMenuUrl = draft.menuUrl;
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
function saveDraft(state) {
  const saved = ForkCastState.save(storage, state);
  if (saved) {
    savedProfile = JSON.stringify(state.profile);
    savedMenuUrl = state.menuUrl;
    savedMood = JSON.stringify([state.mood, state.craving]);
  }
  renderSummary();
  return saved;
}
function persist(message) {
  const saved = saveDraft(draft);
  notify(saved ? message : 'Browser storage is unavailable. Changes last only until you close or refresh this page.');
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
  const linkStatus = savedMenuUrl === draft.menuUrl ? 'Link saved · not read' : 'Link not saved · not read';
  document.getElementById('menu-status').textContent = hasPhoto ? 'Photo preview · not read' : (validMenuUrl(draft.menuUrl) ? linkStatus : 'Add a restaurant menu');
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
    rating.textContent = `${entry.rating} / 5 · Saved on this browser`;
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
    if (field && 'value' in field && typeof value === 'string') field.value = value;
  });
  const moodForm = document.getElementById('mood-form');
  moodForm.reset();
  for (const radio of moodForm.querySelectorAll('input[type=radio]')) radio.checked = radio.value === draft.mood;
  moodForm.elements.craving.value = draft.craving;
  renderMenuLink();
  renderSummary();
  renderFeedback();
}
document.getElementById('profile-form').addEventListener('submit', event => {
  event.preventDefault();
  draft.profile = Object.fromEntries(Array.from(new FormData(event.currentTarget), ([key, value]) => [key, value.trim()]));
  persist('Taste profile saved on this browser.');
});
document.getElementById('mood-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  draft.mood = form.get('mood') || '';
  draft.craving = form.get('craving').trim();
  if (!draft.mood && !draft.craving) return notify('Choose a mood or describe a craving first.');
  if (persist('Mood and craving saved on this browser.')) location.hash = 'menu';
});
document.getElementById('feedback-form').addEventListener('submit', event => {
  event.preventDefault();
  if (mealPhotoProcessing) return notify('Please wait while your photo is prepared.');
  const data = new FormData(event.currentTarget);
  const dish = data.get('dish').trim();
  const rating = Number(data.get('rating'));
  if (!dish || !Number.isInteger(rating) || rating < 1 || rating > 5) return notify('Add a dish name and a rating from 1 to 5.');
  const entry = { dish, rating, notes: data.get('notes').trim() };
  if (mealPhoto) entry.photo = mealPhoto;
  const next = { ...draft, feedback: [entry, ...draft.feedback] };
  if (!saveDraft(next)) {
    notify('Review not saved: browser storage is full or unavailable. Your draft is still here. Remove the photo and retry, or free browser storage.');
    return;
  }
  draft = next;
  notify('Meal feedback saved on this browser.');
  renderFeedback();
  event.currentTarget.reset();
  resetMealPhoto();
});
document.getElementById('clear-data').addEventListener('click', () => {
  if (!window.confirm('Clear your ForkCast profile, mood, saved menu link, meal feedback, and saved meal photos from this browser? This cannot be undone.')) return;
  draft = ForkCastState.emptyState();
  try { storage.removeItem(ForkCastState.KEY); notify('Local drafts cleared.'); }
  catch { notify('Drafts cleared from this page, but browser storage is unavailable.'); }
  document.getElementById('feedback-form').reset();
  resetMealPhoto();
  clearPhoto();
  menuFile.value = '';
  menuMessage.textContent = '';
  restoreForms();
});
restoreForms();

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
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && value.length <= 2048 ? url.href : '';
  } catch { return ''; }
}
function renderMenuLink() {
  const saved = validMenuUrl(draft.menuUrl);
  document.getElementById('menu-url').value = saved;
  document.getElementById('menu-url').removeAttribute('aria-invalid');
  const open = document.getElementById('open-menu-link');
  open.hidden = !saved;
  if (saved) open.href = saved;
  else open.removeAttribute('href');
  document.getElementById('remove-menu-link').hidden = !saved;
  document.getElementById('menu-link-message').textContent = saved ? 'Menu link saved on this browser. No website analysis has been run.' : '';
}
document.getElementById('menu-link-form').addEventListener('submit', event => {
  event.preventDefault();
  const input = document.getElementById('menu-url');
  const url = validMenuUrl(input.value.trim());
  if (!url) {
    input.setAttribute('aria-invalid', 'true');
    document.getElementById('menu-link-message').textContent = 'Enter a valid http:// or https:// menu URL without a username or password.';
    input.focus();
    return;
  }
  draft.menuUrl = url;
  const saved = saveDraft(draft);
  renderMenuLink();
  if (!saved) document.getElementById('menu-link-message').textContent = 'Browser storage is unavailable. This link will be lost on refresh.';
});
document.getElementById('remove-menu-link').addEventListener('click', () => {
  draft.menuUrl = '';
  const saved = saveDraft(draft);
  renderMenuLink();
  document.getElementById('menu-link-message').textContent = saved ? 'Saved link removed.' : 'Link removed from this page, but browser storage is unavailable.';
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
  document.querySelector('#feedback-form button[type=submit]').disabled = false;
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
  document.querySelector('#feedback-form button[type=submit]').disabled = true;
  document.getElementById('remove-meal-photo').hidden = false;
  document.getElementById('meal-photo-message').textContent = 'Preparing your photo…';
  try {
    const photo = await prepareMealPhoto(file);
    if (version !== mealPhotoVersion) return;
    mealPhoto = photo;
    const preview = document.getElementById('meal-photo-preview');
    preview.src = photo;
    preview.hidden = false;
    document.getElementById('meal-photo-message').textContent = 'Photo ready. Save your review to keep it on this browser.';
  } catch (error) {
    if (version === mealPhotoVersion) resetMealPhoto(error.message || 'Photo could not be prepared. Try another image.');
  } finally {
    if (version === mealPhotoVersion) {
      mealPhotoProcessing = false;
      document.querySelector('#feedback-form button[type=submit]').disabled = false;
    }
  }
}
document.getElementById('meal-camera').addEventListener('change', selectMealPhoto);
document.getElementById('meal-gallery').addEventListener('change', selectMealPhoto);
document.getElementById('remove-meal-photo').addEventListener('click', () => {
  resetMealPhoto('Photo removed. You can save the review without a photo.');
  document.getElementById('meal-gallery').focus();
});
