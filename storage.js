(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SalesRegisterStorage = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // localStorage の読み込み検証と永続化を集約し、UI 側にキー名や復旧手順を漏らさない。
  const PRODUCT_KEY = 'shirayuri-products-v1';
  const TRANSACTION_KEY = 'shirayuri-transactions-v1';
  const SETTINGS_KEY = 'shirayuri-settings-v1';
  const INVENTORY_KEY = 'shirayuri-inventory-v1';

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

  function isInventoryLedger(value) {
    const validCounts = (counts) => counts && typeof counts === 'object' && !Array.isArray(counts)
      && Object.values(counts).every((count) => Number.isInteger(count) && count >= 0);
    const validAdjustments = Array.isArray(value && value.adjustments) && value.adjustments.every((entry) => (
      entry && typeof entry === 'object' && typeof entry.productId === 'string' && typeof entry.recordedAt === 'string'
      && Number.isInteger(entry.after) && entry.after >= 0
      && (entry.before === null || (Number.isInteger(entry.before) && entry.before >= 0))
    ));
    return Boolean(value && typeof value === 'object' && validCounts(value.salesByProduct)
      && validCounts(value.remainingByProduct) && validAdjustments);
  }

  function loadInventory(storage) {
    const raw = storage.getItem(INVENTORY_KEY);
    if (raw === null) return { inventory: null, warning: null };
    try {
      const inventory = JSON.parse(raw);
      if (!isInventoryLedger(inventory)) throw new Error('保存形式が不正です');
      return { inventory, warning: null };
    } catch (error) {
      return { inventory: null, warning: '在庫台帳を読み込めなかったため、会計履歴から再作成しました' };
    }
  }

  function saveInventory(storage, inventory) {
    if (!isInventoryLedger(inventory)) throw new Error('在庫台帳の保存形式が不正です');
    saveJson(storage, INVENTORY_KEY, inventory);
  }

  function saveProductsAndInventory(storage, products, inventory) {
    // localStorage に複数キーの一括トランザクションはないため、先に退避して部分更新を巻き戻す。
    const previousProducts = storage.getItem(PRODUCT_KEY);
    const previousInventory = storage.getItem(INVENTORY_KEY);
    try {
      saveProducts(storage, products);
      saveInventory(storage, inventory);
    } catch (error) {
      try {
        if (previousProducts === null) storage.removeItem(PRODUCT_KEY);
        else storage.setItem(PRODUCT_KEY, previousProducts);
        if (previousInventory === null) storage.removeItem(INVENTORY_KEY);
        else storage.setItem(INVENTORY_KEY, previousInventory);
      } catch (restoreError) {
        // Preserve the original failure for the caller; it can show a single actionable message.
      }
      throw error;
    }
  }

  function saveSalesAndInventory(storage, transactions, inventory) {
    // 会計履歴と在庫台帳も同じ更新として扱い、片方だけの保存で数字が食い違うのを防ぐ。
    const previousTransactions = storage.getItem(TRANSACTION_KEY);
    const previousInventory = storage.getItem(INVENTORY_KEY);
    try {
      saveTransactions(storage, transactions);
      saveInventory(storage, inventory);
    } catch (error) {
      try {
        if (previousTransactions === null) storage.removeItem(TRANSACTION_KEY);
        else storage.setItem(TRANSACTION_KEY, previousTransactions);
        if (previousInventory === null) storage.removeItem(INVENTORY_KEY);
        else storage.setItem(INVENTORY_KEY, previousInventory);
      } catch (restoreError) {
        // Preserve the original failure for the caller; it can show a single actionable message.
      }
      throw error;
    }
  }

  function clearTransactions(storage) {
    storage.removeItem(TRANSACTION_KEY);
  }

  return { loadProducts, saveProducts, saveProductsAndInventory, loadTransactions, saveTransactions, saveSalesAndInventory, clearTransactions, loadInventory, saveInventory, loadSettings, saveSettings };
});

