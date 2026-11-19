const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('starter has a state module for browser-local drafts', () => {
  assert.ok(fs.existsSync(path.join(__dirname, '../state.js')), 'state.js must exist');
});

const State = require('../state.js');
test('drafts round-trip and malformed storage falls back to an empty draft', () => {
  let value;
  const storage = { getItem: () => value, setItem: (key, data) => { value = data; } };
  const draft = State.emptyState();
  draft.profile = { name: 'Linh', allergies: 'Peanuts', budget: '25' };
  draft.mood = 'Comforting';
  assert.equal(State.save(storage, draft), true);
  assert.deepEqual(State.load(storage), draft);
  for (const invalid of ['{', 'null', '[]', '{"feedback":{}}']) {
    value = invalid;
    assert.deepEqual(State.load(storage), State.emptyState());
  }
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('full'); } };
  assert.deepEqual(State.load(blocked), State.emptyState());
  assert.equal(State.save(blocked, draft), false);
});
