const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../core.js');
const Storage = require('../storage.js');
const { DEFAULT_PRODUCTS, DEFAULT_SETTINGS } = require('../products.default.js');

test('approved defaults preserve category order, product identities and reservation prices', () => {
  assert.deepEqual([...new Set(DEFAULT_PRODUCTS.map((product) => product.category))], [
    '園グッズ', '古園服', '古園服【その他】', 'チケット販売', 'チケット販売【予約】', '他'
  ]);
  const bargain = DEFAULT_PRODUCTS.find((product) => product.name === 'お買い得品（一律）');
  assert.equal(bargain.id, '古園服::お買い得品（一律）');
  assert.equal(bargain.category, '古園服【その他】');
  const regular = DEFAULT_PRODUCTS.filter((product) => product.category === 'チケット販売' && product.stockLimit !== undefined);
  const reserved = DEFAULT_PRODUCTS.filter((product) => product.category === 'チケット販売【予約】');
  assert.equal(regular.length, 7);
  assert.equal(reserved.length, 7);
  assert.deepEqual(regular.map((product) => product.stockLimit), Array(7).fill(13));
  assert.deepEqual(reserved.map((product) => product.stockLimit), Array(7).fill(2));
  assert.deepEqual(reserved.map((product) => product.unitPrice), [100, 200, 200, 200, 200, 200, 200]);
  assert.deepEqual(regular.map((product) => product.name[0]), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  assert.deepEqual(DEFAULT_PRODUCTS.filter((product) => product.startNewRow === true).map((product) => product.name), [
    '夏服セーラー', '体操服・長袖', 'カーディガン', 'A ブレスレット作り(09:20〜)'
  ]);
  assert.equal(reserved[0].id, '園グッズ::【予約】A ブレスレット作り(09:20〜)');
  assert.equal(reserved[0].iconPath, 'assets/icons/bracelet-resin-coral.png');
  assert.equal(reserved[1].id, '90d55210-502d-4946-a965-152887a6aa28');
  assert.ok(DEFAULT_PRODUCTS.every((product) => !Object.hasOwn(product, 'icon')));
});

test('a new register starts with approved stock but no exported historical sales', () => {
  const inventory = Core.createInventoryLedger(DEFAULT_PRODUCTS, []);
  assert.deepEqual(inventory.salesByProduct, {});
  assert.deepEqual(inventory.adjustments, []);
  assert.equal(Object.keys(inventory.remainingByProduct).length, 14);
  for (const product of DEFAULT_PRODUCTS.filter((entry) => entry.stockLimit !== undefined)) {
    assert.equal(inventory.remainingByProduct[product.id], product.stockLimit);
  }
  assert.deepEqual(DEFAULT_SETTINGS, {
    enabled: true, category: '古園服', siblings: 1, perSibling: 4,
    productColumnWidth: 'standard', autoBackupEnabled: false, autoBackupIntervalMinutes: 5
  });
  const restored = Core.parseSettingsBundle(Core.settingsBundleToJson(DEFAULT_PRODUCTS, DEFAULT_SETTINGS, inventory));
  assert.deepEqual(restored.warnings, []);
  assert.deepEqual(restored.settings, DEFAULT_SETTINGS);
});

test('new defaults never overwrite saved product or restriction settings', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value))
  };
  assert.deepEqual(Storage.loadProducts(storage, DEFAULT_PRODUCTS).products, DEFAULT_PRODUCTS);
  assert.deepEqual(Storage.loadSettings(storage, DEFAULT_SETTINGS).settings, DEFAULT_SETTINGS);
  const savedProducts = [{ id: 'saved', category: '保存済み', name: '端末の商品', unitPrice: 123, stockLimit: 8 }];
  const savedSettings = { ...DEFAULT_SETTINGS, siblings: 2, perSibling: 3 };
  Storage.saveProducts(storage, savedProducts);
  Storage.saveSettings(storage, savedSettings);
  assert.deepEqual(Storage.loadProducts(storage, DEFAULT_PRODUCTS).products, savedProducts);
  assert.deepEqual(Storage.loadSettings(storage, DEFAULT_SETTINGS).settings, savedSettings);
});
