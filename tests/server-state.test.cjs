const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const empty = () => ({ profile: {}, mood: '', craving: '', feedback: [], menuUrl: '' });
const health = { ok: true, database: { ok: true, schema_version: 1 }, services: { text: { configured: true }, vision: { configured: true } } };
function create(fetcher) {
  assert.ok(existsSync(resolve(__dirname, '../server-state.js')), 'The server persistence adapter must be implemented');
  return require('../server-state.js').create(fetcher);
}
const response = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('server adapter initializes from the guest state rather than a local draft', async () => {
  const saved = { ...empty(), craving: 'Warm noodles' };
  const requests = [];
  const client = create(async (path, options) => {
    requests.push({ path, options });
    return response(200, path === '/api/health' ? health : { state: saved, revision: 3 });
  });
  const loaded = await client.initialize();
  assert.equal(client.mode, 'server');
  assert.deepEqual(loaded.state, saved);
  assert.equal(client.revision, 3);
  assert.deepEqual(requests.map(r => r.path), ['/api/health', '/api/state']);
  assert.ok(requests.every(r => r.options.credentials === 'same-origin'));
});

test('server adapter saves using its revision and same-origin protection header', async () => {
  const requests = [];
  const client = create(async (path, options) => {
    requests.push({ path, options });
    if (path === '/api/health') return response(200, health);
    return response(200, { state: empty(), revision: options.method === 'PUT' ? 4 : 3 });
  });
  await client.initialize();
  await client.save(empty());
  const request = requests.at(-1);
  assert.equal(request.options.method, 'PUT');
  assert.equal(request.options.headers['X-ForkCast-Request'], '1');
  assert.deepEqual(JSON.parse(request.options.body), { state: empty(), revision: 3 });
  assert.equal(client.revision, 4);
});

test('clear resets only this server workspace with a checked revision', async () => {
  const calls = [];
  const client = create(async (path, options) => {
    calls.push({ path, options });
    return response(200, path === '/api/health' ? health : { state: empty(), revision: options.method === 'DELETE' ? 6 : 5 });
  });
  await client.initialize();
  await client.clear();
  const last = calls.at(-1);
  assert.equal(last.options.method, 'DELETE');
  assert.deepEqual(JSON.parse(last.options.body), { revision: 5 });
  assert.equal(client.revision, 6);
});

test('an explicit static-server 404 selects browser-only preview without a write', async () => {
  const calls = [];
  const client = create(async (path, options) => { calls.push(path); return response(404, {}); });
  const result = await client.initialize();
  assert.equal(result, null);
  assert.equal(client.mode, 'local');
  assert.deepEqual(calls, ['/api/health']);
});

test('status refresh checks health without reloading or overwriting workspace data', async () => {
  const paths = [];
  const client = create(async (path, options) => { paths.push(path); return response(200, path === '/api/health' ? health : { state: empty(), revision: 2 }); });
  await client.initialize();
  const checked = await client.checkHealth();
  assert.deepEqual(checked, health);
  assert.equal(client.revision, 2);
  assert.deepEqual(paths, ['/api/health', '/api/state', '/api/health']);
});

for (const status of [403, 409, 413, 422, 503]) {
  test(`failed server save (${status}) never falls back to browser storage or advances revision`, async () => {
    const client = create(async (path, options) => {
      if (path === '/api/health') return response(200, health);
      return options.method === 'PUT' ? response(status, { detail: 'upstream-secret-must-not-be-shown' }) : response(200, { state: empty(), revision: 8 });
    });
    await client.initialize();
    await assert.rejects(client.save(empty()), error => !error.message.includes('upstream-secret'));
    assert.equal(client.mode, 'server');
    assert.equal(client.revision, 8);
  });
}
test('a network failure at startup is not treated as a static preview', async () => {
  const client = create(async () => { throw new TypeError('network'); });
  await assert.rejects(client.initialize(), /Cannot reach the server/);
  assert.equal(client.mode, 'offline');
});
test('a state 404 after successful health is a backend error, not a local preview', async () => {
  const client = create(async path => response(path === '/api/health' ? 200 : 404, health));
  await assert.rejects(client.initialize());
  assert.equal(client.mode, 'offline');
});
test('malformed state cannot be loaded or treated as persisted', async () => {
  const client = create(async path => response(200, path === '/api/health' ? health : { state: { ...empty(), profile: [] }, revision: 0 }));
  await assert.rejects(client.initialize(), /invalid saved data/);
  assert.equal(client.mode, 'offline');
});
test('save can be retried after a transient failure without changing the expected revision', async () => {
  let failing = true;
  const client = create(async (path, options) => {
    if (path === '/api/health') return response(200, health);
    if (options.method === 'PUT') {
      assert.equal(JSON.parse(options.body).revision, 2);
      return response(failing ? 503 : 200, { state: empty(), revision: 3 });
    }
    return response(200, { state: empty(), revision: 2 });
  });
  await client.initialize();
  await assert.rejects(client.save(empty()));
  failing = false;
  await client.save(empty());
  assert.equal(client.revision, 3);
});
