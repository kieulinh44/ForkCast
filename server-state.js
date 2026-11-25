/* Same-origin guest persistence. No credentials or course endpoints enter this file. */
(function (root) {
  'use strict';
  function create(fetcher) {
    let mode = 'loading';
    let revision = 0;
    let health = null;
    function validate(envelope) {
      const state = envelope && envelope.state;
      if (!state || !state.profile || typeof state.profile !== 'object' || Array.isArray(state.profile) ||
          typeof state.mood !== 'string' || typeof state.craving !== 'string' ||
          !Array.isArray(state.feedback) || typeof state.menuUrl !== 'string' ||
          !Number.isSafeInteger(envelope.revision) || envelope.revision < 0) {
        throw new Error('The server returned invalid saved data. Reload before saving.');
      }
      revision = envelope.revision;
      return envelope;
    }
    async function request(path, options = {}) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      let response;
      try {
        response = await fetcher(path, { credentials: 'same-origin', cache: 'no-store', ...options, signal: controller.signal });
        if (!response.ok) {
          const messages = {
            403: 'Your guest session expired. Reload before saving; your current input is still here.',
            409: 'Data changed in another tab. Reload before saving; your current input is still here.',
            413: 'This workspace is too large to save. Remove a meal photo and retry.',
            422: 'These details could not be saved. Check field lengths, rating, and photo size.',
            503: 'Server storage is unavailable. Your current input is still here; retry when it is available.'
          };
          const error = new Error(messages[response.status] || 'The server could not complete this request. Your current input is still here.');
          error.status = response.status;
          throw error;
        }
        try { return await response.json(); }
        catch { throw new Error('The server returned an invalid response. Your current input is still here.'); }
      } catch (error) {
        if (error && (error.status || error.message.startsWith('The server returned'))) throw error;
        throw new Error('Cannot reach the server. Your current input is still here; no changes were saved.');
      } finally { clearTimeout(timer); }
    }
    async function initialize() {
      try {
        try { health = await request('/api/health'); }
        catch (error) {
          if (error.status === 404) { mode = 'local'; return null; }
          throw error;
        }
        if (!health.ok || !health.database || health.database.ok !== true) throw new Error('The server returned an unavailable database. Reload before saving.');
        const envelope = validate(await request('/api/state'));
        mode = 'server';
        return envelope;
      } catch (error) {
        mode = 'offline';
        throw error;
      }
    }
    async function save(state) {
      if (mode !== 'server') throw new Error('Server storage is not ready. Reload before saving.');
      return validate(await request('/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-ForkCast-Request': '1' },
        body: JSON.stringify({ state, revision })
      }));
    }
    async function clear() {
      if (mode !== 'server') throw new Error('Server storage is not ready. Reload before clearing.');
      return validate(await request('/api/state', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'X-ForkCast-Request': '1' },
        body: JSON.stringify({ revision })
      }));
    }
    async function checkHealth() {
      const checked = await request('/api/health');
      if (!checked.ok || !checked.database || checked.database.ok !== true) {
        throw new Error('Server storage is unavailable. Your current input is still here.');
      }
      health = checked;
      return health;
    }
    return { initialize, save, clear, checkHealth, get mode() { return mode; }, get revision() { return revision; }, get health() { return health; } };
  }
  const api = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ForkCastServer = api;
})(typeof window !== 'undefined' ? window : globalThis);
