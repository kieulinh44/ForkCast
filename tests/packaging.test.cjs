const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
test('Docker copy sources exist in the reproducible source package', () => {
  const lines = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8').split('\n');
  for (const line of lines.filter(x => x.startsWith('COPY '))) {
    for (const source of line.split(/\s+/).slice(1, -1)) {
      if (source.includes('*')) {
        const directory = path.dirname(source);
        const suffix = source.split('*').at(-1);
        assert.ok(fs.readdirSync(path.join(root, directory)).some(name => name.endsWith(suffix)), source);
      } else assert.ok(fs.existsSync(path.join(root, source)), `Missing Docker COPY source: ${source}`);
    }
  }
});
