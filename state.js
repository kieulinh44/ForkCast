/* Shared draft-state helpers. No API calls or shared database yet. */
(function (root) {
  'use strict';
  const KEY = 'forkcast.draft.v1';
  function emptyState() {
    return { profile: {}, mood: '', craving: '', feedback: [], menuUrl: '' };
  }
  function normalizeMenuUrl(value) {
    if (typeof value !== 'string') return '';
    value = value.trim();
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && value.length <= 2048 ? url.href : '';
    } catch { return ''; }
  }
  function menuLinks(state) {
    const values = Array.isArray(state.menuUrls) ? [...state.menuUrls] : [];
    if (state.menuUrl) values.push(state.menuUrl);
    return [...new Set(values.map(normalizeMenuUrl).filter(Boolean))];
  }
  function load(storage) {
    try {
      const data = JSON.parse(storage.getItem(KEY));
      if (!data || typeof data.profile !== 'object' || !data.profile || Array.isArray(data.profile) ||
          typeof data.mood !== 'string' || typeof data.craving !== 'string' || !Array.isArray(data.feedback)) return emptyState();
      return { ...data, menuUrl: typeof data.menuUrl === 'string' ? data.menuUrl : '' };
    } catch { return emptyState(); }
  }
  function save(storage, state) {
    try { storage.setItem(KEY, JSON.stringify(state)); return true; }
    catch { return false; }
  }
  const api = { KEY, emptyState, load, save, normalizeMenuUrl, menuLinks };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ForkCastState = api;
})(typeof window !== 'undefined' ? window : globalThis);
