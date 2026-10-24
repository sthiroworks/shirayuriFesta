const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Storage = require('../storage.js');
const { DEFAULT_PRODUCTS } = require('../products.default.js');

function fakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

test('default products contain current-day categories and ticket', () => {
  assert.equal(DEFAULT_PRODUCTS.length, 40);
  assert.equal(DEFAULT_PRODUCTS.filter((product) => product.category === '園グッズ').length, 10);
  assert.equal(DEFAULT_PRODUCTS.filter((product) => product.category === '古園服').length, 7);
  assert.equal(DEFAULT_PRODUCTS.filter((product) => product.category === '古園服【その他】').length, 3);
  assert.equal(DEFAULT_PRODUCTS.filter((product) => product.category === 'チケット販売【予約】').length, 7);
  assert.equal(DEFAULT_PRODUCTS.find((product) => product.name === 'ありがとうチケット').unitPrice, -50);
  assert.equal(DEFAULT_PRODUCTS.find((product) => product.name === '手提げ').iconPath, 'assets/icons/tote-bag.png');
  assert.equal(DEFAULT_PRODUCTS.every((product) => typeof product.iconPath === 'string'), true);
  assert.equal(new Set(DEFAULT_PRODUCTS.map((product) => product.id)).size, DEFAULT_PRODUCTS.length);
  assert.equal(new Set(DEFAULT_PRODUCTS.filter((product) => product.category === 'チケット販売').map((product) => product.iconPath)).size, 12);
  assert.equal(DEFAULT_PRODUCTS.every((product) => fs.existsSync(path.join(__dirname, '..', product.iconPath))), true);
});

test('loadProducts uses defaults when storage is empty and round-trips products', () => {
  const storage = fakeStorage();
  const loaded = Storage.loadProducts(storage, DEFAULT_PRODUCTS);
  assert.deepEqual(loaded.products, DEFAULT_PRODUCTS);
  assert.equal(loaded.warning, null);

  const replacement = [DEFAULT_PRODUCTS[0]];
  Storage.saveProducts(storage, replacement);
  assert.deepEqual(Storage.loadProducts(storage, DEFAULT_PRODUCTS).products, replacement);
});

test('loadProducts falls back from malformed storage with a warning', () => {
  const storage = fakeStorage({ 'shirayuri-products-v1': '{broken' });
  const result = Storage.loadProducts(storage, DEFAULT_PRODUCTS);
  assert.deepEqual(result.products, DEFAULT_PRODUCTS);
  assert.match(result.warning, /商品/);
});

test('loadProducts rejects arrays with malformed product entries', () => {
  const storage = fakeStorage({ 'shirayuri-products-v1': JSON.stringify([null]) });
  const result = Storage.loadProducts(storage, DEFAULT_PRODUCTS);
  assert.deepEqual(result.products, DEFAULT_PRODUCTS);
  assert.match(result.warning, /商品/);
});

test('transactions round-trip and clear without removing products', () => {
  const storage = fakeStorage();
  Storage.saveProducts(storage, DEFAULT_PRODUCTS);
  const transactions = [{ id: 'tx-1', recordedAt: '2026-10-12T03:00:00.000Z', total: 100, received: 100, change: 0, itemCount: 0, items: [] }];
  Storage.saveTransactions(storage, transactions);
  assert.deepEqual(Storage.loadTransactions(storage).transactions, transactions);

  Storage.clearTransactions(storage);
  assert.deepEqual(Storage.loadTransactions(storage).transactions, []);
  assert.deepEqual(Storage.loadProducts(storage, []).products, DEFAULT_PRODUCTS);
});

test('inventory ledger survives clearing transaction history', () => {
  const storage = fakeStorage();
  const inventory = {
    salesByProduct: { 'p1': 4 },
    remainingByProduct: { 'p1': 2 },
    adjustments: [],
  };
  Storage.saveInventory(storage, inventory);
  Storage.saveTransactions(storage, [{ id: 'tx1', recordedAt: '2026-10-12T03:00:00.000Z', total: 100, received: 100, change: 0, itemCount: 1, items: [] }]);
  Storage.clearTransactions(storage);
  assert.deepEqual(Storage.loadTransactions(storage).transactions, []);
  assert.deepEqual(Storage.loadInventory(storage).inventory, inventory);
});

test('loadInventory initializes as absent and rejects malformed ledgers with a warning', () => {
  const storage = fakeStorage();
  assert.deepEqual(Storage.loadInventory(storage), { inventory: null, warning: null });
  storage.setItem('shirayuri-inventory-v1', JSON.stringify({ salesByProduct: { p1: -1 }, remainingByProduct: {}, adjustments: [] }));
  const result = Storage.loadInventory(storage);
  assert.equal(result.inventory, null);
  assert.match(result.warning, /在庫台帳/);
});

test('sales and inventory are rolled back together when saving either fails', () => {
  const storage = fakeStorage({ 'shirayuri-transactions-v1': '[]', 'shirayuri-inventory-v1': JSON.stringify({ salesByProduct: {}, remainingByProduct: {}, adjustments: [] }) });
  const originalSet = storage.setItem;
  let failInventoryOnce = true;
  storage.setItem = (key, value) => {
    if (key === 'shirayuri-inventory-v1' && failInventoryOnce) {
      failInventoryOnce = false;
      throw new Error('quota');
    }
    originalSet(key, value);
  };
  assert.throws(() => Storage.saveSalesAndInventory(storage, [{ id: 'new' }], { salesByProduct: {}, remainingByProduct: {}, adjustments: [] }), /quota/);
  assert.equal(storage.getItem('shirayuri-transactions-v1'), '[]');
  assert.deepEqual(Storage.loadInventory(storage).inventory, { salesByProduct: {}, remainingByProduct: {}, adjustments: [] });
});

test('loadTransactions falls back from malformed storage with a warning', () => {
  const storage = fakeStorage({ 'shirayuri-transactions-v1': 'not-json' });
  const result = Storage.loadTransactions(storage);
  assert.deepEqual(result.transactions, []);
  assert.match(result.warning, /履歴/);
});

test('loadTransactions rejects arrays with malformed transaction entries', () => {
  const storage = fakeStorage({ 'shirayuri-transactions-v1': JSON.stringify([null]) });
  const result = Storage.loadTransactions(storage);
  assert.deepEqual(result.transactions, []);
  assert.match(result.warning, /履歴/);
});

test('settings round-trip and malformed settings use the supplied defaults', () => {
  const defaults = { enabled: true, category: '古園服', siblings: 1, perSibling: 4 };
  const storage = fakeStorage();
  assert.deepEqual(Storage.loadSettings(storage, defaults).settings, defaults);
  const changed = { enabled: true, category: '古園服', siblings: 2, perSibling: 3 };
  Storage.saveSettings(storage, changed);
  assert.deepEqual(Storage.loadSettings(storage, defaults).settings, changed);

  storage.setItem('shirayuri-settings-v1', '{broken');
  const result = Storage.loadSettings(storage, defaults);
  assert.deepEqual(result.settings, defaults);
  assert.match(result.warning, /設定/);
});

