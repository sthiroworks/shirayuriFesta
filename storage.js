(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SalesRegisterStorage = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const PRODUCT_KEY = 'shirayuri-products-v1';
  const TRANSACTION_KEY = 'shirayuri-transactions-v1';
  const SETTINGS_KEY = 'shirayuri-settings-v1';

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function loadJson(storage, key, fallback, label, validator) {
    const raw = storage.getItem(key);
    if (raw === null) return { value: clone(fallback), warning: null };
    try {
      const value = JSON.parse(raw);
      if (!Array.isArray(value) || (validator && !value.every(validator))) throw new Error('保存形式が不正です');
      return { value, warning: null };
    } catch (error) {
      return { value: clone(fallback), warning: `${label}の保存データを読み込めなかったため、初期値を使用しました` };
    }
  }

  function saveJson(storage, key, value) {
    storage.setItem(key, JSON.stringify(value));
  }

  function loadSettings(storage, fallbackSettings) {
    const fallback = fallbackSettings || { enabled: true, category: '古園服', siblings: 1, perSibling: 4 };
    const raw = storage.getItem(SETTINGS_KEY);
    if (raw === null) return { settings: clone(fallback), warning: null };
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value !== 'object' || typeof value.enabled !== 'boolean' || typeof value.category !== 'string' || !Number.isFinite(value.siblings) || !Number.isFinite(value.perSibling)) throw new Error('保存形式が不正です');
      return { settings: value, warning: null };
    } catch (error) {
      return { settings: clone(fallback), warning: '設定の保存データを読み込めなかったため、初期値を使用しました' };
    }
  }

  function saveSettings(storage, settings) {
    saveJson(storage, SETTINGS_KEY, settings);
  }

  function isProduct(value) {
    return Boolean(value && typeof value === 'object' && typeof value.id === 'string' && typeof value.category === 'string' && typeof value.name === 'string' && Number.isFinite(value.unitPrice) && (value.stockLimit === undefined || (Number.isInteger(value.stockLimit) && value.stockLimit >= 0)));
  }

  function isTransaction(value) {
    return Boolean(value && typeof value === 'object' && typeof value.id === 'string' && typeof value.recordedAt === 'string' && Number.isFinite(value.total) && Number.isFinite(value.received) && Number.isFinite(value.change) && Number.isFinite(value.itemCount) && Array.isArray(value.items));
  }

  function loadProducts(storage, fallbackProducts) {
    const result = loadJson(storage, PRODUCT_KEY, fallbackProducts || [], '商品一覧', isProduct);
    return { products: result.value, warning: result.warning };
  }

  function saveProducts(storage, products) {
    saveJson(storage, PRODUCT_KEY, products);
  }

  function loadTransactions(storage) {
    const result = loadJson(storage, TRANSACTION_KEY, [], '会計履歴', isTransaction);
    return { transactions: result.value, warning: result.warning };
  }

  function saveTransactions(storage, transactions) {
    saveJson(storage, TRANSACTION_KEY, transactions);
  }

  function clearTransactions(storage) {
    storage.removeItem(TRANSACTION_KEY);
  }

  return { loadProducts, saveProducts, loadTransactions, saveTransactions, clearTransactions, loadSettings, saveSettings };
});

