(function (root) {
  'use strict';

  const Core = root.SalesRegisterCore;
  const Storage = root.SalesRegisterStorage;
  const fallbackProducts = root.DEFAULT_PRODUCTS || [];
  const PRODUCT_COLUMN_WIDTHS = Object.freeze({
    compact: { desktop: 180, mobile: 125, desktopColumns: 5, mobileColumns: 3, icon: 70, tabletIcon: 58, phoneIcon: 44 },
    standard: { desktop: 200, mobile: 145, desktopColumns: 4, mobileColumns: 2, icon: 78, tabletIcon: 66, phoneIcon: 56 },
    wide: { desktop: 230, mobile: 280, desktopColumns: 3, mobileColumns: 1, icon: 88, tabletIcon: 76, phoneIcon: 72 },
  });

  function normalizeProductColumnWidth(value) {
    const key = String(value || '').trim();
    return Object.prototype.hasOwnProperty.call(PRODUCT_COLUMN_WIDTHS, key) ? key : 'standard';
  }
  const memoryStorage = (() => {
    const values = new Map();
    return {
      getItem: (key) => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    };
  })();

  function getStorage() {
    try {
      const storage = root.localStorage;
      const probe = '__shirayuri_probe__';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      return { storage, warning: null };
    } catch (error) {
      return { storage: memoryStorage, warning: 'ブラウザの保存機能が利用できないため、この起動中だけ一時保存します。' };
    }
  }

  const storageInfo = getStorage();
  const storage = storageInfo.storage;
  const productState = Storage.loadProducts(storage, fallbackProducts);
  const transactionState = Storage.loadTransactions(storage);
  const inventoryState = Storage.loadInventory(storage);
  const defaultSettings = {
    enabled: true,
    category: '古園服',
    siblings: 1,
    perSibling: 4,
    productColumnWidth: 'standard',
    autoBackupEnabled: false,
    autoBackupIntervalMinutes: 5,
    autoBackupLastAt: '',
    historyBackupLastAt: '',
  };
  const settingsState = Storage.loadSettings(storage, defaultSettings);
  settingsState.settings = {
    ...defaultSettings,
    ...settingsState.settings,
    productColumnWidth: normalizeProductColumnWidth(settingsState.settings && settingsState.settings.productColumnWidth),
  };
  const defaultIcons = new Map(fallbackProducts.map((product) => [product.id, product.icon]).filter((entry) => entry[1]));
  const defaultIconPaths = new Map(fallbackProducts.map((product) => [product.id, product.iconPath]).filter((entry) => entry[1]));
  const productsWithIcons = productState.products.map((product) => {
    if (product.icon && String(product.icon).startsWith('data:image/')) return product;
    if (defaultIconPaths.has(product.id)) return { ...product, icon: '', iconPath: defaultIconPaths.get(product.id) };
    if (product.icon || product.iconPath) return product;
    if (defaultIcons.has(product.id)) return { ...product, icon: defaultIcons.get(product.id) };
    return product;
  });
  const state = {
    products: productsWithIcons,
    transactions: transactionState.transactions,
    inventory: inventoryState.inventory,
    settings: settingsState.settings,
    cart: new Map(),
    cartProducts: new Map(),
    received: '',
    period: 'today',
    hourlyMetric: 'transactions',
    hourlyStartHour: 0,
    hourlyEndHour: 23,
    hourlySort: 'hour',
    hourlyHideEmpty: false,
    collapsedCategories: new Set(),
    hiddenCategories: new Set(),
    checkoutHeight: null,
    editingTransactionId: null,
    statusTimer: null,
    autoBackupTimer: null,
    autoBackupInProgress: false,
    backupDirectoryHandle: null,
    temporaryCheckoutSiblings: null,
    historySearch: '',
    historyFrom: '',
    historyTo: '',
    historyVisibleCount: 20,
    undoTransactionId: null,
    undoTimer: null,
    lastBackupError: '',
  };

  const $ = (selector) => document.querySelector(selector);
  const elements = {};

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  }

  function productNameMarkup(value) {
    return escapeHtml(value).replace(/\\n|\r?\n/g, '<br>');
  }

  function productNameText(value) {
    return String(value == null ? '' : value).replace(/\\n|\r?\n/g, ' ').trim();
  }

  function formatYen(value) {
    return `¥${Math.round(Number(value) || 0).toLocaleString('ja-JP')}`;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '日時不明';
    return date.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function localDateInputValue(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (number) => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function applyProductColumnWidth() {
    const columnWidth = normalizeProductColumnWidth(state.settings.productColumnWidth);
    const widths = PRODUCT_COLUMN_WIDTHS[columnWidth];
    root.document.documentElement.dataset.productColumnWidth = columnWidth;
    root.document.documentElement.style.setProperty('--product-card-min-width', `${widths.desktop}px`);
    root.document.documentElement.style.setProperty('--product-card-mobile-min-width', `${widths.mobile}px`);
    root.document.documentElement.style.setProperty('--product-grid-columns', String(widths.desktopColumns));
    root.document.documentElement.style.setProperty('--product-grid-columns-mobile', String(widths.mobileColumns));
    root.document.documentElement.style.setProperty('--product-icon-size', `${widths.icon}px`);
    root.document.documentElement.style.setProperty('--product-icon-tablet-size', `${widths.tabletIcon}px`);
    root.document.documentElement.style.setProperty('--product-icon-phone-size', `${widths.phoneIcon}px`);
  }

  function setStatus(message, kind) {
    if (state.statusTimer) root.clearTimeout(state.statusTimer);
    elements.status.textContent = message || '';
    elements.status.className = `status ${kind || ''}`;
    state.statusTimer = null;
    if (!message) return;
    const duration = kind === 'error' ? 7000 : 4500;
    state.statusTimer = root.setTimeout(() => {
      elements.status.textContent = '';
      elements.status.className = 'status';
      state.statusTimer = null;
    }, duration);
  }

  function findProduct(id) {
    return state.cartProducts.get(id) || state.products.find((product) => product.id === id);
  }

  function getCartLines() {
    return Array.from(state.cart.entries()).map(([id, quantity]) => ({ product: findProduct(id), quantity })).filter((line) => line.product);
  }

  function readOptionalStockLimit(input) {
    const raw = input ? input.value.trim() : '';
    if (!raw) return { valid: true, value: null };
    const value = Number(raw);
    return { valid: Number.isInteger(value) && value >= 0, value };
  }

  function isTransactionItemForProduct(item, product) {
    if (item && item.productId) return item.productId === product.id;
    return Boolean(item && item.category === product.category && item.name === product.name);
  }

  function getProductSales(product, excludedTransactionId) {
    const ledger = state.inventory || { salesByProduct: {} };
    let total = Math.max(0, Number(ledger.salesByProduct[product.id]) || 0);
    if (excludedTransactionId) {
      const transaction = state.transactions.find((item) => item.id === excludedTransactionId);
      total -= (transaction && transaction.items || []).reduce((sum, item) => (
        sum + (isTransactionItemForProduct(item, product) ? Math.max(0, Number(item.quantity) || 0) : 0)
      ), 0);
    }
    return Math.max(0, total);
  }

  function getEditingProductQuantity(product) {
    const transaction = state.transactions.find((item) => item.id === state.editingTransactionId);
    if (!transaction) return 0;
    return (transaction.items || []).reduce((total, item) => (
      total + (isTransactionItemForProduct(item, product) ? Math.max(0, Number(item.quantity) || 0) : 0)
    ), 0);
  }

  function getProductStockInfo(product) {
    const hasLimit = Number.isInteger(product && product.stockLimit) && product.stockLimit >= 0;
    const sold = getProductSales(product, state.editingTransactionId);
    const editingQuantity = getEditingProductQuantity(product);
    const ledger = state.inventory || { remainingByProduct: {} };
    const hasPhysicalCount = Object.prototype.hasOwnProperty.call(ledger.remainingByProduct, product.id);
    const committedRemaining = hasPhysicalCount
      ? Math.max(0, Number(ledger.remainingByProduct[product.id]) || 0)
      : (hasLimit ? Math.max(0, product.stockLimit - getProductSales(product)) : null);
    const physicalRemaining = committedRemaining == null ? Infinity : committedRemaining + editingQuantity;
    const limitRemaining = hasLimit ? Math.max(0, product.stockLimit - sold) : Infinity;
    const available = Math.min(physicalRemaining, limitRemaining);
    if (!Number.isFinite(available)) return { limited: false, sold, editingQuantity, remaining: null, maxQuantity: null };
    const remaining = Math.max(0, available);
    return { limited: true, sold, editingQuantity, remaining, maxQuantity: remaining };
  }

  function cloneInventoryLedger() {
    const source = state.inventory || { salesByProduct: {}, remainingByProduct: {}, adjustments: [] };
    return {
      salesByProduct: { ...(source.salesByProduct || {}) },
      remainingByProduct: { ...(source.remainingByProduct || {}) },
      adjustments: Array.isArray(source.adjustments) ? source.adjustments.slice() : [],
    };
  }

  function updateInventoryForProductChange(ledger, previousProduct, nextProduct) {
    const next = {
      salesByProduct: { ...(ledger.salesByProduct || {}) },
      remainingByProduct: { ...(ledger.remainingByProduct || {}) },
      adjustments: Array.isArray(ledger.adjustments) ? ledger.adjustments.slice() : [],
    };
    const id = nextProduct.id;
    const sold = Math.max(0, Number(next.salesByProduct[id]) || 0);
    const oldLimit = previousProduct && Number.isInteger(previousProduct.stockLimit) && previousProduct.stockLimit >= 0
      ? previousProduct.stockLimit : null;
    const newLimit = Number.isInteger(nextProduct.stockLimit) && nextProduct.stockLimit >= 0 ? nextProduct.stockLimit : null;
    if (newLimit === null) {
      delete next.remainingByProduct[id];
    } else if (oldLimit === null) {
      next.remainingByProduct[id] = Math.max(0, newLimit - sold);
    } else {
      const currentRemaining = Object.prototype.hasOwnProperty.call(next.remainingByProduct, id)
        ? Math.max(0, Number(next.remainingByProduct[id]) || 0)
        : Math.max(0, oldLimit - sold);
      next.remainingByProduct[id] = Math.max(0, currentRemaining + newLimit - oldLimit);
    }
    return next;
  }

  function addInventoryForProduct(ledger, product) {
    const next = {
      salesByProduct: { ...(ledger.salesByProduct || {}) },
      remainingByProduct: { ...(ledger.remainingByProduct || {}) },
      adjustments: Array.isArray(ledger.adjustments) ? ledger.adjustments.slice() : [],
    };
    next.salesByProduct[product.id] = Math.max(0, Number(next.salesByProduct[product.id]) || 0);
    if (Number.isInteger(product.stockLimit) && product.stockLimit >= 0) {
      next.remainingByProduct[product.id] = Math.max(0, product.stockLimit - next.salesByProduct[product.id]);
    }
    return next;
  }

  function migrateLegacyTransactionProductIds() {
    const productsByName = new Map();
    state.products.forEach((product) => {
      productsByName.set(`${product.category}::${product.name}`, product);
      productsByName.set(product.id, product);
    });
    let changed = false;
    state.transactions.forEach((transaction) => {
      (transaction.items || []).forEach((item) => {
        if (item.productId) return;
        const product = productsByName.get(`${item.category}::${item.name}`);
        if (!product) return;
        item.productId = product.id;
        changed = true;
      });
    });
    if (changed) {
      try {
        Storage.saveTransactions(storage, state.transactions);
      } catch (error) {
        // In-memory migration still works for this session if persistence is unavailable.
      }
    }
  }

  function initializeInventoryLedger() {
    if (!state.inventory) state.inventory = Core.createInventoryLedger(state.products, state.transactions);
    const nextInventory = cloneInventoryLedger();
    state.products.forEach((product) => {
      if (!Number.isInteger(product.stockLimit) || product.stockLimit < 0) return;
      nextInventory.salesByProduct[product.id] = Math.max(0, Number(nextInventory.salesByProduct[product.id]) || 0);
      if (!Object.prototype.hasOwnProperty.call(nextInventory.remainingByProduct, product.id)) {
        nextInventory.remainingByProduct[product.id] = Math.max(0, product.stockLimit - nextInventory.salesByProduct[product.id]);
      }
    });
    state.inventory = nextInventory;
    try {
      Storage.saveInventory(storage, state.inventory);
      return '';
    } catch (error) {
      return '在庫情報を保存できませんでした。ブラウザの空き容量を確認してください。';
    }
  }

  function getCheckoutLimitSettings() {
    if (state.temporaryCheckoutSiblings == null) return state.settings;
    return { ...state.settings, siblings: state.temporaryCheckoutSiblings };
  }

  function setTemporaryCheckoutSiblings(value) {
    const fallback = Math.max(1, Math.floor(Number(state.settings.siblings) || 1));
    const next = Math.max(1, Math.floor(Number(value) || fallback));
    state.temporaryCheckoutSiblings = next === fallback ? null : next;
    renderCart();
    renderCatalog();
  }

  function changeQuantity(id, nextQuantity) {
    let quantity = Math.max(0, Math.floor(Number(nextQuantity) || 0));
    const product = findProduct(id);
    if (product) {
      const stock = getProductStockInfo(product);
      if (stock.limited && quantity > stock.maxQuantity) {
        quantity = stock.maxQuantity;
        setStatus(`${product.name}は在庫上限（${product.stockLimit}個）に達しています。`, 'error');
      }
    }
    if (quantity === 0) state.cart.delete(id);
    else state.cart.set(id, quantity);
    renderCart();
    renderCatalog();
  }

  function handleReceivedQuickAction(event) {
    const button = event.target.closest('[data-received-add], [data-received-action]');
    if (!button) return;
    if (button.dataset.receivedAction === 'clear') {
      state.received = '';
    } else {
      const current = Math.max(0, Number(state.received) || 0);
      const addition = Math.max(0, Number(button.dataset.receivedAdd) || 0);
      state.received = String(current + addition);
    }
    elements.received.value = state.received;
    renderCart();
  }

  function clearCartState() {
    state.cart.clear();
    state.cartProducts.clear();
    state.received = '';
    state.editingTransactionId = null;
    state.temporaryCheckoutSiblings = null;
    if (elements.received) elements.received.value = '';
  }

  function checkoutHeightBounds() {
    const minimum = 170;
    const maximum = Math.max(minimum, Math.floor((root.innerHeight || 700) * 0.9));
    return { minimum, maximum };
  }

  function setCheckoutHeight(height) {
    const bounds = checkoutHeightBounds();
    const nextHeight = Math.min(bounds.maximum, Math.max(bounds.minimum, Math.round(height)));
    state.checkoutHeight = nextHeight;
    elements.checkoutPanel.style.setProperty('--checkout-height', `${nextHeight}px`);
    elements.pageShell.style.setProperty('--checkout-space', `${nextHeight}px`);
    elements.checkoutResizeHandle.setAttribute('aria-valuemin', String(bounds.minimum));
    elements.checkoutResizeHandle.setAttribute('aria-valuemax', String(bounds.maximum));
    elements.checkoutResizeHandle.setAttribute('aria-valuenow', String(nextHeight));
    elements.checkoutResizeHandle.setAttribute('aria-valuetext', `${nextHeight}px`);
  }

  function handleCheckoutResizeStart(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    const startHeight = elements.checkoutPanel.getBoundingClientRect().height;
    const startY = event.clientY;
    const move = (moveEvent) => {
      moveEvent.preventDefault();
      setCheckoutHeight(startHeight + startY - moveEvent.clientY);
    };
    const end = () => {
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', end);
      root.removeEventListener('pointercancel', end);
    };
    root.addEventListener('pointermove', move, { passive: false });
    root.addEventListener('pointerup', end, { once: true });
    root.addEventListener('pointercancel', end, { once: true });
  }

  function handleCheckoutResizeKeydown(event) {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const bounds = checkoutHeightBounds();
    const current = state.checkoutHeight || Math.round(elements.checkoutPanel.getBoundingClientRect().height);
    if (event.key === 'Home') setCheckoutHeight(bounds.minimum);
    else if (event.key === 'End') setCheckoutHeight(bounds.maximum);
    else setCheckoutHeight(current + (event.key === 'ArrowUp' ? 24 : -24));
  }

  function iconMarkup(product) {
    if (product.icon && String(product.icon).startsWith('data:image/')) return `<img src="${escapeHtml(product.icon)}" alt="">`;
    if (product.iconPath) return `<img src="${escapeHtml(product.iconPath)}" alt="">`;
    if (product.icon) return `<span aria-hidden="true">${escapeHtml(product.icon)}</span>`;
    const icon = product.category === '園グッズ' ? '🧺' : product.category === '古園服' ? '👕' : product.category === '他' ? '🎟️' : '📦';
    return `<span aria-hidden="true">${icon}</span>`;
  }

  const NEW_CATEGORY_VALUE = '__new__';

  function getProductCategories() {
    return [...new Set(state.products.map((product) => product.category).filter(Boolean))];
  }

  function renderCategorySelect(select, categories, selected, includeNew) {
    const options = categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`);
    if (includeNew) options.push(`<option value="${NEW_CATEGORY_VALUE}">＋新しいカテゴリを追加</option>`);
    select.innerHTML = options.join('');
    const availableValues = includeNew ? [...categories, NEW_CATEGORY_VALUE] : categories;
    select.value = availableValues.includes(selected) ? selected : (categories[0] || (includeNew ? NEW_CATEGORY_VALUE : ''));
  }

  function renderProductAddCategories() {
    const selected = elements.productAddCategory.value;
    renderCategorySelect(elements.productAddCategory, getProductCategories(), selected, true);
    const isNewCategory = elements.productAddCategory.value === NEW_CATEGORY_VALUE;
    elements.productAddNewCategoryField.classList.toggle('is-hidden', !isNewCategory);
    elements.productAddNewCategory.required = isNewCategory;
    updateProductAddActionState();
  }

  function renderCategoryFilter(categories = getProductCategories()) {
    if (!elements.categoryFilterOptions || !elements.categoryFilterSummaryCount) return;
    state.hiddenCategories.forEach((category) => {
      if (!categories.includes(category)) state.hiddenCategories.delete(category);
    });
    const visibleCategories = categories.filter((category) => !state.hiddenCategories.has(category));
    elements.categoryFilterSummaryCount.textContent = categories.length && visibleCategories.length === categories.length
      ? '全て'
      : `${visibleCategories.length}/${categories.length}`;
    elements.categoryFilterOptions.innerHTML = categories.length
      ? categories.map((category) => {
        const selectedCount = state.products
          .filter((product) => product.category === category)
          .reduce((sum, product) => sum + (state.cart.get(product.id) || 0), 0);
        return `<label class="category-filter-option">
          <input type="checkbox" data-category-filter="${escapeHtml(category)}"${state.hiddenCategories.has(category) ? '' : ' checked'} aria-label="${escapeHtml(category)}を表示">
          <span>${escapeHtml(category)}</span>${selectedCount > 0 ? `<small class="category-filter-option-count">${selectedCount}</small>` : ''}
        </label>`;
      }).join('')
      : '<span class="muted-label">カテゴリがありません。</span>';
  }

  function updateProductAddActionState() {
    if (!elements.productAddSubmit) return;
    const categoryValue = elements.productAddCategory.value.trim();
    const category = categoryValue === NEW_CATEGORY_VALUE
      ? elements.productAddNewCategory.value.trim()
      : categoryValue;
    const rawPrice = elements.productAddPrice.value.trim();
    const stockLimit = readOptionalStockLimit(elements.productAddStockLimit);
    const valid = Boolean(category && elements.productAddName.value.trim() && rawPrice !== '' && Number.isFinite(Number(rawPrice)) && stockLimit.valid);
    elements.productAddSubmit.disabled = !valid;
  }

  function getManagedProductDraft(row, fallbackProductId) {
    if (!row) return null;
    const saveButton = row.querySelector('[data-management-action="save"]');
    const productId = fallbackProductId || (saveButton && saveButton.dataset.productId);
    const product = state.products.find((candidate) => candidate.id === productId);
    const nameInput = row.querySelector('[data-management-field="name"]');
    const categoryInput = row.querySelector('[data-management-field="category"]');
    const newCategoryInput = row.querySelector('[data-management-field="new-category"]');
    const priceInput = row.querySelector('[data-management-field="price"]');
    const stockLimitInput = row.querySelector('[data-management-field="stock-limit"]');
    if (!product || !nameInput || !categoryInput || !priceInput || !stockLimitInput) return null;

    const name = nameInput.value.trim();
    const selectedCategory = categoryInput.value.trim();
    const category = selectedCategory === NEW_CATEGORY_VALUE
      ? (newCategoryInput ? newCategoryInput.value.trim() : '')
      : selectedCategory;
    const rawPrice = priceInput.value.trim();
    const unitPrice = Number(rawPrice);
    const stockLimit = readOptionalStockLimit(stockLimitInput);
    const currentStockLimit = Number.isInteger(product.stockLimit) && product.stockLimit >= 0 ? product.stockLimit : null;
    const valid = Boolean(name && category && rawPrice !== '' && Number.isFinite(unitPrice) && stockLimit.valid);
    const hasUncommittedChanges = name !== product.name
      || category !== product.category
      || rawPrice !== String(product.unitPrice)
      || !stockLimit.valid
      || stockLimit.value !== currentStockLimit;
    const canSave = valid && (
      name !== product.name
      || category !== product.category
      || unitPrice !== Number(product.unitPrice)
      || stockLimit.value !== currentStockLimit
    );

    return { saveButton, product, name, category, rawPrice, unitPrice, stockLimit, hasUncommittedChanges, canSave };
  }

  function updateManagedProductSaveState(row) {
    const draft = getManagedProductDraft(row);
    if (draft && draft.saveButton) draft.saveButton.disabled = !draft.canSave;
    const remainingInput = row && row.querySelector('[data-management-field="stock-remaining"]');
    const adjustButton = row && row.querySelector('[data-management-action="adjust-stock"]');
    if (remainingInput && adjustButton) {
      const raw = remainingInput.value.trim();
      const value = Number(raw);
      const valid = raw !== '' && Number.isInteger(value) && value >= 0;
      adjustButton.disabled = !valid || raw === remainingInput.dataset.savedValue;
    }
  }

  function updateSettingsSaveState() {
    if (!elements.settingsSave) return;
    const category = elements.settingsCategory.value.trim();
    const rawSiblings = elements.settingsSiblings.value.trim();
    const rawPerSibling = elements.settingsPerSibling.value.trim();
    const siblings = Number(rawSiblings);
    const perSibling = Number(rawPerSibling);
    const valid = Boolean(category && rawSiblings !== '' && rawPerSibling !== '' && Number.isInteger(siblings) && siblings >= 1 && Number.isInteger(perSibling) && perSibling >= 0);
    const changed = valid && (
      Boolean(elements.settingsEnabled.checked) !== Boolean(state.settings.enabled)
      || category !== state.settings.category
      || siblings !== Number(state.settings.siblings)
      || perSibling !== Number(state.settings.perSibling)
    );
    elements.settingsSave.disabled = !changed;
  }

  function updateBackupSettingsSaveState() {
    if (!elements.backupSettingsSave) return;
    const rawInterval = elements.backupInterval.value.trim();
    const interval = Number(rawInterval);
    const valid = Boolean(rawInterval && Number.isInteger(interval) && interval >= 1);
    const changed = valid && (
      Boolean(elements.backupEnabled.checked) !== Boolean(state.settings.autoBackupEnabled)
      || interval !== Number(state.settings.autoBackupIntervalMinutes || 5)
    );
    elements.backupSettingsSave.disabled = !changed;
  }

  function hasSettingsFormChanges() {
    if (!elements.settingsEnabled || !elements.settingsCategory || !elements.settingsSiblings || !elements.settingsPerSibling) return false;
    return Boolean(elements.settingsEnabled.checked) !== Boolean(state.settings.enabled)
      || elements.settingsCategory.value.trim() !== state.settings.category
      || elements.settingsSiblings.value.trim() !== String(state.settings.siblings)
      || elements.settingsPerSibling.value.trim() !== String(state.settings.perSibling);
  }

  function hasBackupSettingsFormChanges() {
    if (!elements.backupEnabled || !elements.backupInterval) return false;
    return Boolean(elements.backupEnabled.checked) !== Boolean(state.settings.autoBackupEnabled)
      || elements.backupInterval.value.trim() !== String(state.settings.autoBackupIntervalMinutes || 5);
  }

  function hasProductAddFormChanges() {
    if (!elements.productAddName || !elements.productAddPrice || !elements.productAddNewCategory || !elements.productAddStockLimit) return false;
    return Boolean(elements.productAddName.value.trim() || elements.productAddPrice.value.trim() || elements.productAddNewCategory.value.trim() || elements.productAddStockLimit.value.trim());
  }

  function hasManagedProductChanges() {
    if (!elements.productManagementList) return false;
    return [...elements.productManagementList.querySelectorAll('.managed-product-row')]
      .some((row) => getManagedProductDraft(row)?.hasUncommittedChanges
        || row.querySelector('[data-management-field="stock-remaining"]')?.value.trim() !== row.querySelector('[data-management-field="stock-remaining"]')?.dataset.savedValue);
  }

  function hasUnconfirmedChanges() {
    return state.cart.size > 0
      || state.received !== ''
      || Boolean(state.editingTransactionId)
      || hasSettingsFormChanges()
      || hasBackupSettingsFormChanges()
      || hasProductAddFormChanges()
      || hasManagedProductChanges();
  }

  function handleBeforeUnload(event) {
    if (!hasUnconfirmedChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  }

  function equalizeProductCardHeights() {
    const cards = [...elements.productList.querySelectorAll('.product-card[data-product-category]')];
    if (!cards.length) return;
    const categoryHeights = new Map();
    cards.forEach((card) => {
      card.style.minHeight = '';
      const category = card.dataset.productCategory;
      categoryHeights.set(category, Math.max(categoryHeights.get(category) || 0, card.offsetHeight));
    });
    cards.forEach((card) => {
      card.style.minHeight = `${categoryHeights.get(card.dataset.productCategory)}px`;
    });
  }

  function renderCatalog() {
    const categories = [];
    const grouped = new Map();
    const purchaseLimit = Core.calculatePurchaseLimit(getCartLines(), getCheckoutLimitSettings());
    elements.productColumnWidth.value = normalizeProductColumnWidth(state.settings.productColumnWidth);
    state.products.forEach((product) => {
      if (!grouped.has(product.category)) {
        grouped.set(product.category, []);
        categories.push(product.category);
      }
      grouped.get(product.category).push(product);
    });
    renderCategoryFilter(categories);
    const visibleCategories = categories.filter((category) => !state.hiddenCategories.has(category));
    const visibleProductCount = visibleCategories.reduce((sum, category) => sum + grouped.get(category).length, 0);
    elements.productCount.textContent = visibleProductCount === state.products.length
      ? `${state.products.length}品`
      : `${visibleProductCount}/${state.products.length}品表示`;
    if (!state.products.length) {
      elements.productList.innerHTML = '<div class="empty-state">商品がありません。CSVから商品一覧を取り込んでください。</div>';
      return;
    }
    if (!visibleCategories.length) {
      elements.productList.innerHTML = '<div class="empty-state">表示中のカテゴリがありません。カテゴリ表示フィルタから表示するカテゴリを選択してください。</div>';
      return;
    }
    elements.productList.innerHTML = visibleCategories.map((category, categoryIndex) => {
      const categoryProducts = grouped.get(category);
      const selectedCount = categoryProducts.reduce((sum, product) => sum + (state.cart.get(product.id) || 0), 0);
      const cards = categoryProducts.map((product) => {
        const quantity = state.cart.get(product.id) || 0;
        const stock = getProductStockInfo(product);
        const stockRemainingAfterCart = stock.limited ? Math.max(0, stock.remaining - quantity) : null;
        const stockCanStillAdd = stock.limited ? Math.max(0, stock.maxQuantity - quantity) : null;
        const limitExceeded = quantity > 0 && purchaseLimit.exceeded && product.category === purchaseLimit.category;
        const stockReached = stock.limited && stockCanStillAdd === 0;
        const stockUnavailable = stockReached && quantity === 0;
        const stockLow = stock.limited && stockRemainingAfterCart > 0 && stockRemainingAfterCart <= 3;
        const cardState = `${quantity > 0 ? ' has-quantity' : ''}${limitExceeded ? ' is-limit-exceeded' : ''}${stockReached ? ' is-stock-reached' : ''}${stockUnavailable ? ' is-stock-exhausted' : ''}${stockLow ? ' is-stock-low' : ''}`;
        const accessibleName = productNameText(product.name);
        const accessibleLabel = stockUnavailable ? `${accessibleName}は在庫切れです` : (limitExceeded ? `${accessibleName}は購入制限を超えています` : `${accessibleName}を1個追加`);
        return `<article class="product-card${cardState}" data-action="add" data-product-id="${escapeHtml(product.id)}" data-product-category="${escapeHtml(product.category)}" tabindex="0" role="button" aria-disabled="${String(stockUnavailable)}" aria-label="${escapeHtml(accessibleLabel)}">
          <span class="product-background-icon" aria-hidden="true">${iconMarkup(product)}</span>
          <div class="product-title-row">
            <button class="product-add" type="button" data-action="add" data-product-id="${escapeHtml(product.id)}">
              ${productNameMarkup(product.name)}<small class="product-card-meta"><span>${formatYen(product.unitPrice)}</span>${stock.limited ? `<span class="product-stock-remaining${stockRemainingAfterCart === 0 ? ' is-empty' : stockLow ? ' is-low' : ''}"${stockLow ? ' title="残り3個以下" aria-label="残りわずか"' : ''}>残り ${stockRemainingAfterCart}</span>` : ''}</small>
            </button>
          </div>
          <div class="stepper" aria-label="${escapeHtml(accessibleName)}の数量">
    ${quantity > 0 ? `<button type="button" data-action="decrement" data-product-id="${escapeHtml(product.id)}" aria-label="${escapeHtml(accessibleName)}を1減らす">−</button>` : ""}
            <span class="quantity-badge">
              <input type="number" min="0" step="1" value="${quantity}" data-action="quantity" data-product-id="${escapeHtml(product.id)}" aria-label="${escapeHtml(accessibleName)}の数量">
              <span aria-hidden="true">個</span>
            </span>
          </div>
        </article>`;
      }).join('');
      const collapsed = state.collapsedCategories.has(category);
      const categoryId = `product-category-${categoryIndex}`;
      return `<div class="product-category-group${collapsed ? ' is-collapsed' : ''}" data-product-category-group="${escapeHtml(category)}">
        <button class="category-heading" type="button" data-category-toggle="${escapeHtml(category)}" aria-expanded="${String(!collapsed)}" aria-controls="${categoryId}">
          <span>${escapeHtml(category)}</span><span class="category-toggle-icon" aria-hidden="true"></span><span class="category-heading-rule" aria-hidden="true"></span>${selectedCount > 0 ? `<span class="category-selection-count" aria-label="選択中 ${selectedCount}点">${selectedCount}</span>` : ''}
        </button>
        <div id="${categoryId}" class="category-product-grid">${cards}</div>
      </div>`;
    }).join('');
    equalizeProductCardHeights();
  }

  function renderProductManagement() {
    renderProductAddCategories();
    const categories = getProductCategories();
    elements.productManagementList.innerHTML = state.products.map((product) => `
      <div class="managed-product-row">
        <span class="managed-product-preview" aria-hidden="true">${iconMarkup(product)}</span>
        <div class="managed-product-info">
          <div class="managed-product-fields">
          <label class="managed-product-name">商品名<input type="text" value="${escapeHtml(product.name)}" data-management-field="name" data-product-id="${escapeHtml(product.id)}" aria-label="${escapeHtml(productNameText(product.name))}の商品名"></label>
            <label class="managed-product-category">カテゴリ<select data-management-field="category" data-product-id="${escapeHtml(product.id)}" aria-label="${escapeHtml(productNameText(product.name))}のカテゴリ">${categories.map((category) => `<option value="${escapeHtml(category)}"${category === product.category ? ' selected' : ''}>${escapeHtml(category)}</option>`).join('')}<option value="${NEW_CATEGORY_VALUE}">＋新しいカテゴリを追加</option></select></label>
            <label class="managed-product-price">単価<input type="number" step="1" value="${escapeHtml(product.unitPrice)}" data-management-field="price" data-product-id="${escapeHtml(product.id)}" aria-label="${escapeHtml(productNameText(product.name))}の単価"></label>
            <label class="managed-product-stock">在庫上限<input type="number" min="0" step="1" value="${Number.isInteger(product.stockLimit) && product.stockLimit >= 0 ? escapeHtml(product.stockLimit) : ''}" placeholder="無制限" data-management-field="stock-limit" data-product-id="${escapeHtml(product.id)}" aria-label="${escapeHtml(productNameText(product.name))}の在庫上限"><small class="managed-stock-summary">販売済 ${getProductSales(product)} / ${Number.isInteger(product.stockLimit) && product.stockLimit >= 0 ? `上限 ${product.stockLimit}・残り ${getProductStockInfo(product).remaining}` : '上限なし'}</small></label>
            <label class="managed-product-new-category is-hidden">新しいカテゴリ<input type="text" data-management-field="new-category" data-product-id="${escapeHtml(product.id)}" placeholder="カテゴリ名" aria-label="${escapeHtml(productNameText(product.name))}の新しいカテゴリ"></label>
          </div>
          <div class="managed-stock-adjustment">
            <label>実在庫の残数<input type="number" min="0" step="1" value="${getProductStockInfo(product).limited ? getProductStockInfo(product).remaining : ''}" data-saved-value="${getProductStockInfo(product).limited ? getProductStockInfo(product).remaining : ''}" data-management-field="stock-remaining" data-product-id="${escapeHtml(product.id)}" aria-label="${escapeHtml(productNameText(product.name))}の現在庫残数"></label>
            <button class="managed-product-action" type="button" data-management-action="adjust-stock" data-product-id="${escapeHtml(product.id)}" disabled>残数を反映</button>
          </div>
        </div>
        <div class="managed-product-actions">
            <button class="managed-product-action managed-product-save" type="button" data-management-action="save" data-product-id="${escapeHtml(product.id)}" aria-label="${escapeHtml(productNameText(product.name))}の商品情報を反映" disabled>商品情報を反映</button>
          <button class="managed-product-action" type="button" data-management-action="icon" data-product-id="${escapeHtml(product.id)}">画像を変更</button>
          <button class="managed-product-action managed-product-delete" type="button" data-management-action="delete" data-product-id="${escapeHtml(product.id)}">削除</button>
        </div>
      </div>`).join('') || '<div class="empty-state">商品がありません。</div>';
    if (elements.stockAdjustmentHistory) {
      const adjustments = (state.inventory && state.inventory.adjustments || []).slice(0, 10);
      elements.stockAdjustmentHistory.innerHTML = adjustments.length
        ? adjustments.map((entry) => `<div class="stock-adjustment-entry"><span>${escapeHtml(entry.productName || '商品')}</span><small>${escapeHtml(formatDate(entry.recordedAt))}</small><strong>${entry.before == null ? '—' : entry.before} → ${entry.after}</strong></div>`).join('')
        : '<p class="muted-label">在庫調整の記録はまだありません。</p>';
    }
  }

  function renderCart() {
    const lines = getCartLines();
    if (!lines.length) state.temporaryCheckoutSiblings = null;
    const cart = Core.calculateCart(lines);
    const limit = Core.calculatePurchaseLimit(lines, getCheckoutLimitSettings());
    const temporarySiblings = state.temporaryCheckoutSiblings;
    elements.cartTotal.textContent = formatYen(cart.total);
    elements.checkoutPanel.classList.toggle('is-limit-exceeded', limit.exceeded);
    elements.checkoutLimitBadge.classList.toggle('is-hidden', !limit.exceeded);
    elements.purchaseLimit.textContent = state.settings.enabled && limit.category
      ? `${limit.exceeded ? '⚠ ' : ''}${limit.category}: ${limit.count} / ${limit.limit}点${limit.exceeded ? '（制限超過）' : ''}${temporarySiblings != null ? `（この会計のみ${temporarySiblings}人）` : ''}`
      : '購入制限なし';
    elements.purchaseLimit.className = `limit-status${limit.exceeded ? ' is-error' : ''}`;
    const showLimitAdjustment = Boolean(state.settings.enabled && limit.category && (limit.exceeded || temporarySiblings != null));
    elements.checkoutLimitAdjustment.classList.toggle('is-hidden', !showLimitAdjustment);
    elements.checkoutSiblings.value = String(temporarySiblings == null ? state.settings.siblings : temporarySiblings);
    elements.checkoutLimitAdjustmentNote.textContent = temporarySiblings == null
      ? '保存済みの制限設定は変更されません。'
      : `この会計のみ${temporarySiblings}人として計算中。保存済みの設定は変更されません。`;
    elements.checkoutLimitReset.classList.toggle('is-hidden', temporarySiblings == null);
    elements.clearCart.textContent = state.editingTransactionId ? '変更を取消' : 'すべて取消';
    elements.confirmButton.textContent = state.editingTransactionId ? '変更を保存' : '会計を確定する';
    elements.editingBadge.classList.toggle('is-hidden', !state.editingTransactionId);
    if (!cart.lineItems.length) {
      elements.cartList.innerHTML = '<div class="empty-state">商品を選ぶと、ここに明細が表示されます。</div>';
    } else {
      elements.cartList.innerHTML = cart.lineItems.map((item) => {
        const product = state.products.find((candidate) => candidate.category === item.category && candidate.name === item.name);
        const id = product ? product.id : `${item.category}::${item.name}`;
        const lineLimitExceeded = limit.exceeded && item.category === limit.category;
        return `<div class="cart-line${lineLimitExceeded ? ' is-limit-exceeded' : ''}">
          <div><div class="cart-line-name">${productNameMarkup(item.name)}${lineLimitExceeded ? '<span class="cart-limit-badge">制限超過</span>' : ''}</div><div class="cart-line-meta">${formatYen(item.unitPrice)} × ${item.quantity}</div></div>
          <div><div class="cart-line-total">${formatYen(item.subtotal)}</div><div class="stepper"><button type="button" data-action="decrement" data-product-id="${escapeHtml(id)}">−</button><input type="number" min="0" step="1" value="${item.quantity}" data-action="quantity" data-product-id="${escapeHtml(id)}"><button type="button" data-action="increment" data-product-id="${escapeHtml(id)}">＋</button></div></div>
        </div>`;
      }).join('');
    }
    const received = Number(state.received);
    const canCalculateChange = Number.isFinite(received) && state.received !== '';
    elements.change.textContent = canCalculateChange ? formatYen(received - cart.total) : '¥0';
    if (cart.total < 0) elements.paymentMessage.textContent = '合計がマイナスになる組み合わせは確定できません。';
    else if (limit.exceeded) elements.paymentMessage.textContent = `${limit.category}は${limit.limit}点までです。下の人数をこの会計だけ変更できます。`;
    else if (temporarySiblings != null) elements.paymentMessage.textContent = `${limit.category}をこの会計だけ${temporarySiblings}人分として計算しています。`;
    else if (canCalculateChange && received < cart.total) elements.paymentMessage.textContent = `あと${formatYen(cart.total - received)}必要です。`;
    else elements.paymentMessage.textContent = '';
    elements.confirmButton.disabled = !cart.lineItems.length || cart.total < 0 || limit.exceeded || !canCalculateChange || received < cart.total;
  }

  function renderDashboard() {
    const startHour = Math.min(Number(state.hourlyStartHour), Number(state.hourlyEndHour));
    const endHour = Math.max(Number(state.hourlyStartHour), Number(state.hourlyEndHour));
    const timeRange = { startHour, endHour };
    const now = new Date();
    const summary = Core.summarizeTransactions(state.transactions, state.period, now, timeRange);
    const weekdaySummary = Core.summarizeWeekdayHours(state.transactions, state.period, now, timeRange);
    elements.salesTotal.textContent = formatYen(summary.totalSales);
    elements.transactionCount.textContent = String(summary.transactionCount);
    elements.itemCount.textContent = String(summary.itemCount);
    elements.averageTransaction.textContent = formatYen(summary.averageTransaction);
    renderDailyClose();
    elements.analysisTimeFilterNote.textContent = startHour === 0 && endHour === 23 ? '全時間帯' : `${String(startHour).padStart(2, '0')}時台〜${String(endHour).padStart(2, '0')}時台`;
    renderCategoryChart(summary.categories);
    renderCategoryQuantityChart(summary.categories);
    renderDailySalesChart(elements.dailySalesChart, summary.daily);
    renderInventoryChart();
    renderWeekdayHeatmap(weekdaySummary);
    renderHourlyAnalysis(summary.hourly, summary.hourlyCategories, summary.hourlyProducts);
    renderChart(summary.products);
  }

  function renderInventoryChart() {
    const products = Core.summarizeInventoryAvailability(state.products, state.inventory)
      .sort((a, b) => a.remainingRatio - b.remainingRatio || a.remaining - b.remaining || a.product.name.localeCompare(b.product.name, 'ja'));
    if (!products.length) {
      elements.inventoryChartSummary.textContent = '在庫上限が設定されている商品はありません。';
      elements.inventoryChart.innerHTML = '<div class="empty-state">商品管理で在庫上限を設定すると、ここに残数が表示されます。</div>';
      return;
    }
    const remainingTotal = products.reduce((sum, item) => sum + item.remaining, 0);
    const lowStockCount = products.filter((item) => item.remaining <= 3).length;
    elements.inventoryChartSummary.textContent = `${products.length}商品 · 残り合計 ${remainingTotal}個 · 残り3個以下 ${lowStockCount}商品`;
    elements.inventoryChart.innerHTML = products.map(({ product, total, remaining, remainingRatio, soldPercent }) => {
      const lowStock = remaining <= 3;
      const name = productNameText(product.name);
      const label = `${product.category} ${name}: 残り${remaining}/${total}個、消化率${soldPercent}%`;
      return `<div class="inventory-chart-row${lowStock ? ' is-low' : ''}" role="listitem">
        <span class="inventory-chart-label" title="${escapeHtml(label)}"><strong>${productNameMarkup(product.name)}</strong><small>${escapeHtml(product.category)}</small></span>
        <span class="inventory-chart-track" role="progressbar" aria-valuemin="0" aria-valuemax="${Math.max(1, total)}" aria-valuenow="${Math.min(remaining, total)}" aria-label="${escapeHtml(label)}"><span class="inventory-chart-bar" style="--bar-width:${Math.round(remainingRatio * 100)}%"></span></span>
        <strong class="inventory-chart-value">${remaining}<small>/${total}個 · 消化${soldPercent}%</small></strong>
      </div>`;
    }).join('');
  }

  function renderWeekdayHeatmap(summary) {
    const startHour = Math.min(Number(state.hourlyStartHour), Number(state.hourlyEndHour));
    const endHour = Math.max(Number(state.hourlyStartHour), Number(state.hourlyEndHour));
    const hours = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index);
    const days = summary.weekdays || [];
    const columnCount = hours.length + 1;
    elements.weekdayHeatmapHead.innerHTML = `<tr><th scope="col">曜日</th>${hours.map((hour) => `<th scope="col">${String(hour).padStart(2, '0')}</th>`).join('')}</tr>`;
    if (!summary.maxTransactions) {
      elements.weekdayHeatmapBody.innerHTML = `<tr><td colspan="${columnCount}" class="hourly-empty">この期間・時間帯に会計データがありません。</td></tr>`;
      return;
    }
    elements.weekdayHeatmapBody.innerHTML = days.map((day) => `<tr>
      <th scope="row">${day.label}</th>
      ${hours.map((hour) => {
        const count = Number(day.hours[hour].transactionCount) || 0;
        const intensity = count ? Math.max(.12, Math.min(.86, count / summary.maxTransactions)) : 0;
        const label = `${day.label}曜日 ${String(hour).padStart(2, '0')}時台: ${count}件`;
        return `<td class="weekday-heatmap-cell${count ? ' has-value' : ''}"${count ? ` style="--heatmap-intensity:${intensity.toFixed(2)}"` : ''} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${count || '<span aria-hidden="true">·</span>'}</td>`;
      }).join('')}
    </tr>`).join('');
  }

  function renderCategoryChart(categories) {
    if (!categories.length) {
      elements.categorySummary.innerHTML = '<div class="empty-state">集計データがありません。</div>';
      return;
    }
    const sorted = [...categories].sort((a, b) => Number(b.sales) - Number(a.sales) || a.category.localeCompare(b.category, 'ja'));
    const maxSales = Math.max(1, ...sorted.map((category) => Math.max(0, Number(category.sales) || 0)));
    elements.categorySummary.innerHTML = sorted.map((category) => {
      const sales = Number(category.sales) || 0;
      const width = Math.round(Math.max(0, sales) / maxSales * 100);
      return `<div class="category-chart-row">
        <span class="category-chart-label">${escapeHtml(category.category)}</span>
        <span class="category-chart-track"><span class="category-chart-bar" style="--bar-width:${width}%"></span></span>
        <strong class="category-chart-value">${formatYen(sales)}</strong>
      </div>`;
    }).join('');
  }

  function renderCategoryQuantityChart(categories) {
    if (!categories.length) {
      elements.categoryQuantitySummary.innerHTML = '<div class="empty-state">集計データがありません。</div>';
      return;
    }
    const sorted = [...categories].sort((a, b) => Number(b.quantity) - Number(a.quantity) || Number(b.sales) - Number(a.sales) || a.category.localeCompare(b.category, 'ja'));
    const maxQuantity = Math.max(1, ...sorted.map((category) => Math.max(0, Number(category.quantity) || 0)));
    elements.categoryQuantitySummary.innerHTML = sorted.map((category) => {
      const quantity = Number(category.quantity) || 0;
      const width = Math.round(Math.max(0, quantity) / maxQuantity * 100);
      return `<div class="category-chart-row">
        <span class="category-chart-label">${escapeHtml(category.category)}</span>
        <span class="category-chart-track"><span class="category-chart-bar category-quantity-bar" style="--bar-width:${width}%"></span></span>
        <strong class="category-chart-value">${quantity}個</strong>
      </div>`;
    }).join('');
  }

  function renderDailySalesChart(element, days) {
    if (!days.length) {
      element.innerHTML = '<text x="380" y="150" text-anchor="middle">確定した会計がここに表示されます</text>';
      return;
    }
    const visibleDays = days.slice(-14);
    const chartBottom = 244;
    const chartTop = 24;
    const chartHeight = chartBottom - chartTop;
    const slotWidth = 760 / visibleDays.length;
    const barWidth = Math.min(40, slotWidth * .62);
    const maxSales = Math.max(1, ...visibleDays.map((day) => Math.max(0, Number(day.sales) || 0)));
    const bars = visibleDays.map((day, index) => {
      const sales = Math.max(0, Number(day.sales) || 0);
      const height = Math.round(sales / maxSales * chartHeight);
      const x = index * slotWidth + (slotWidth - barWidth) / 2;
      const y = chartBottom - height;
      const [, month, date] = day.date.split('-');
      const label = `${Number(month)}/${Number(date)}`;
      return `<rect class="daily-bar" x="${x.toFixed(1)}" y="${y}" width="${barWidth.toFixed(1)}" height="${height}" rx="5"><title>${escapeHtml(label)}: ${escapeHtml(formatYen(sales))}</title></rect><text class="chart-value" x="${(x + barWidth / 2).toFixed(1)}" y="${Math.max(16, y - 8)}" text-anchor="middle">${escapeHtml(formatYen(sales))}</text><text x="${(x + barWidth / 2).toFixed(1)}" y="268" text-anchor="middle">${escapeHtml(label)}</text>`;
    }).join('');
    element.setAttribute('viewBox', '0 0 760 300');
    element.innerHTML = `<line class="grid-line" x1="18" y1="${chartBottom}" x2="742" y2="${chartBottom}"/><line class="grid-line" x1="18" y1="${chartTop}" x2="742" y2="${chartTop}"/>${bars}`;
  }

  function getHourlyMetric(metric) {
    if (metric === 'sales') return { key: 'sales', label: '売上', unit: '円', format: formatYen };
    if (metric === 'items') return { key: 'itemCount', label: '販売個数', unit: '個', format: (value) => `${value}個` };
    return { key: 'transactionCount', label: '会計数', unit: '件', format: (value) => `${value}件` };
  }

  function getHourlyRows(hours) {
    const startHour = Number.isFinite(Number(state.hourlyStartHour)) ? Number(state.hourlyStartHour) : 0;
    const endHour = Number.isFinite(Number(state.hourlyEndHour)) ? Number(state.hourlyEndHour) : 23;
    const start = Math.min(startHour, endHour);
    const end = Math.max(startHour, endHour);
    return hours.filter((hour) => hour.hour >= start && hour.hour <= end && (!state.hourlyHideEmpty || Number(hour.transactionCount) > 0));
  }

  function renderHourlyAnalysis(hours, hourlyCategories, hourlyProducts) {
    const rows = getHourlyRows(hours);
    renderHourlyChart(elements.hourlyChart, rows, state.hourlyMetric);
    renderHourlyTable(rows, state.hourlySort);
    renderHourlyCategoryTable(hourlyCategories, rows);
    renderHourlyProductTable(hourlyProducts, rows);
  }

  function renderHourlyChart(element, hours, metric) {
    const metricInfo = getHourlyMetric(metric);
    if (!hours.length || !hours.some((hour) => Number(hour[metricInfo.key]) > 0)) {
      element.innerHTML = '<text x="380" y="150" text-anchor="middle">確定した会計がここに表示されます</text>';
      return;
    }
    const chartBottom = 244;
    const chartTop = 24;
    const chartHeight = chartBottom - chartTop;
    const slotWidth = 760 / hours.length;
    const barWidth = Math.min(20, slotWidth * .62);
    const maxValue = Math.max(1, ...hours.map((hour) => Number(hour[metricInfo.key]) || 0));
    const bars = hours.map((hour, index) => {
      const value = Number(hour[metricInfo.key]) || 0;
      const height = Math.round(value / maxValue * chartHeight);
      const x = index * slotWidth + (slotWidth - barWidth) / 2;
      const y = chartBottom - height;
      const label = `${String(hour.hour).padStart(2, '0')}時`;
      const valueLabel = value ? `<text class="chart-value" x="${(x + barWidth / 2).toFixed(1)}" y="${Math.max(16, y - 8)}" text-anchor="middle">${escapeHtml(metricInfo.format(value))}</text>` : '';
      const showHourLabel = hours.length <= 8 || index === 0 || index === hours.length - 1 || hour.hour % 3 === 0;
      const hourLabel = showHourLabel ? `<text class="hour-label" x="${(x + barWidth / 2).toFixed(1)}" y="268" text-anchor="middle">${hour.hour}時</text>` : '';
      return `<rect class="hourly-bar" x="${x.toFixed(1)}" y="${y}" width="${barWidth.toFixed(1)}" height="${height}" rx="4"><title>${escapeHtml(label)}: ${escapeHtml(metricInfo.format(value))}</title></rect>${valueLabel}${hourLabel}`;
    }).join('');
    element.setAttribute('viewBox', '0 0 760 300');
    element.innerHTML = `<line class="grid-line" x1="18" y1="${chartBottom}" x2="742" y2="${chartBottom}"/><line class="grid-line" x1="18" y1="${chartTop}" x2="742" y2="${chartTop}"/>${bars}`;
  }

  function renderHourlyTable(hours, sort) {
    const sorted = [...hours].sort((a, b) => {
      if (sort === 'sales') return Number(b.sales) - Number(a.sales) || a.hour - b.hour;
      if (sort === 'items') return Number(b.itemCount) - Number(a.itemCount) || a.hour - b.hour;
      if (sort === 'transactions') return Number(b.transactionCount) - Number(a.transactionCount) || a.hour - b.hour;
      return a.hour - b.hour;
    });
    if (!sorted.length) {
      elements.hourlyTableBody.innerHTML = '<tr><td colspan="4" class="hourly-empty">該当する時間帯の会計がありません。</td></tr>';
      elements.hourlyTableFoot.innerHTML = '';
      return;
    }
    elements.hourlyTableBody.innerHTML = sorted.map((hour) => `<tr>
      <th scope="row">${String(hour.hour).padStart(2, '0')}時台</th>
      <td>${Number(hour.transactionCount) || 0}件</td>
      <td>${Number(hour.itemCount) || 0}個</td>
      <td class="money">${formatYen(hour.sales)}</td>
    </tr>`).join('');
    const totals = sorted.reduce((summary, hour) => ({
      transactionCount: summary.transactionCount + (Number(hour.transactionCount) || 0),
      itemCount: summary.itemCount + (Number(hour.itemCount) || 0),
      sales: summary.sales + (Number(hour.sales) || 0),
    }), { transactionCount: 0, itemCount: 0, sales: 0 });
    elements.hourlyTableFoot.innerHTML = `<tr><th scope="row">合計</th><th>${totals.transactionCount}件</th><th>${totals.itemCount}個</th><th class="money">${formatYen(totals.sales)}</th></tr>`;
  }

  function renderHourlyCategoryTable(hourlyCategories, visibleHours) {
    const visibleHourSet = new Set(visibleHours.map((hour) => hour.hour));
    const rows = (hourlyCategories || []).filter((hour) => visibleHourSet.has(hour.hour));
    const categoryTotals = new Map();
    rows.forEach((hour) => (hour.categories || []).forEach((category) => {
      const total = categoryTotals.get(category.category) || { category: category.category, sales: 0, quantity: 0 };
      total.sales += Number(category.sales) || 0;
      total.quantity += Number(category.quantity) || 0;
      categoryTotals.set(category.category, total);
    }));
    const categories = Array.from(categoryTotals.values()).sort((a, b) => b.sales - a.sales || a.category.localeCompare(b.category, 'ja'));
    if (!rows.length || !categories.length) {
      elements.hourlyCategoryTableHead.innerHTML = '<tr><th>時間帯×カテゴリ</th></tr>';
      elements.hourlyCategoryTableBody.innerHTML = '<tr><td class="hourly-empty">該当するカテゴリ集計がありません。</td></tr>';
      elements.hourlyCategoryTableFoot.innerHTML = '';
      return;
    }
    const maxSales = Math.max(1, ...rows.flatMap((hour) => (hour.categories || []).map((category) => Number(category.sales) || 0)));
    const categoryHeaders = categories.map((category) => `<th scope="col">${escapeHtml(category.category)}</th>`).join('');
    elements.hourlyCategoryTableHead.innerHTML = `<tr><th scope="col">時間帯</th>${categoryHeaders}<th scope="col">合計</th></tr>`;
    elements.hourlyCategoryTableBody.innerHTML = rows.map((hour) => {
      const rowCategories = new Map((hour.categories || []).map((category) => [category.category, category]));
      const rowTotal = categories.reduce((summary, category) => {
        const value = rowCategories.get(category.category);
        summary.sales += Number(value?.sales) || 0;
        summary.quantity += Number(value?.quantity) || 0;
        return summary;
      }, { sales: 0, quantity: 0 });
      const cells = categories.map((category) => {
        const value = rowCategories.get(category.category);
        const sales = Number(value?.sales) || 0;
        const quantity = Number(value?.quantity) || 0;
        const intensity = sales ? Math.max(.12, Math.min(.8, sales / maxSales)) : 0;
        return `<td class="hourly-category-cell${sales ? ' has-value' : ''}"${sales ? ` style="--cell-intensity:${intensity.toFixed(2)}"` : ''}>${sales ? `<span>${formatYen(sales)}</span><small>${quantity}個</small>` : '<span class="hourly-category-empty">—</span>'}</td>`;
      }).join('');
      return `<tr><th scope="row">${String(hour.hour).padStart(2, '0')}時台</th>${cells}<td class="hourly-category-total"><span>${formatYen(rowTotal.sales)}</span><small>${rowTotal.quantity}個</small></td></tr>`;
    }).join('');
    const footerCells = categories.map((category) => `<th><span>${formatYen(category.sales)}</span><small>${category.quantity}個</small></th>`).join('');
    const grandTotal = categories.reduce((summary, category) => ({ sales: summary.sales + category.sales, quantity: summary.quantity + category.quantity }), { sales: 0, quantity: 0 });
    elements.hourlyCategoryTableFoot.innerHTML = `<tr><th scope="row">合計</th>${footerCells}<th><span>${formatYen(grandTotal.sales)}</span><small>${grandTotal.quantity}個</small></th></tr>`;
  }

  function renderHourlyProductTable(hourlyProducts, visibleHours) {
    const visibleHourSet = new Set(visibleHours.map((hour) => hour.hour));
    const rows = (hourlyProducts || []).filter((hour) => visibleHourSet.has(hour.hour));
    const productTotals = new Map();
    const productKey = (product) => `${product.category}::${product.name}`;
    rows.forEach((hour) => (hour.products || []).forEach((product) => {
      const key = productKey(product);
      const total = productTotals.get(key) || { category: product.category, name: product.name, sales: 0, quantity: 0 };
      total.sales += Number(product.sales) || 0;
      total.quantity += Number(product.quantity) || 0;
      productTotals.set(key, total);
    }));
    const products = Array.from(productTotals.values()).sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name, 'ja'));
    if (!rows.length || !products.length) {
      elements.hourlyProductTableHead.innerHTML = '<tr><th>時間帯×商品</th></tr>';
      elements.hourlyProductTableBody.innerHTML = '<tr><td class="hourly-empty">該当する商品集計がありません。</td></tr>';
      elements.hourlyProductTableFoot.innerHTML = '';
      return;
    }
    const maxSales = Math.max(1, ...rows.flatMap((hour) => (hour.products || []).map((product) => Number(product.sales) || 0)));
    const productHeaders = products.map((product) => `<th scope="col" title="${escapeHtml(product.category)}">${productNameMarkup(product.name)}<small>${escapeHtml(product.category)}</small></th>`).join('');
    elements.hourlyProductTableHead.innerHTML = `<tr><th scope="col">時間帯</th>${productHeaders}<th scope="col">合計</th></tr>`;
    elements.hourlyProductTableBody.innerHTML = rows.map((hour) => {
      const rowProducts = new Map((hour.products || []).map((product) => [productKey(product), product]));
      const rowTotal = products.reduce((summary, product) => {
        const value = rowProducts.get(productKey(product));
        summary.sales += Number(value?.sales) || 0;
        summary.quantity += Number(value?.quantity) || 0;
        return summary;
      }, { sales: 0, quantity: 0 });
      const cells = products.map((product) => {
        const value = rowProducts.get(productKey(product));
        const sales = Number(value?.sales) || 0;
        const quantity = Number(value?.quantity) || 0;
        const intensity = sales ? Math.max(.12, Math.min(.8, sales / maxSales)) : 0;
        return `<td class="hourly-product-cell${sales ? ' has-value' : ''}"${sales ? ` style="--cell-intensity:${intensity.toFixed(2)}"` : ''}>${sales ? `<span>${formatYen(sales)}</span><small>${quantity}個</small>` : '<span class="hourly-category-empty">—</span>'}</td>`;
      }).join('');
      return `<tr><th scope="row">${String(hour.hour).padStart(2, '0')}時台</th>${cells}<td class="hourly-product-total"><span>${formatYen(rowTotal.sales)}</span><small>${rowTotal.quantity}個</small></td></tr>`;
    }).join('');
    const footerCells = products.map((product) => `<th><span>${formatYen(product.sales)}</span><small>${product.quantity}個</small></th>`).join('');
    const grandTotal = products.reduce((summary, product) => ({ sales: summary.sales + product.sales, quantity: summary.quantity + product.quantity }), { sales: 0, quantity: 0 });
    elements.hourlyProductTableFoot.innerHTML = `<tr><th scope="row">合計</th>${footerCells}<th><span>${formatYen(grandTotal.sales)}</span><small>${grandTotal.quantity}個</small></th></tr>`;
  }

  function renderHourlyHourOptions() {
    const options = Array.from({ length: 24 }, (_, hour) => `<option value="${hour}">${String(hour).padStart(2, '0')}時</option>`).join('');
    elements.hourlyStartHour.innerHTML = options;
    elements.hourlyEndHour.innerHTML = options;
    elements.hourlyStartHour.value = String(state.hourlyStartHour);
    elements.hourlyEndHour.value = String(state.hourlyEndHour);
  }

  function renderHorizontalChart(element, products, metric, valueLabel) {
    const top = [...products].sort((a, b) => (Number(b[metric]) || 0) - (Number(a[metric]) || 0) || b.sales - a.sales || a.name.localeCompare(b.name, 'ja')).slice(0, 8);
    const chartWidth = 600;
    if (!top.length) {
      element.setAttribute('viewBox', `0 0 ${chartWidth} 360`);
      element.innerHTML = `<text x="${chartWidth / 2}" y="180" text-anchor="middle">確定した会計がここに表示されます</text>`;
      return;
    }
    const max = Math.max(1, ...top.map((product) => Math.max(0, Number(product[metric]) || 0)));
    const labelX = 180;
    const barX = 196;
    const barMaxWidth = 340;
    const rowHeight = 40;
    const firstY = 34;
    const bars = top.map((product, index) => {
      const value = Math.max(0, Number(product[metric]) || 0);
      const barWidth = Math.round(value / max * barMaxWidth);
      const y = firstY + index * rowHeight;
      const label = product.name.length > 14 ? `${product.name.slice(0, 14)}…` : product.name;
      const valueText = valueLabel === 'quantity'
        ? `${product.quantity}個`
        : valueLabel === 'share'
          ? `${value.toFixed(value >= 10 ? 0 : 1)}%`
          : formatYen(product.sales);
      const barClass = valueLabel === 'quantity' ? 'quantity-bar' : valueLabel === 'share' ? 'share-bar' : '';
      return `<text class="chart-label" x="${labelX}" y="${y + 5}" text-anchor="end">${escapeHtml(label)}</text><rect class="bar ${barClass}" x="${barX}" y="${y - 14}" width="${barWidth}" height="26" rx="5"/><text class="chart-value" x="${Math.min(chartWidth - 8, barX + barWidth + 8)}" y="${y + 5}">${escapeHtml(valueText)}</text>`;
    }).join('');
    const height = firstY + top.length * rowHeight + 8;
    element.setAttribute('viewBox', `0 0 ${chartWidth} ${height}`);
    element.innerHTML = `<line class="grid-line" x1="${barX}" y1="16" x2="${barX}" y2="${height - 12}"/>${bars}`;
  }

  function renderChart(products) {
    renderHorizontalChart(elements.salesChart, products, 'sales', 'sales');
    renderHorizontalChart(elements.quantityChart, products, 'quantity', 'quantity');
    renderShareChart(elements.shareChart, products);
  }

  function renderShareChart(element, products) {
    const positiveProducts = products
      .filter((product) => Number(product.sales) > 0)
      .sort((a, b) => Number(b.sales) - Number(a.sales) || a.name.localeCompare(b.name, 'ja'));
    const totalSales = positiveProducts.reduce((total, product) => total + Number(product.sales), 0);
    if (!totalSales) {
      element.innerHTML = '<text x="380" y="180" text-anchor="middle">確定した会計がここに表示されます</text>';
      return;
    }
    const visibleProducts = positiveProducts.slice(0, 7);
    const otherSales = positiveProducts.slice(7).reduce((total, product) => total + Number(product.sales), 0);
    if (otherSales > 0) visibleProducts.push({ name: 'その他', sales: otherSales });
    const colors = ['#2f8f89', '#d48632', '#c39a39', '#6d8fbe', '#a26795', '#709e60', '#cc6b50', '#687279'];
    const centerX = 180;
    const centerY = 180;
    const radius = 132;
    const innerRadius = 76;
    let angle = -90;
    const slices = visibleProducts.map((product, index) => {
      const share = Number(product.sales) / totalSales;
      const nextAngle = angle + share * 360;
      const start = polarPoint(centerX, centerY, radius, angle);
      const end = polarPoint(centerX, centerY, radius, nextAngle);
      const innerEnd = polarPoint(centerX, centerY, innerRadius, nextAngle);
      const innerStart = polarPoint(centerX, centerY, innerRadius, angle);
      const largeArc = nextAngle - angle > 180 ? 1 : 0;
      const path = `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} L ${innerEnd.x} ${innerEnd.y} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y} Z`;
      const result = { ...product, share: share * 100, path, color: colors[index % colors.length] };
      angle = nextAngle;
      return result;
    });
    const legend = slices.map((slice, index) => {
      const y = 34 + index * 38;
      const label = slice.name.length > 14 ? `${slice.name.slice(0, 14)}…` : slice.name;
      const shareText = `${slice.share.toFixed(slice.share >= 10 ? 0 : 1)}%`;
      return `<rect class="share-legend-swatch" x="360" y="${y - 11}" width="14" height="14" rx="3" fill="${slice.color}"/><text class="share-legend-label" x="384" y="${y}">${escapeHtml(label)}</text><text class="share-legend-value" x="710" y="${y}" text-anchor="end">${shareText}</text>`;
    }).join('');
    const sliceMarkup = slices.length === 1
      ? `<circle class="share-slice" cx="${centerX}" cy="${centerY}" r="${radius}" fill="${slices[0].color}"/>`
      : slices.map((slice) => `<path class="share-slice" d="${slice.path}" fill="${slice.color}"/>`).join('');
    element.setAttribute('viewBox', '0 0 760 360');
    element.innerHTML = `${sliceMarkup}<circle class="share-hole" cx="${centerX}" cy="${centerY}" r="${innerRadius}"/><text class="share-total-label" x="180" y="174" text-anchor="middle">売上合計</text><text class="share-total-value" x="180" y="198" text-anchor="middle">${escapeHtml(formatYen(totalSales))}</text>${legend}`;
  }

  function polarPoint(centerX, centerY, radius, angle) {
    const radians = angle * Math.PI / 180;
    return { x: (centerX + radius * Math.cos(radians)).toFixed(2), y: (centerY + radius * Math.sin(radians)).toFixed(2) };
  }

  function renderHistory() {
    const keyword = state.historySearch.trim().toLocaleLowerCase('ja');
    const filtered = state.transactions.filter((transaction) => {
      const day = localDateInputValue(transaction.recordedAt);
      if (state.historyFrom && day < state.historyFrom) return false;
      if (state.historyTo && day > state.historyTo) return false;
      if (!keyword) return true;
      const searchable = (transaction.items || []).flatMap((item) => [item.name, item.category]).join(' ').toLocaleLowerCase('ja');
      return searchable.includes(keyword);
    });
    const visible = filtered.slice(0, state.historyVisibleCount);
    const filteredTotal = filtered.reduce((sum, transaction) => sum + (Number(transaction.total) || 0), 0);
    elements.historyResults.textContent = filtered.length
      ? `${filtered.length}件中 ${visible.length}件を表示 · 合計 ${formatYen(filteredTotal)}`
      : state.transactions.length ? '該当する会計はありません。' : '会計履歴はまだありません。';
    elements.historyLoadMore.classList.toggle('is-hidden', visible.length >= filtered.length);
    elements.historyLoadMore.textContent = `さらに20件表示（残り${Math.max(0, filtered.length - visible.length)}件）`;
    elements.historyBody.innerHTML = visible.map((transaction) => {
      const detail = (transaction.items || []).map((item) => `<div class="history-item"><span class="history-item-name">${productNameMarkup(item.name)}</span><small class="history-item-unit-price">${escapeHtml(formatYen(item.unitPrice))}</small><strong>×${item.quantity}</strong></div>`).join('');
      return `<article class="history-card" role="listitem">
        <div class="history-card-header">
          <div class="history-time"><span>${escapeHtml(formatDate(transaction.recordedAt))}</span><small>${transaction.itemCount}点</small></div>
          <div class="history-card-actions"><button type="button" data-history-action="edit" data-transaction-id="${escapeHtml(transaction.id)}">変更</button><button type="button" data-history-action="delete" data-transaction-id="${escapeHtml(transaction.id)}">削除</button></div>
        </div>
        <div class="history-card-body">
          <div class="history-items">${detail || '<span class="muted-label">明細なし</span>'}</div>
          <div class="history-money">
            <div><span>合計</span><strong>${formatYen(transaction.total)}</strong></div>
            <div><span>お預かり</span><b>${formatYen(transaction.received)}</b></div>
            <div><span>おつり</span><b>${formatYen(transaction.change)}</b></div>
          </div>
        </div>
      </article>`;
    }).join('') || `<div class="empty-state">${state.transactions.length ? '条件に合う会計がありません。検索条件を変えてください。' : '会計履歴はまだありません。'}</div>`;
  }

  function renderDailyClose() {
    if (!elements.dailyCloseDate || !elements.dailyCloseSummary) return;
    const report = Core.dailyCloseReport(state.transactions, elements.dailyCloseDate.value);
    elements.dailyCloseSummary.innerHTML = `
      <div><span>会計数</span><strong>${report.transactionCount}</strong></div>
      <div><span>販売個数</span><strong>${report.itemCount}</strong></div>
      <div><span>売上合計</span><strong>${formatYen(report.totalSales)}</strong></div>
      <div><span>お預かり</span><strong>${formatYen(report.totalReceived)}</strong></div>
      <div><span>おつり</span><strong>${formatYen(report.totalChange)}</strong></div>`;
    elements.dailyCloseExport.disabled = report.transactionCount === 0;
  }

  function exportDailyClose() {
    const report = Core.dailyCloseReport(state.transactions, elements.dailyCloseDate.value);
    if (!report.transactionCount) {
      setStatus('選択した日に確定済みの会計はありません。', 'error');
      return;
    }
    downloadCsvFile(`shirayuri-daily-close-${report.date}.csv`, report.csv);
    setStatus(`${report.date}の日次締めレポートを保存しました。`, 'success');
  }

  function activateTab(tabName) {
    document.querySelectorAll('[data-tab-target]').forEach((tab) => {
      const active = tab.dataset.tabTarget === tabName;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('[data-tab-panel]').forEach((panel) => {
      panel.classList.toggle('is-hidden', panel.dataset.tabPanel !== tabName);
    });
  }

  function setAdminMode(isOpen) {
    elements.adminPanel.classList.toggle('is-hidden', !isOpen);
    elements.pageShell.classList.toggle('admin-mode', isOpen);
    elements.adminToggle.setAttribute('aria-expanded', String(isOpen));
  }

  function renderAll() {
    renderCatalog();
    renderProductManagement();
    renderSettings();
    renderCart();
    renderDashboard();
    renderHistory();
  }

  function handleProductAction(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const id = target.dataset.productId;
    const current = state.cart.get(id) || 0;
    if (target.dataset.action === 'add' || target.dataset.action === 'increment') changeQuantity(id, current + 1);
    if (target.dataset.action === 'decrement') changeQuantity(id, current - 1);
    if (target.dataset.action === 'quantity') changeQuantity(id, target.value);
  }

  function handleProductListClick(event) {
    const toggle = event.target.closest('[data-category-toggle]');
    if (toggle) {
      const category = toggle.dataset.categoryToggle;
      if (state.collapsedCategories.has(category)) state.collapsedCategories.delete(category);
      else state.collapsedCategories.add(category);
      renderCatalog();
      return;
    }
    handleProductAction(event);
  }

  function handleCategoryFilterChange(event) {
    const input = event.target.closest('[data-category-filter]');
    if (!input) return;
    const category = input.dataset.categoryFilter;
    if (input.checked) state.hiddenCategories.delete(category);
    else state.hiddenCategories.add(category);
    renderCatalog();
  }

  function handleCategoryFilterOutsideClick(event) {
    if (!elements.categoryFilterControl || !elements.categoryFilterControl.open) return;
    if (elements.categoryFilterControl.contains(event.target)) return;
    elements.categoryFilterControl.open = false;
  }

  function handleProductCardKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('.product-card[data-action="add"]');
    if (!card || card !== event.target) return;
    event.preventDefault();
    changeQuantity(card.dataset.productId, (state.cart.get(card.dataset.productId) || 0) + 1);
  }

  function editTransaction(transactionId) {
    const transaction = state.transactions.find((item) => item.id === transactionId);
    if (!transaction) return;
    state.cart.clear();
    state.cartProducts.clear();
    state.temporaryCheckoutSiblings = null;
    state.editingTransactionId = transaction.id;
    (transaction.items || []).forEach((item) => {
      const productId = item.productId || `${item.category}::${item.name}`;
      const currentProduct = state.products.find((candidate) => candidate.id === productId);
      const product = {
        id: productId,
        category: item.category,
        name: item.name,
        unitPrice: item.unitPrice,
        ...(currentProduct && Number.isInteger(currentProduct.stockLimit) && currentProduct.stockLimit >= 0 ? { stockLimit: currentProduct.stockLimit } : {}),
      };
      state.cartProducts.set(product.id, product);
      state.cart.set(product.id, item.quantity);
    });
    state.received = String(transaction.received);
    elements.received.value = state.received;
    activateTab('products');
    renderAll();
    setStatus('会計を変更中です。内容を直して「変更を保存」を押してください。', '');
    if (root.scrollTo) root.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function clearUndoSale() {
    if (state.undoTimer) root.clearTimeout(state.undoTimer);
    state.undoTimer = null;
    state.undoTransactionId = null;
    if (elements.undoLastSale) elements.undoLastSale.classList.add('is-hidden');
  }

  function offerUndoForSale(transactionId) {
    if (state.undoTimer) root.clearTimeout(state.undoTimer);
    state.undoTransactionId = transactionId;
    elements.undoLastSale.classList.remove('is-hidden');
    state.undoTimer = root.setTimeout(clearUndoSale, 10000);
  }

  function undoLastSale() {
    const transactionId = state.undoTransactionId;
    if (!transactionId) return;
    deleteTransaction(transactionId, { confirm: false, undo: true });
  }

  function deleteTransaction(transactionId, options = {}) {
    if (options.confirm !== false && !root.confirm('この会計を削除しますか？')) return;
    try {
      const previousTransaction = state.transactions.find((item) => item.id === transactionId);
      if (!previousTransaction) return;
      const nextTransactions = Core.removeTransaction(state.transactions, transactionId);
      const nextInventory = Core.applyInventoryTransactionChange(state.inventory, previousTransaction, null, state.products);
      Storage.saveSalesAndInventory(storage, nextTransactions, nextInventory);
      state.transactions = nextTransactions;
      state.inventory = nextInventory;
      if (state.undoTransactionId === transactionId) clearUndoSale();
      if (state.editingTransactionId === transactionId) clearCartState();
      renderAll();
      setStatus(options.undo ? '直前の会計を取り消しました。在庫数も戻しました。' : '会計を削除しました。在庫数も戻しました。', 'success');
    } catch (error) {
      setStatus('会計を削除できませんでした。現在の履歴を維持します。', 'error');
    }
  }

  function handleHistoryAction(event) {
    const target = event.target.closest('[data-history-action]');
    if (!target) return;
    const transactionId = target.dataset.transactionId;
    if (target.dataset.historyAction === 'edit') editTransaction(transactionId);
    if (target.dataset.historyAction === 'delete') deleteTransaction(transactionId);
  }

  function handleProductManagementAction(event) {
    const target = event.target.closest('[data-management-action]');
    if (!target) return;
    const productId = target.dataset.productId;
    if (target.dataset.managementAction === 'save') saveProductDetails(productId, target);
    if (target.dataset.managementAction === 'adjust-stock') adjustProductStock(productId, target);
    if (target.dataset.managementAction === 'icon') {
      elements.iconFile.dataset.targetProductId = productId;
      elements.iconFile.click();
    }
    if (target.dataset.managementAction === 'delete') deleteProduct(productId);
  }

  function handleProductManagementChange(event) {
    const row = event.target.closest('.managed-product-row');
    if (!row) return;
    const target = event.target.closest('[data-management-field="category"]');
    const field = row && row.querySelector('.managed-product-new-category');
    const input = row && row.querySelector('[data-management-field="new-category"]');
    if (target) {
      const isNewCategory = target.value === NEW_CATEGORY_VALUE;
      if (field) field.classList.toggle('is-hidden', !isNewCategory);
      if (input) {
        input.required = isNewCategory;
        if (!isNewCategory) input.value = '';
      }
    }
    updateManagedProductSaveState(row);
  }

  function handleProductManagementInput(event) {
    updateManagedProductSaveState(event.target.closest('.managed-product-row'));
  }

  function saveProductDetails(productId, actionTarget) {
    const row = actionTarget.closest('.managed-product-row');
    const draft = getManagedProductDraft(row, productId);
    if (!draft || !draft.name || !draft.category || draft.rawPrice === '') {
      setStatus('商品名、カテゴリ、単価を入力してください。', 'error');
      return;
    }
    if (!Number.isFinite(draft.unitPrice)) {
      setStatus('単価は数値で入力してください。', 'error');
      return;
    }
    if (!draft.stockLimit.valid) {
      setStatus('在庫上限は0以上の整数で入力してください。空欄の場合は無制限です。', 'error');
      return;
    }
    if (state.products.some((candidate) => candidate.id !== productId && candidate.category === draft.category && candidate.name === draft.name)) {
      setStatus('同じカテゴリと商品名の商品がすでにあります。', 'error');
      return;
    }
    try {
      const nextProduct = { ...draft.product, name: draft.name, category: draft.category, unitPrice: draft.unitPrice };
      if (draft.stockLimit.value === null) delete nextProduct.stockLimit;
      else nextProduct.stockLimit = draft.stockLimit.value;
      const nextProducts = state.products.map((candidate) => candidate.id === productId ? nextProduct : candidate);
      const nextInventory = updateInventoryForProductChange(state.inventory, draft.product, nextProduct);
      Storage.saveProductsAndInventory(storage, nextProducts, nextInventory);
      state.products = nextProducts;
      state.inventory = nextInventory;
      if (state.cartProducts.has(productId)) state.cartProducts.set(productId, nextProduct);
      renderAll();
      setStatus(`${draft.name}の商品情報を反映しました。`, 'success');
    } catch (error) {
      setStatus('商品情報を反映できませんでした。現在の商品一覧を維持します。', 'error');
    }
  }

  function adjustProductStock(productId, actionTarget) {
    const row = actionTarget.closest('.managed-product-row');
    const input = row && row.querySelector('[data-management-field="stock-remaining"]');
    const product = state.products.find((candidate) => candidate.id === productId);
    const value = input ? Number(input.value.trim()) : NaN;
    if (state.editingTransactionId) {
      setStatus('会計の変更を保存または取り消してから、在庫残数を調整してください。', 'error');
      return;
    }
    if (row && getManagedProductDraft(row)?.hasUncommittedChanges) {
      setStatus('先に「商品情報を反映」してから、在庫残数を調整してください。', 'error');
      return;
    }
    if (!product || !input || !input.value.trim() || !Number.isInteger(value) || value < 0) {
      setStatus('実在庫の残数は0以上の整数で入力してください。', 'error');
      return;
    }
    try {
      const sales = getProductSales(product);
      const nextProduct = { ...product, stockLimit: sales + value };
      const nextProducts = state.products.map((candidate) => candidate.id === productId ? nextProduct : candidate);
      const nextInventory = Core.adjustInventory(state.inventory, productId, product.name, value);
      Storage.saveProductsAndInventory(storage, nextProducts, nextInventory);
      state.products = nextProducts;
      state.inventory = nextInventory;
      renderAll();
      setStatus(`${product.name}の在庫残数を${value}個に調整しました。`, 'success');
    } catch (error) {
      setStatus('在庫数を保存できませんでした。現在の在庫を維持します。', 'error');
    }
  }

  function addProduct(event) {
    event.preventDefault();
    const categoryValue = elements.productAddCategory.value;
    const category = categoryValue === NEW_CATEGORY_VALUE ? elements.productAddNewCategory.value.trim() : categoryValue.trim();
    const name = elements.productAddName.value.trim();
    const rawPrice = elements.productAddPrice.value.trim();
    const stockLimit = readOptionalStockLimit(elements.productAddStockLimit);
    if (!category || !name || rawPrice === '' || !Number.isFinite(Number(rawPrice))) {
      setStatus('カテゴリ、商品名、単価を入力してください。', 'error');
      return;
    }
    if (!stockLimit.valid) {
      setStatus('在庫上限は0以上の整数で入力してください。空欄の場合は無制限です。', 'error');
      return;
    }
    try {
      const product = Core.makeProduct(category, name, Number(rawPrice));
      if (stockLimit.value !== null) product.stockLimit = stockLimit.value;
      if (state.products.some((candidate) => candidate.id === product.id)) {
        setStatus('同じカテゴリと商品名の商品がすでにあります。', 'error');
        return;
      }
      const nextProducts = [...state.products, product];
      const nextInventory = addInventoryForProduct(state.inventory, product);
      Storage.saveProductsAndInventory(storage, nextProducts, nextInventory);
      state.products = nextProducts;
      state.inventory = nextInventory;
      elements.productAddName.value = '';
      elements.productAddPrice.value = '';
      elements.productAddStockLimit.value = '';
      elements.productAddNewCategory.value = '';
      elements.productAddCategory.value = product.category;
      renderAll();
      setStatus(`${product.name}を追加しました。`, 'success');
    } catch (error) {
      setStatus(error.message || '商品を追加できませんでした。', 'error');
    }
  }

  function deleteProduct(productId) {
    const product = state.products.find((candidate) => candidate.id === productId);
    if (!product || !root.confirm(`${product.name}を商品一覧から削除しますか？\n過去の会計履歴は残ります。`)) return;
    try {
      const nextProducts = state.products.filter((candidate) => candidate.id !== productId);
      Storage.saveProducts(storage, nextProducts);
      state.products = nextProducts;
      state.cart.delete(productId);
      state.cartProducts.delete(productId);
      renderAll();
      setStatus(`${product.name}を削除しました。過去の会計履歴は残っています。`, 'success');
    } catch (error) {
      setStatus('商品を削除できませんでした。現在の商品一覧を維持します。', 'error');
    }
  }

  function replaceProductIcon(file, productId) {
    if (!file || !productId) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const nextProducts = state.products.map((product) => product.id === productId ? { ...product, icon: String(reader.result) } : product);
        Storage.saveProducts(storage, nextProducts);
        state.products = nextProducts;
        renderAll();
        setStatus('商品アイコンを更新しました。', 'success');
      } catch (error) {
        setStatus('商品アイコンを保存できませんでした。', 'error');
      }
    };
    reader.onerror = () => setStatus('画像を読み込めませんでした。', 'error');
    reader.readAsDataURL(file);
  }

  function renderSettings() {
    const categories = getProductCategories();
    if (state.settings.category && !categories.includes(state.settings.category)) categories.unshift(state.settings.category);
    if (!categories.length) categories.push('その他');
    renderCategorySelect(elements.settingsCategory, categories, state.settings.category, false);
    elements.settingsEnabled.checked = Boolean(state.settings.enabled);
    elements.settingsSiblings.value = state.settings.siblings;
    elements.settingsPerSibling.value = state.settings.perSibling;
    elements.backupEnabled.checked = Boolean(state.settings.autoBackupEnabled);
    elements.backupInterval.value = String(state.settings.autoBackupIntervalMinutes || 5);
    updateSettingsSaveState();
    updateBackupSettingsSaveState();
    updateBackupStatus();
  }

  function formatBackupDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function updateBackupStatus() {
    if (!elements.backupStatus) return;
    const last = formatBackupDate(state.settings.historyBackupLastAt || state.settings.autoBackupLastAt);
    const lastMessage = last ? `最終バックアップ：${last}` : 'バックアップ履歴はまだありません。';
    const interval = Number(state.settings.autoBackupIntervalMinutes) || 5;
    let mode;
    if (state.settings.autoBackupEnabled && !root.showDirectoryPicker) {
      mode = '自動保存はこのブラウザでは使えません。手動CSV保存をご利用ください。';
    } else if (state.settings.autoBackupEnabled && !state.backupDirectoryHandle) {
      mode = '自動保存の保存先フォルダを選択してください。';
    } else if (state.settings.autoBackupEnabled) {
      mode = `自動保存を有効にしています（${interval}分ごと）。`;
    } else {
      mode = '自動保存は停止中です。';
    }
    const lastAt = Date.parse(state.settings.historyBackupLastAt || state.settings.autoBackupLastAt || '');
    const stale = !Number.isFinite(lastAt) || Date.now() - lastAt > 24 * 60 * 60 * 1000;
    const reminder = stale ? ' 24時間以上バックアップがないため、CSV保存をおすすめします。' : '';
    const error = state.lastBackupError ? ` 直近の自動保存に失敗しました：${state.lastBackupError}` : '';
    elements.backupStatus.textContent = `${mode} ${lastMessage}${reminder}${error}`;
  }

  function updateUnsupportedFeatureVisibility() {
    const automaticBackupSupported = typeof root.showDirectoryPicker === 'function' && Boolean(root.indexedDB);
    if (elements.backupOptions) elements.backupOptions.hidden = !automaticBackupSupported;
    if (elements.backupStatus) elements.backupStatus.hidden = false;
  }

  function recordHistoryBackupSuccess(type) {
    const now = new Date().toISOString();
    const nextSettings = {
      ...state.settings,
      historyBackupLastAt: now,
      historyBackupLastType: type,
    };
    try {
      Storage.saveSettings(storage, nextSettings);
      state.settings = nextSettings;
      state.lastBackupError = '';
    } catch (error) {
      state.lastBackupError = 'バックアップ日時を記録できませんでした';
    }
    updateBackupStatus();
  }

  function persistSettings(settings, successMessage, errorMessage) {
    try {
      Storage.saveSettings(storage, settings);
      state.settings = settings;
      applyProductColumnWidth();
      startAutoBackupTimer();
      renderSettings();
      renderCatalog();
      renderCart();
      setStatus(successMessage, 'success');
    } catch (error) {
      setStatus(errorMessage, 'error');
    }
  }

  function saveSettings() {
    const settings = {
      ...state.settings,
      enabled: elements.settingsEnabled.checked,
      category: elements.settingsCategory.value.trim() || '古園服',
      siblings: Math.max(1, Math.floor(Number(elements.settingsSiblings.value) || 1)),
      perSibling: Math.max(0, Math.floor(Number(elements.settingsPerSibling.value) || 0)),
    };
    state.temporaryCheckoutSiblings = null;
    updateSettingsSaveState();
    persistSettings(settings, '制限設定を反映しました。', '制限設定を反映できませんでした。');
  }

  function adjustLimitSetting(settingKey, delta) {
    const input = settingKey === 'siblings' ? elements.settingsSiblings : elements.settingsPerSibling;
    if (!input || !Number.isFinite(delta)) return;
    const minimum = settingKey === 'siblings' ? 1 : 0;
    const current = Math.floor(Number(input.value));
    const next = Math.max(minimum, (Number.isFinite(current) ? current : minimum) + delta);
    input.value = String(next);
  }

  function saveProductColumnWidth() {
    const settings = {
      ...state.settings,
      productColumnWidth: normalizeProductColumnWidth(elements.productColumnWidth.value),
    };
    try {
      Storage.saveSettings(storage, settings);
      state.settings = settings;
      applyProductColumnWidth();
      renderCatalog();
      setStatus('商品列幅を変更しました。', 'success');
    } catch (error) {
      renderCatalog();
      setStatus('商品列幅を変更できませんでした。', 'error');
    }
  }

  function saveBackupSettings() {
    const settings = {
      ...state.settings,
      autoBackupEnabled: elements.backupEnabled.checked,
      autoBackupIntervalMinutes: Math.max(1, Math.floor(Number(elements.backupInterval.value) || 5)),
      autoBackupLastAt: state.settings.autoBackupLastAt || '',
    };
    updateBackupSettingsSaveState();
    persistSettings(settings, '自動バックアップ設定を保存しました。', '自動バックアップ設定を保存できませんでした。');
  }

  function handleCheckoutLimitAdjustment(event) {
    const button = event.target.closest('[data-checkout-siblings-step]');
    if (!button) return;
    const current = state.temporaryCheckoutSiblings == null
      ? Math.max(1, Math.floor(Number(state.settings.siblings) || 1))
      : state.temporaryCheckoutSiblings;
    setTemporaryCheckoutSiblings(current + Number(button.dataset.checkoutSiblingsStep));
  }

  function handleCheckoutLimitAdjustmentChange(event) {
    if (event.target !== elements.checkoutSiblings) return;
    setTemporaryCheckoutSiblings(event.target.value);
  }

  function downloadTextFile(filename, contents, type) {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    root.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadCsvFile(filename, csv) {
    downloadTextFile(filename, `\uFEFF${csv}`, 'text/csv;charset=utf-8');
  }

  function downloadJsonFile(filename, json) {
    downloadTextFile(filename, json, 'application/json;charset=utf-8');
  }

  function backupTimestamp() {
    const date = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  }

  function openBackupHandleDatabase() {
    if (!root.indexedDB) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const request = root.indexedDB.open('shirayuri-backup-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('handles');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('バックアップ設定を開けませんでした'));
    });
  }

  async function loadBackupDirectoryHandle() {
    const database = await openBackupHandleDatabase();
    if (!database) return null;
    return new Promise((resolve, reject) => {
      const request = database.transaction('handles', 'readonly').objectStore('handles').get('sales-history');
      request.onsuccess = () => {
        database.close();
        resolve(request.result || null);
      };
      request.onerror = () => {
        database.close();
        reject(request.error || new Error('保存先を読み込めませんでした'));
      };
    });
  }

  async function saveBackupDirectoryHandle(handle) {
    const database = await openBackupHandleDatabase();
    if (!database) return;
    return new Promise((resolve, reject) => {
      const request = database.transaction('handles', 'readwrite').objectStore('handles').put(handle, 'sales-history');
      request.onsuccess = () => {
        database.close();
        resolve();
      };
      request.onerror = () => {
        database.close();
        reject(request.error || new Error('保存先を保存できませんでした'));
      };
    });
  }

  async function hasBackupDirectoryPermission(handle) {
    if (!handle) return false;
    if (typeof handle.queryPermission !== 'function') return true;
    return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted';
  }

  async function writeBackupCsv(csv) {
    const fileHandle = await state.backupDirectoryHandle.getFileHandle('shirayuri-sales-history.csv', { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(`\uFEFF${csv}`);
      await writable.close();
    } catch (error) {
      if (typeof writable.abort === 'function') await writable.abort();
      throw error;
    }
  }

  async function archiveSalesHistoryBackup() {
    if (!state.backupDirectoryHandle) return { archived: false, filename: '' };
    if (!(await hasBackupDirectoryPermission(state.backupDirectoryHandle))) {
      state.backupDirectoryHandle = null;
      updateBackupStatus();
      throw new Error('バックアップ先フォルダの権限がありません');
    }

    let sourceHandle;
    try {
      sourceHandle = await state.backupDirectoryHandle.getFileHandle('shirayuri-sales-history.csv');
    } catch (error) {
      if (error && error.name === 'NotFoundError') return { archived: false, filename: '' };
      throw error;
    }

    const date = new Date();
    const pad = (value, width = 2) => String(value).padStart(width, '0');
    const filename = `shirayuri-sales-history-archive-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}${pad(date.getMilliseconds(), 3)}.csv`;
    const sourceFile = await sourceHandle.getFile();
    const archiveHandle = await state.backupDirectoryHandle.getFileHandle(filename, { create: true });
    const writable = await archiveHandle.createWritable();
    try {
      await writable.write(await sourceFile.arrayBuffer());
      await writable.close();
    } catch (error) {
      if (typeof writable.abort === 'function') await writable.abort();
      throw error;
    }
    return { archived: true, filename };
  }

  async function exportBackupFiles({ automatic = false } = {}) {
    if (state.autoBackupInProgress) return false;
    if (!state.backupDirectoryHandle) {
      updateBackupStatus();
      if (!automatic) setStatus('先に保存先フォルダを選択してください。', 'error');
      return false;
    }
    if (!(await hasBackupDirectoryPermission(state.backupDirectoryHandle))) {
      state.backupDirectoryHandle = null;
      updateBackupStatus();
      if (!automatic) setStatus('保存先フォルダの権限がないため、もう一度フォルダを選択してください。', 'error');
      return false;
    }
    state.autoBackupInProgress = true;
    try {
      await writeBackupCsv(Core.transactionsToCsv(state.transactions));
      const now = new Date().toISOString();
      state.settings = { ...state.settings, autoBackupLastAt: now, historyBackupLastAt: now, historyBackupLastType: 'automatic' };
      Storage.saveSettings(storage, state.settings);
      state.lastBackupError = '';
      updateBackupStatus();
      if (!automatic) setStatus('販売履歴CSVを保存先フォルダに上書き保存しました。', 'success');
      return true;
    } catch (error) {
      state.backupDirectoryHandle = null;
      state.lastBackupError = error && error.message ? error.message : '保存先に書き込めませんでした';
      updateBackupStatus();
      if (!automatic) setStatus('保存先フォルダに書き込めませんでした。フォルダを選び直してください。', 'error');
      return false;
    } finally {
      state.autoBackupInProgress = false;
    }
  }

  async function selectBackupDirectory({ writeImmediately = false } = {}) {
    if (!root.showDirectoryPicker) {
      setStatus('このブラウザはフォルダへの自動保存に対応していません。ChromeまたはEdgeをご利用ください。', 'error');
      return;
    }
    try {
      const handle = await root.showDirectoryPicker({ mode: 'readwrite' });
      state.backupDirectoryHandle = handle;
      await saveBackupDirectoryHandle(handle);
      updateBackupStatus();
      if (writeImmediately) {
        await exportBackupFiles();
      } else if (state.settings.autoBackupEnabled) {
        await exportBackupFiles({ automatic: true });
      } else {
        setStatus('保存先フォルダを設定しました。', 'success');
      }
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      setStatus('保存先フォルダを設定できませんでした。', 'error');
    }
  }

  async function backupNow() {
    if (!state.backupDirectoryHandle) {
      await selectBackupDirectory({ writeImmediately: true });
      return;
    }
    await exportBackupFiles();
  }

  async function restoreBackupDirectory() {
    if (!root.showDirectoryPicker) return;
    try {
      const handle = await loadBackupDirectoryHandle();
      if (handle && await hasBackupDirectoryPermission(handle)) {
        state.backupDirectoryHandle = handle;
        updateBackupStatus();
        await maybeRunAutoBackup();
      }
    } catch (error) {
      // 保存先を再選択すれば復旧できるため、起動は継続する。
    }
  }

  async function maybeRunAutoBackup() {
    if (!state.settings.autoBackupEnabled || state.autoBackupInProgress) return;
    if (!state.backupDirectoryHandle) {
      updateBackupStatus();
      return;
    }
    const interval = Math.max(1, Number(state.settings.autoBackupIntervalMinutes) || 5) * 60 * 1000;
    const last = Date.parse(state.settings.autoBackupLastAt || '');
    if (!Number.isFinite(last) || Date.now() - last >= interval) await exportBackupFiles({ automatic: true });
  }

  function startAutoBackupTimer() {
    if (state.autoBackupTimer) root.clearInterval(state.autoBackupTimer);
    state.autoBackupTimer = null;
    if (!state.settings.autoBackupEnabled) {
      updateBackupStatus();
      return;
    }
    state.autoBackupTimer = root.setInterval(maybeRunAutoBackup, 60 * 1000);
    void maybeRunAutoBackup();
  }

  function confirmSale() {
    const lines = getCartLines();
    try {
      const limit = Core.calculatePurchaseLimit(lines, getCheckoutLimitSettings());
      if (limit.exceeded) throw new Error(`${limit.category}は${limit.limit}点までです`);
      lines.forEach(({ product, quantity }) => {
        const stock = getProductStockInfo(product);
        if (stock.limited && quantity > stock.maxQuantity) {
          throw new Error(`${product.name}の在庫上限（${product.stockLimit}個）を超えています`);
        }
      });
      const existing = state.transactions.find((transaction) => transaction.id === state.editingTransactionId);
      const transaction = Core.buildTransaction({
        id: existing ? existing.id : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        recordedAt: existing ? existing.recordedAt : new Date().toISOString(),
        lines,
        received: Number(state.received),
      });
      const nextTransactions = existing ? Core.upsertTransaction(state.transactions, transaction) : [transaction, ...state.transactions];
      const nextInventory = Core.applyInventoryTransactionChange(state.inventory, existing || null, transaction, state.products);
      Storage.saveSalesAndInventory(storage, nextTransactions, nextInventory);
      state.transactions = nextTransactions;
      state.inventory = nextInventory;
      clearCartState();
      renderAll();
      if (existing) clearUndoSale();
      else offerUndoForSale(transaction.id);
      setStatus(existing ? `会計を変更しました。${formatYen(transaction.total)}に更新しました。` : `会計を確定しました。${formatYen(transaction.total)}を記録しました。`, 'success');
    } catch (error) {
      setStatus(error.message || '会計を保存できませんでした。', 'error');
    }
  }

  function importProducts(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = Core.parseProductText(reader.result);
      if (!parsed.products.length) {
        setStatus(`商品を取り込めませんでした。${parsed.warnings.join(' ')}`, 'error');
        return;
      }
      try {
        const existingProducts = new Map(state.products.map((product) => [product.id, product]));
        const nextProducts = parsed.products.map((product) => {
          const existing = existingProducts.get(product.id) || (!parsed.hasProductIdColumn
            ? state.products.find((candidate) => candidate.category === product.category && candidate.name === product.name)
            : null);
          if (!existing) return product;
          const merged = { ...product, id: existing.id };
          if (existing.iconPath) {
            merged.iconPath = existing.iconPath;
            merged.icon = existing.icon || '';
          } else if (!product.icon && existing.icon) {
            merged.icon = existing.icon;
          }
          if (!parsed.hasStockLimitColumn && Number.isInteger(existing.stockLimit) && existing.stockLimit >= 0) {
            merged.stockLimit = existing.stockLimit;
          }
          return merged;
        });
        let nextInventory = cloneInventoryLedger();
        nextProducts.forEach((product) => {
          const previous = state.products.find((candidate) => candidate.id === product.id);
          nextInventory = previous
            ? updateInventoryForProductChange(nextInventory, previous, product)
            : addInventoryForProduct(nextInventory, product);
        });
        Storage.saveProductsAndInventory(storage, nextProducts, nextInventory);
        state.products = nextProducts;
        state.inventory = nextInventory;
        clearCartState();
        renderAll();
        const warningText = parsed.warnings.length ? ` 注意: ${parsed.warnings.join(' ')}` : '';
        setStatus(`${parsed.stats.accepted - parsed.stats.duplicates}件の商品を取り込みました。${parsed.stats.rejected}件を除外、重複${parsed.stats.duplicates}件。${warningText}`, parsed.warnings.length ? 'error' : 'success');
      } catch (error) {
        setStatus('商品一覧を保存できませんでした。現在の商品一覧を維持します。', 'error');
      }
    };
    reader.onerror = () => setStatus('ファイルを読み込めませんでした。', 'error');
    reader.readAsText(file, 'UTF-8');
  }

  function exportCsv() {
    const csv = Core.transactionsToCsv(state.transactions);
    const detailCount = state.transactions.reduce((count, transaction) => count + (transaction.items || []).length, 0);
    downloadCsvFile(`shirayuri-sales-history-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    recordHistoryBackupSuccess('manual');
    setStatus(`${detailCount}件の明細を含む${state.transactions.length}件の会計履歴をダウンロードしました。`, 'success');
  }

  function exportProductsCsv() {
    const csv = Core.productsToCsv(state.products);
    downloadCsvFile(`shirayuri-products-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    setStatus(`${state.products.length}件の商品一覧をダウンロードしました。`, 'success');
  }

  function exportSettingsCsv() {
    const csv = Core.settingsToCsv(state.settings);
    downloadCsvFile(`shirayuri-settings-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    setStatus('制限設定をダウンロードしました。', 'success');
  }

  function exportSettingsBundle() {
    const json = Core.settingsBundleToJson(state.products, state.settings, state.inventory);
    downloadJsonFile(`shirayuri-register-settings-${new Date().toISOString().slice(0, 10)}.json`, json);
    setStatus(`${state.products.length}件の商品・在庫数・レジ設定をダウンロードしました。販売履歴は含まれません。`, 'success');
  }

  function importTransactions(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = Core.parseTransactionCsv(reader.result);
      if (!parsed.transactions.length || parsed.warnings.length) {
        setStatus(`会計履歴を復元できませんでした。${parsed.warnings.join(' ')}`, 'error');
        return;
      }
      if (!root.confirm('現在の会計履歴を、CSVの内容で置き換えますか？\n在庫数はこの端末の現在値を維持します。新しい端末へ在庫数も移す場合は、先に「レジ設定一式」を復元してください。')) return;
      try {
        const hasInventoryActivity = Object.values(state.inventory.salesByProduct || {}).some((quantity) => quantity > 0)
          || (state.inventory.adjustments || []).length > 0;
        const nextInventory = !state.transactions.length && !hasInventoryActivity
          ? Core.createInventoryLedger(state.products, parsed.transactions)
          : state.inventory;
        Storage.saveSalesAndInventory(storage, parsed.transactions, nextInventory);
        state.transactions = parsed.transactions;
        state.inventory = nextInventory;
        migrateLegacyTransactionProductIds();
        clearUndoSale();
        clearCartState();
        renderAll();
        setStatus(`${parsed.transactions.length}件の会計履歴を復元しました。`, 'success');
      } catch (error) {
        setStatus('会計履歴を保存できませんでした。現在の履歴を維持します。', 'error');
      }
    };
    reader.onerror = () => setStatus('会計履歴CSVを読み込めませんでした。', 'error');
    reader.readAsText(file, 'UTF-8');
  }

  function importSettings(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = Core.parseSettingsCsv(reader.result);
      if (!parsed.settings) {
        setStatus(`制限設定を取り込めませんでした。${parsed.warnings.join(' ')}`, 'error');
        return;
      }
      if (!root.confirm('現在の制限設定を、CSVの内容で置き換えますか？')) return;
      try {
        const nextSettings = {
          ...state.settings,
          ...parsed.settings,
          productColumnWidth: normalizeProductColumnWidth(parsed.settings.productColumnWidth || state.settings.productColumnWidth),
        };
        Storage.saveSettings(storage, nextSettings);
        state.settings = nextSettings;
        applyProductColumnWidth();
        startAutoBackupTimer();
        renderSettings();
        renderCatalog();
        renderCart();
        setStatus('制限設定を復元しました。', 'success');
      } catch (error) {
        setStatus('制限設定を復元できませんでした。現在の設定を維持します。', 'error');
      }
    };
    reader.onerror = () => setStatus('制限設定ファイルを読み込めませんでした。', 'error');
    reader.readAsText(file, 'UTF-8');
  }

  function importSettingsBundle(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = Core.parseSettingsBundle(reader.result);
      if (!parsed.settings || !parsed.products.length) {
        setStatus(`レジ設定一式を復元できませんでした。${parsed.warnings.join(' ')}`, 'error');
        return;
      }
      if (!root.confirm('現在の商品一覧・在庫数・制限設定を、設定一式ファイルの内容で置き換えますか？販売履歴は変更されません。')) return;
      const previousProducts = state.products;
      const previousSettings = state.settings;
      const previousInventory = state.inventory;
      const nextInventory = parsed.inventory || Core.createInventoryLedger(parsed.products, state.transactions);
      const nextSettings = {
        ...state.settings,
        ...parsed.settings,
        productColumnWidth: normalizeProductColumnWidth(parsed.settings.productColumnWidth || state.settings.productColumnWidth),
        autoBackupLastAt: state.settings.autoBackupLastAt || '',
      };
      try {
        Storage.saveProductsAndInventory(storage, parsed.products, nextInventory);
        Storage.saveSettings(storage, nextSettings);
        state.products = parsed.products;
        state.inventory = nextInventory;
        state.settings = nextSettings;
        applyProductColumnWidth();
        startAutoBackupTimer();
        clearCartState();
        renderAll();
        setStatus(`${parsed.products.length}件の商品・在庫数・レジ設定を復元しました。販売履歴は変更していません。`, 'success');
      } catch (error) {
        try {
          Storage.saveProductsAndInventory(storage, previousProducts, previousInventory);
          Storage.saveSettings(storage, previousSettings);
        } catch (restoreError) {
          // 保存先自体が利用できない場合は、現在の画面状態を維持する。
        }
        setStatus('レジ設定一式を保存できませんでした。現在の設定を維持します。', 'error');
      }
    };
    reader.onerror = () => setStatus('レジ設定一式ファイルを読み込めませんでした。', 'error');
    reader.readAsText(file, 'UTF-8');
  }

  function start() {
    elements.status = $('#status');
    elements.undoLastSale = $('#undo-last-sale');
    elements.pageShell = document.querySelector('.page-shell');
    elements.productList = $('#product-list');
    elements.productCount = $('#product-count');
    elements.cartList = $('#cart-list');
    elements.checkoutPanel = $('#checkout-panel');
    elements.checkoutResizeHandle = $('#checkout-resize-handle');
    elements.paymentBox = document.querySelector('.payment-box');
    elements.cartTotal = $('#cart-total');
    elements.received = $('#received');
    elements.change = $('#change');
    elements.paymentMessage = $('#payment-message');
    elements.confirmButton = $('#confirm-button');
    elements.salesTotal = $('#sales-total');
    elements.transactionCount = $('#transaction-count');
    elements.itemCount = $('#item-count');
    elements.averageTransaction = $('#average-transaction');
    elements.categorySummary = $('#category-summary');
    elements.categoryQuantitySummary = $('#category-quantity-summary');
    elements.inventoryChartSummary = $('#inventory-chart-summary');
    elements.inventoryChart = $('#inventory-chart');
    elements.weekdayHeatmapHead = $('#weekday-heatmap-head');
    elements.weekdayHeatmapBody = $('#weekday-heatmap-body');
    elements.salesChart = $('#sales-chart');
    elements.quantityChart = $('#quantity-chart');
    elements.shareChart = $('#share-chart');
    elements.dailySalesChart = $('#daily-sales-chart');
    elements.hourlyChart = $('#hourly-chart');
    elements.hourlyTableBody = $('#hourly-table-body');
    elements.hourlyTableFoot = $('#hourly-table-foot');
    elements.hourlyCategoryTableHead = $('#hourly-category-table-head');
    elements.hourlyCategoryTableBody = $('#hourly-category-table-body');
    elements.hourlyCategoryTableFoot = $('#hourly-category-table-foot');
    elements.hourlyProductTableHead = $('#hourly-product-table-head');
    elements.hourlyProductTableBody = $('#hourly-product-table-body');
    elements.hourlyProductTableFoot = $('#hourly-product-table-foot');
    elements.analysisTimeFilterNote = $('#analysis-time-filter-note');
    elements.hourlyMetric = $('#hourly-metric');
    elements.hourlyStartHour = $('#hourly-start-hour');
    elements.hourlyEndHour = $('#hourly-end-hour');
    elements.hourlySort = $('#hourly-sort');
    elements.hourlyHideEmpty = $('#hourly-hide-empty');
    elements.historyBody = $('#history-body');
    elements.historySearch = $('#history-search');
    elements.historyFrom = $('#history-from');
    elements.historyTo = $('#history-to');
    elements.historyResults = $('#history-results');
    elements.historyLoadMore = $('#history-load-more');
    elements.stockAdjustmentHistory = $('#stock-adjustment-history');
    elements.dailyCloseDate = $('#daily-close-date');
    elements.dailyCloseSummary = $('#daily-close-summary');
    elements.dailyCloseExport = $('#daily-close-export');
    elements.clearCart = $('#clear-cart');
    elements.purchaseLimit = $('#purchase-limit');
    elements.checkoutLimitBadge = $('#checkout-limit-badge');
    elements.checkoutLimitAdjustment = $('#checkout-limit-adjustment');
    elements.checkoutLimitAdjustmentNote = $('#checkout-limit-adjustment-note');
    elements.checkoutSiblings = $('#checkout-siblings');
    elements.checkoutLimitReset = $('#checkout-limit-reset');
    elements.editingBadge = $('#editing-badge');
    elements.adminPanel = $('#admin-panel');
    elements.adminToggle = $('#admin-toggle');
    elements.adminClose = $('#admin-close');
    elements.settingsPanel = $('#settings-panel');
    elements.settingsEnabled = $('#settings-enabled');
    elements.settingsCategory = $('#settings-category');
    elements.settingsSiblings = $('#settings-siblings');
    elements.settingsPerSibling = $('#settings-per-sibling');
    elements.settingsSave = $('#settings-save');
    elements.backupSettingsSave = $('#backup-settings-save');
    elements.importSettingsFile = $('#import-settings-file');
    elements.exportSettingsCsv = $('#export-settings-csv');
    elements.importSettingsBundleFile = $('#import-settings-bundle-file');
    elements.exportSettingsBundle = $('#export-settings-bundle');
    elements.backupEnabled = $('#backup-enabled');
    elements.backupInterval = $('#backup-interval');
    elements.backupFolder = $('#backup-folder');
    elements.backupOptions = document.querySelector('.backup-options');
    elements.backupStatus = $('#backup-status');
    elements.backupNow = $('#backup-now');
    elements.iconFile = $('#icon-file');
    elements.productAddForm = $('#product-add-form');
    elements.productAddCategory = $('#product-add-category');
    elements.productAddNewCategoryField = $('#product-add-new-category-field');
    elements.productAddNewCategory = $('#product-add-new-category');
    elements.productAddName = $('#product-add-name');
    elements.productAddPrice = $('#product-add-price');
    elements.productAddStockLimit = $('#product-add-stock-limit');
    elements.productAddSubmit = $('#product-add-submit');
    elements.productColumnWidth = $('#product-column-width');
    elements.categoryFilterControl = document.querySelector('.category-filter-control');
    elements.categoryFilterOptions = $('#category-filter-options');
    elements.categoryFilterSummaryCount = $('#category-filter-summary-count');
    elements.productManagementPanel = $('#product-management-panel');
    elements.productManagementList = $('#product-management-list');
    $('#product-list').addEventListener('click', handleProductListClick);
    $('#product-list').addEventListener('change', handleProductAction);
    $('#product-list').addEventListener('keydown', handleProductCardKeydown);
    elements.categoryFilterOptions.addEventListener('change', handleCategoryFilterChange);
    document.addEventListener('click', handleCategoryFilterOutsideClick);
    root.addEventListener('resize', equalizeProductCardHeights);
    $('#cart-list').addEventListener('click', handleProductAction);
    $('#cart-list').addEventListener('change', handleProductAction);
    elements.historyBody.addEventListener('click', handleHistoryAction);
    const updateHistoryFilters = () => {
      state.historySearch = elements.historySearch.value;
      state.historyFrom = elements.historyFrom.value;
      state.historyTo = elements.historyTo.value;
      state.historyVisibleCount = 20;
      renderHistory();
    };
    elements.historySearch.addEventListener('input', updateHistoryFilters);
    elements.historyFrom.addEventListener('change', updateHistoryFilters);
    elements.historyTo.addEventListener('change', updateHistoryFilters);
    $('#history-filter-clear').addEventListener('click', () => {
      elements.historySearch.value = '';
      elements.historyFrom.value = '';
      elements.historyTo.value = '';
      updateHistoryFilters();
    });
    elements.historyLoadMore.addEventListener('click', () => {
      state.historyVisibleCount += 20;
      renderHistory();
    });
    elements.undoLastSale.addEventListener('click', undoLastSale);
    elements.dailyCloseDate.value = localDateInputValue(new Date());
    elements.dailyCloseDate.addEventListener('change', renderDailyClose);
    elements.dailyCloseExport.addEventListener('click', exportDailyClose);
    elements.productManagementList.addEventListener('click', handleProductManagementAction);
    elements.productManagementList.addEventListener('change', handleProductManagementChange);
    elements.productManagementList.addEventListener('input', handleProductManagementInput);
    elements.productAddForm.addEventListener('submit', addProduct);
    elements.productAddForm.addEventListener('input', updateProductAddActionState);
    elements.productAddForm.addEventListener('change', updateProductAddActionState);
    elements.productAddCategory.addEventListener('change', renderProductAddCategories);
    elements.productColumnWidth.addEventListener('change', saveProductColumnWidth);
    document.querySelector('.tab-list').addEventListener('click', (event) => {
      const tab = event.target.closest('[data-tab-target]');
      if (tab) activateTab(tab.dataset.tabTarget);
    });
    elements.received.addEventListener('input', () => { state.received = elements.received.value; renderCart(); });
    elements.checkoutResizeHandle.addEventListener('pointerdown', handleCheckoutResizeStart);
    elements.checkoutResizeHandle.addEventListener('keydown', handleCheckoutResizeKeydown);
    root.addEventListener('resize', () => { if (state.checkoutHeight) setCheckoutHeight(state.checkoutHeight); });
    elements.paymentBox.addEventListener('click', handleReceivedQuickAction);
    elements.checkoutLimitAdjustment.addEventListener('click', handleCheckoutLimitAdjustment);
    elements.checkoutLimitAdjustment.addEventListener('change', handleCheckoutLimitAdjustmentChange);
    elements.checkoutLimitReset.addEventListener('click', () => setTemporaryCheckoutSiblings(state.settings.siblings));
    $('#exact-total').addEventListener('click', () => { state.received = String(Core.calculateCart(getCartLines()).total); elements.received.value = state.received; renderCart(); });
    elements.confirmButton.addEventListener('click', confirmSale);
    elements.clearCart.addEventListener('click', () => { clearCartState(); renderAll(); });
    $('#period-select').addEventListener('change', (event) => { state.period = event.target.value; renderDashboard(); });
    elements.hourlyMetric.addEventListener('change', (event) => { state.hourlyMetric = event.target.value; renderDashboard(); });
    elements.hourlyStartHour.addEventListener('change', (event) => { state.hourlyStartHour = Number(event.target.value); renderDashboard(); });
    elements.hourlyEndHour.addEventListener('change', (event) => { state.hourlyEndHour = Number(event.target.value); renderDashboard(); });
    elements.hourlySort.addEventListener('change', (event) => { state.hourlySort = event.target.value; renderDashboard(); });
    elements.hourlyHideEmpty.addEventListener('change', (event) => { state.hourlyHideEmpty = event.target.checked; renderDashboard(); });
    $('#import-file').addEventListener('change', (event) => { if (event.target.files[0]) importProducts(event.target.files[0]); event.target.value = ''; });
    $('#import-transactions-file').addEventListener('change', (event) => { if (event.target.files[0]) importTransactions(event.target.files[0]); event.target.value = ''; });
    elements.importSettingsFile.addEventListener('change', (event) => { if (event.target.files[0]) importSettings(event.target.files[0]); event.target.value = ''; });
    elements.importSettingsBundleFile.addEventListener('change', (event) => { if (event.target.files[0]) importSettingsBundle(event.target.files[0]); event.target.value = ''; });
    $('#export-csv').addEventListener('click', exportCsv);
    $('#export-products-csv').addEventListener('click', exportProductsCsv);
    elements.exportSettingsCsv.addEventListener('click', exportSettingsCsv);
    elements.exportSettingsBundle.addEventListener('click', exportSettingsBundle);
    elements.iconFile.addEventListener('change', (event) => {
      replaceProductIcon(event.target.files[0], event.target.dataset.targetProductId);
      event.target.value = '';
    });
    elements.adminToggle.addEventListener('click', () => {
      setAdminMode(elements.adminPanel.classList.contains('is-hidden'));
    });
    elements.adminClose.addEventListener('click', () => {
      setAdminMode(false);
    });
    elements.settingsSave.addEventListener('click', saveSettings);
    elements.settingsPanel.addEventListener('click', (event) => {
      const button = event.target.closest('[data-settings-adjust]');
      if (!button) return;
      adjustLimitSetting(button.dataset.settingsAdjust, Number(button.dataset.step));
      updateSettingsSaveState();
    });
    elements.settingsPanel.addEventListener('input', updateSettingsSaveState);
    elements.settingsPanel.addEventListener('change', updateSettingsSaveState);
    updateUnsupportedFeatureVisibility();
    elements.backupSettingsSave.addEventListener('click', saveBackupSettings);
    elements.backupOptions.addEventListener('input', updateBackupSettingsSaveState);
    elements.backupOptions.addEventListener('change', updateBackupSettingsSaveState);
    elements.backupFolder.addEventListener('click', () => { void selectBackupDirectory(); });
    elements.backupNow.addEventListener('click', () => { void backupNow(); });
    root.addEventListener('beforeunload', handleBeforeUnload);
    $('#clear-history').addEventListener('click', async () => {
      const lastBackup = Date.parse(state.settings.historyBackupLastAt || state.settings.autoBackupLastAt || '');
      const backupIsFresh = Number.isFinite(lastBackup) && Date.now() - lastBackup <= 24 * 60 * 60 * 1000;
      const backupWarning = backupIsFresh ? '' : '\n\n最近24時間以内のバックアップがありません。先に販売履歴をダウンロードすることをおすすめします。';
      if (!state.transactions.length || !root.confirm(`会計履歴をすべて消去しますか？\n在庫残数と在庫調整履歴は維持されます。${backupWarning}`)) return;
      let archiveResult;
      try {
        archiveResult = await archiveSalesHistoryBackup();
      } catch (error) {
        setStatus('バックアップCSVをアーカイブできなかったため、会計履歴は消去していません。', 'error');
        return;
      }
      Storage.clearTransactions(storage);
      state.transactions = [];
      clearUndoSale();
      renderAll();
      const archiveMessage = archiveResult.archived
        ? `バックアップCSVを${archiveResult.filename}としてアーカイブしました。`
        : 'アーカイブ対象のバックアップCSVはありませんでした。';
      setStatus(`会計履歴を消去しました。在庫残数・商品一覧・設定は維持されています。${archiveMessage}`, 'success');
    });
    renderHourlyHourOptions();
    applyProductColumnWidth();
    migrateLegacyTransactionProductIds();
    const inventoryWarning = initializeInventoryLedger();
    renderAll();
    renderSettings();
    startAutoBackupTimer();
    void restoreBackupDirectory();
    const warnings = [storageInfo.warning, productState.warning, transactionState.warning, inventoryState.warning, settingsState.warning, inventoryWarning].filter(Boolean);
    setStatus(warnings.join(' '), warnings.length ? 'error' : '');
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
})(typeof window !== 'undefined' ? window : globalThis);

