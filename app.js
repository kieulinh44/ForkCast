/* Navigation is deliberately independent of future AI/backend integrations. */
'use strict';
const viewNames = { overview: 'Overview', profile: 'Taste profile', menu: 'My menu', mood: 'Mood & cravings', feedback: 'Meal feedback', brief: 'Project brief' };
function showView(name, focus = false) {
  const view = Object.hasOwn(viewNames, name) ? name : 'overview';
  document.querySelectorAll('.view').forEach(section => { section.hidden = section.id !== `view-${view}`; });
  document.querySelectorAll('.nav-item').forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.getElementById('breadcrumb').textContent = viewNames[view];
  document.title = `ForkCast · ${viewNames[view]}`;
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
let toastTimer;
function notify(message) {
  const toast = document.getElementById('toast');
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
}
function persist(message) {
  const saved = ForkCastState.save(storage, draft);
  notify(saved ? message : 'Browser storage is unavailable. Changes last only until you close or refresh this page.');
  renderSummary();
}
function renderSummary() {
  document.getElementById('profile-status').textContent = Object.values(draft.profile).some(Boolean) ? 'Profile saved' : 'Set up your profile';
  document.getElementById('mood-status').textContent = draft.mood || (draft.craving ? 'Craving saved' : 'Pick your mood');
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
  persist('Mood and craving saved on this browser.');
});
document.getElementById('feedback-form').addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const dish = data.get('dish').trim();
  const rating = Number(data.get('rating'));
  if (!dish || !Number.isInteger(rating) || rating < 1 || rating > 5) return notify('Add a dish name and a rating from 1 to 5.');
  draft.feedback.unshift({ dish, rating, notes: data.get('notes').trim() });
  persist('Meal feedback saved on this browser.');
  renderFeedback();
  event.currentTarget.reset();
});
document.getElementById('clear-data').addEventListener('click', () => {
  if (!window.confirm('Clear your ForkCast profile, mood, saved menu link, and meal feedback from this browser? This cannot be undone.')) return;
  draft = ForkCastState.emptyState();
  try { storage.removeItem(ForkCastState.KEY); notify('Local drafts cleared.'); }
  catch { notify('Drafts cleared from this page, but browser storage is unavailable.'); }
  document.getElementById('feedback-form').reset();
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
  const saved = ForkCastState.save(storage, draft);
  renderMenuLink();
  if (!saved) document.getElementById('menu-link-message').textContent = 'Browser storage is unavailable. This link will be lost on refresh.';
});
document.getElementById('remove-menu-link').addEventListener('click', () => {
  draft.menuUrl = '';
  const saved = ForkCastState.save(storage, draft);
  renderMenuLink();
  document.getElementById('menu-link-message').textContent = saved ? 'Saved link removed.' : 'Link removed from this page, but browser storage is unavailable.';
  document.getElementById('menu-url').focus();
});
