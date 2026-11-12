const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const targetId = '園グッズ::【予約】A ブレスレット作り(09:20〜)';
const marker = 'shirayuri-bracelet-price-200-v1';
const productKey = 'shirayuri-products-v1';
const legacyReservation = Object.freeze({
  id: targetId,
  category: 'チケット販売【予約】',
  name: '【予約】A ブレスレット作り(09:20〜)',
  unitPrice: 200,
  iconPath: 'assets/icons/bracelet-resin-coral.png',
  stockLimit: 2,
});

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  const writes = [];
  let blockedKey = null;
  return {
    writes,
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem(key, value) {
      if (key === blockedKey) throw new Error('quota exceeded');
      writes.push(key);
      values.set(key, String(value));
    },
    block(key) { blockedKey = key; },
  };
}

for (const directory of ['', 'dist/']) {
  const prefix = directory || 'source/';
  const Storage = require('../' + directory + 'storage.js');
  const { DEFAULT_PRODUCTS } = require('../' + directory + 'products.default.js');
  const target = legacyReservation;

  test(prefix + 'every default bracelet slot costs 200 yen', () => {
    const bracelets = DEFAULT_PRODUCTS.filter((product) => product.name.includes('ブレスレット作り'));
    assert.equal(bracelets.length, 7);
    assert.ok(bracelets.every((product) => product.unitPrice === 200));
  });

  test(prefix + 'only the legacy 100-yen reservation changes; identities, stock, history and settings remain intact', () => {
    const legacy = Object.freeze({ ...target, unitPrice: 100, stockLimit: 7, startNewRow: true, icon: 'custom-icon' });
    const other = Object.freeze({ id: 'cup', name: 'コップ袋', category: '園グッズ', unitPrice: 100 });
    const products = Object.freeze([legacy, other]);
    const history = JSON.stringify([{ id: 'sale-1', total: 100, received: 100, change: 0, items: [{ productId: targetId, quantity: 1, unitPrice: 100 }] }]);
    const inventory = JSON.stringify({ salesByProduct: { [targetId]: 1 }, remainingByProduct: { [targetId]: 6 }, adjustments: [] });
    const settings = JSON.stringify({ category: '古園服', siblings: 2 });
    const storage = memoryStorage({
      [productKey]: JSON.stringify(products),
      'shirayuri-transactions-v1': history,
      'shirayuri-inventory-v1': inventory,
      'shirayuri-settings-v1': settings,
    });
    const result = Storage.migrateLegacyBraceletPrice(storage, products);
    assert.equal(result.corrected, true);
    assert.equal(result.warning, null);
    assert.deepEqual(result.products[0], { ...legacy, unitPrice: 200 });
    assert.strictEqual(result.products[1], other);
    assert.equal(legacy.unitPrice, 100, 'do not mutate the caller data');
    assert.equal(Storage.loadProducts(storage, []).products[0].unitPrice, 200);
    assert.equal(storage.getItem('shirayuri-transactions-v1'), history);
    assert.equal(storage.getItem('shirayuri-inventory-v1'), inventory);
    assert.equal(storage.getItem('shirayuri-settings-v1'), settings);
    assert.deepEqual(storage.writes, [productKey, marker]);
  });

  test(prefix + 'the one-time correction does not override later intentional prices', () => {
    const storage = memoryStorage();
    Storage.migrateLegacyBraceletPrice(storage, [{ ...target, unitPrice: 100 }]);
    const later = [{ ...target, unitPrice: 100 }];
    Storage.saveProducts(storage, later);
    const writesBefore = storage.writes.length;
    const result = Storage.migrateLegacyBraceletPrice(storage, later);
    assert.strictEqual(result.products, later);
    assert.equal(result.corrected, false);
    assert.equal(storage.writes.length, writesBefore);
    assert.equal(Storage.loadProducts(storage, []).products[0].unitPrice, 100);
  });

  test(prefix + 'custom prices, other IDs and a repurposed product are not rewritten', () => {
    const products = [
      { ...target, unitPrice: 250 },
      { ...target, id: 'user-created-bracelet', unitPrice: 100 },
      { ...target, name: '別の商品', unitPrice: 100 },
    ];
    const storage = memoryStorage({ [productKey]: JSON.stringify(products) });
    const result = Storage.migrateLegacyBraceletPrice(storage, products);
    assert.equal(result.corrected, false);
    assert.deepEqual(result.products, products);
    assert.deepEqual(JSON.parse(storage.getItem(productKey)), products);
    assert.deepEqual(storage.writes, [marker]);
  });

  test(prefix + 'a failed product write warns without marking the migration complete and can retry', () => {
    const products = [{ ...target, unitPrice: 100 }];
    const storage = memoryStorage({ [productKey]: JSON.stringify(products) });
    storage.block(productKey);
    const failed = Storage.migrateLegacyBraceletPrice(storage, products);
    assert.strictEqual(failed.products, products);
    assert.equal(failed.corrected, false);
    assert.match(failed.warning, /200円/);
    assert.equal(storage.getItem(marker), null);
    assert.equal(JSON.parse(storage.getItem(productKey))[0].unitPrice, 100);
    storage.block(null);
    const retried = Storage.migrateLegacyBraceletPrice(storage, products);
    assert.equal(retried.products[0].unitPrice, 200);
    assert.equal(storage.getItem(marker), 'done');
  });

  test(prefix + 'a marker failure keeps the successfully saved 200-yen price', () => {
    const products = [{ ...target, unitPrice: 100 }];
    const storage = memoryStorage({ [productKey]: JSON.stringify(products) });
    storage.block(marker);
    const result = Storage.migrateLegacyBraceletPrice(storage, products);
    assert.equal(result.corrected, true);
    assert.equal(result.products[0].unitPrice, 200);
    assert.equal(JSON.parse(storage.getItem(productKey))[0].unitPrice, 200);
    assert.match(result.warning, /完了記録/);
    assert.equal(storage.getItem(marker), null);
  });

  test(prefix + 'shared startup returns before the local-only correction and changed scripts bust the cache', () => {
    const app = fs.readFileSync(path.join(__dirname, '..', directory, 'app.js'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '..', directory, 'index.html'), 'utf8');
    const sharedBranch = app.lastIndexOf('    if (D1Client && D1Client.isConfigured()) {');
    const correction = app.indexOf('const priceCorrection = Storage.migrateLegacyBraceletPrice');
    assert.ok(sharedBranch >= 0 && correction > sharedBranch);
    assert.match(app.slice(sharedBranch, correction), /\breturn;\s*\}\s*\/\/[^\n]*\n\s*$/);
    assert.equal((app.match(/Storage\.migrateLegacyBraceletPrice\(/g) || []).length, 1);
    for (const filename of ['storage.js', 'products.default.js', 'app.js']) {
      const scriptSrc = html.match(new RegExp('src="' + filename.replace(/\./g, '\\.') + '\\?v=(\\d{8})[^"\\s]*"'));
      assert.ok(scriptSrc && scriptSrc[1] >= '20261102', filename + ' must load the price correction or a newer version');
    }
  });
}
