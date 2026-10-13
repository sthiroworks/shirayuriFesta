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
  assert.equal(DEFAULT_PRODUCTS.filter((product) => product.category === '園グッズ').length, 10);
  assert.equal(DEFAULT_PRODUCTS.filter((product) => product.category === '古園服').length, 10);
  assert.equal(DEFAULT_PRODUCTS.find((product) => product.name === 'ありがとうチケット').unitPrice, -50);
  assert.equal(DEFAULT_PRODUCTS.find((product) => product.name === '手提げ').iconPath, 'assets/icons/tote-bag.png');
  assert.equal(DEFAULT_PRODUCTS.every((product) => typeof product.iconPath === 'string'), true);
  assert.equal(new Set(DEFAULT_PRODUCTS.map((product) => product.iconPath)).size, DEFAULT_PRODUCTS.length);
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

