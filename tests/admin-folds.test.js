const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('admin groups collapse independently and copying reveals the add form', () => {
  const html = read('index.html');
  const app = read('app.js');
  const majorGroups = [...html.matchAll(/<details id="([^"]+)" class="admin-section admin-fold[^"]*"( open)?>/g)];
  assert.deepEqual(majorGroups.map((match) => match[1]), [
    'product-management-panel', 'settings-panel', 'history-backup-panel', 'data-transfer-panel'
  ]);
  assert.deepEqual(majorGroups.filter((match) => match[2]).map((match) => match[1]), ['product-management-panel']);
  const subgroups = [...html.matchAll(/<details id="([^"]+)" class="admin-subfold"( open)?>/g)];
  assert.deepEqual(subgroups.filter((match) => match[2]).map((match) => match[1]), ['registered-products-fold', 'history-export-fold']);
  assert.ok(subgroups.some((match) => match[1] === 'product-add-fold' && !match[2]));
  assert.match(app, /let fold = elements\.productAddForm\.closest\('details'\);[\s\S]*?while \(fold\) \{[\s\S]*?fold\.open = true;[\s\S]*?fold = fold\.parentElement\.closest\('details'\);/);
});
