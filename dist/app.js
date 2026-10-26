(function (root) {
  'use strict';

  // 画面表示とユーザー操作を担当する。集計・会計計算は Core、永続化は Storage に委譲する。
  const Core = root.SalesRegisterCore;
  const Storage = root.SalesRegisterStorage;
  const D1Client = root.SalesRegisterD1Client;
  const fallbackProducts = root.DEFAULT_PRODUCTS || [];
  const PRODUCT_COLUMN_WIDTHS = Object.freeze({
    compact: { desktop: 180, mobile: 125, desktopColumns: 5, mobileColumns: 3, icon: 70, tabletIcon: 58, phoneIcon: 44 },
    standard: { desktop: 200, mobile: 145, desktopColumns: 4, mobileColumns: 2, icon: 78, tabletIcon: 66, phoneIcon: 56 },
    wide: { desktop: 230, mobile: 280, desktopColumns: 3, mobileColumns: 1, icon: 88, tabletIcon: 76, phoneIcon: 72 },
  });
  const SALE_NOTE_MAX_LENGTH = 200;

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
    ...(root.DEFAULT_SETTINGS || {}),
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
  function normalizeProductsWithIcons(products) {
    return products.map((product) => {
    if (product.icon && String(product.icon).startsWith('data:image/')) return product;
    if (defaultIconPaths.has(product.id)) return { ...product, icon: '', iconPath: defaultIconPaths.get(product.id) };
    if (product.icon || product.iconPath) return product;
    if (defaultIcons.has(product.id)) return { ...product, icon: defaultIcons.get(product.id) };
    return product;
    });
  }
  const productsWithIcons = normalizeProductsWithIcons(productState.products);
  const state = {
    products: productsWithIcons,
    transactions: transactionState.transactions,
    inventory: inventoryState.inventory,
    settings: settingsState.settings,
    cart: new Map(),
    cartProducts: new Map(),
    received: '',
    saleNote: '',
    period: 'today',
    hourlyMetric: 'transactions',
    hourlyStartHour: 0,
    hourlyEndHour: 23,
    hourlySort: 'hour',
    hourlyHideEmpty: false,
    collapsedCategories: new Set(),
    hiddenCategories: new Set(),
    checkoutHeight: null,
    fitCheckoutHeightAfterClear: false,
    mobileCheckoutOpen: false,
    editingTransactionId: null,
    saleSaving: false,
    pendingChangeConfirmation: null,
    statusTimer: null,
    autoBackupTimer: null,
    autoBackupInProgress: false,
    backupReminderStartedAt: Date.now(),
    backupReminderSnoozedUntil: 0,
    backupReminderDue: false,
    backupDirectoryHandle: null,
    temporaryCheckoutSiblings: null,
    serverRevision: 0,
    remoteAuthenticated: false,
    remoteWriteInProgress: false,
    remoteRefreshing: false,
    remoteConnecting: false,
    adminPasswordRequest: null,
    remoteSyncTimer: null,
    remoteVisibilityHandler: null,
    pendingProductCopy: null,
    productOrderSaving: false,
    expandedManagedProducts: new Set(),
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

  function chartLabelText(value) {
    return String(value == null ? '' : value).replace(/\\n|\r?\n/g, ' ').trim();
  }

  function chartLabelLines(value, maxCharacters = 12) {
    return String(value == null ? '' : value)
      .replace(/\\n|\r?\n/g, '\n')
      .split('\n')
      .flatMap((line) => {
        const characters = Array.from(line);
        const lines = [];
        while (characters.length > maxCharacters) lines.push(characters.splice(0, maxCharacters).join(''));
        if (characters.length || !lines.length) lines.push(characters.join(''));
        return lines;
      });
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
    // 在庫残数と購入制限の残りを別々に計算し、厳しい方を販売可能数にする。
    // 会計編集中は、その会計分を一時的に戻してから新しい数量を判定する。
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

  function getProductPhysicalRemaining(product) {
    const hasLimit = Number.isInteger(product && product.stockLimit) && product.stockLimit >= 0;
    if (!hasLimit) return null;
    const ledger = state.inventory || { remainingByProduct: {} };
    if (Object.prototype.hasOwnProperty.call(ledger.remainingByProduct || {}, product.id)) {
      return Math.max(0, Math.floor(Number(ledger.remainingByProduct[product.id]) || 0));
    }
    return Math.max(0, product.stockLimit - getProductSales(product));
  }

  function getCartStockError(lines = getCartLines()) {
    for (const line of lines) {
      const stock = getProductStockInfo(line.product);
      if (!stock.limited || line.quantity <= stock.maxQuantity) continue;
      const available = Math.max(0, Math.floor(Number(stock.maxQuantity) || 0));
      return {
        product: line.product,
        available,
        message: available === 0
          ? `${line.product.name}は在庫切れです。管理画面から在庫残数を調整してください。`
          : `${line.product.name}は残り${available}個までです。数量を減らしてください。`,
      };
    }
    return null;
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
    // 上限変更では実在庫を動かさない。手動調整済みの残数はそのまま保持し、
    // まだ実在庫を設定していない商品だけ上限と販売済みから初期化する。
    const next = {
      salesByProduct: { ...(ledger.salesByProduct || {}) },
      remainingByProduct: { ...(ledger.remainingByProduct || {}) },
      adjustments: Array.isArray(ledger.adjustments) ? ledger.adjustments.slice() : [],
    };
    const id = nextProduct.id;
    const sold = Math.max(0, Number(next.salesByProduct[id]) || 0);
    const newLimit = Number.isInteger(nextProduct.stockLimit) && nextProduct.stockLimit >= 0 ? nextProduct.stockLimit : null;
    if (newLimit === null) {
      delete next.remainingByProduct[id];
    } else if (!Object.prototype.hasOwnProperty.call(next.remainingByProduct, id)) {
      next.remainingByProduct[id] = Math.max(0, newLimit - sold);
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

  function migrateLegacyTransactionProductIds(transactions = state.transactions) {
    const productsByName = new Map();
    state.products.forEach((product) => {
      productsByName.set(`${product.category}::${product.name}`, product);
      productsByName.set(product.id, product);
    });
    let changed = false;
    transactions.forEach((transaction) => {
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
        if (transactions === state.transactions) Storage.saveTransactions(storage, state.transactions);
      } catch (error) {
        // In-memory migration still works for this session if persistence is unavailable.
      }
    }
    return changed;
  }

  function initializeInventoryLedger() {
    // 台帳がない初回だけ履歴から作り、既存台帳の物理在庫は履歴削除後も維持する。
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

  function sharedSettings(settings) {
    return {
      enabled: Boolean(settings.enabled),
      category: String(settings.category || ''),
      siblings: Math.max(1, Math.floor(Number(settings.siblings) || 1)),
      perSibling: Math.max(0, Math.floor(Number(settings.perSibling) || 0)),
    };
  }

  function makeSharedSnapshot(overrides = {}) {
    return {
      products: overrides.products || state.products,
      transactions: overrides.transactions || state.transactions,
      inventory: overrides.inventory || state.inventory || Core.createInventoryLedger(state.products, state.transactions),
      settings: sharedSettings(overrides.settings || state.settings),
    };
  }

  function sharedListDiff(current, next) {
    const currentById = new Map(current.map((item) => [item.id, item]));
    const nextById = new Map(next.map((item) => [item.id, item]));
    const upsert = next.filter((item) => JSON.stringify(currentById.get(item.id)) !== JSON.stringify(item));
    const remove = current.filter((item) => !nextById.has(item.id)).map((item) => item.id);
    return { upsert, remove };
  }

  function sharedSnapshotDiff(current, next) {
    const changes = {};
    const products = sharedListDiff(current.products, next.products);
    const transactions = sharedListDiff(current.transactions, next.transactions);
    if (products.upsert.length || products.remove.length) changes.products = products;
    const currentProductOrder = current.products.map((product) => product.id);
    const nextProductOrder = next.products.map((product) => product.id);
    if (JSON.stringify(currentProductOrder) !== JSON.stringify(nextProductOrder)) changes.productOrder = nextProductOrder;
    if (transactions.upsert.length || transactions.remove.length) changes.transactions = transactions;
    if (JSON.stringify(current.inventory) !== JSON.stringify(next.inventory)) changes.inventory = next.inventory;
    if (JSON.stringify(current.settings) !== JSON.stringify(next.settings)) changes.settings = next.settings;
    return changes;
  }

  function sharedSnapshotsDiffer(current, next) {
    return Object.keys(sharedSnapshotDiff(current, next)).length > 0;
  }

  function mirrorRemoteSnapshot(snapshot) {
    // localStorageはサーバーデータのキャッシュ。失敗してもD1に保存済みの正本は維持する。
    try {
      Storage.saveProductsAndInventory(storage, snapshot.products, snapshot.inventory);
      Storage.saveTransactions(storage, snapshot.transactions);
      Storage.saveSettings(storage, { ...state.settings, ...snapshot.settings });
    } catch (error) {
      // 端末内キャッシュに空きがなくても、共有サーバーの保存を取り消さない。
    }
  }

  async function persistSharedSnapshot(overrides, localPersist, previousSnapshot = null) {
    if (!D1Client || !D1Client.isConfigured()) {
      localPersist();
      return { revision: state.serverRevision, changed: true };
    }
    if (!state.remoteAuthenticated) throw new Error('共有レジにログインしてから操作してください。');
    if (state.remoteWriteInProgress) throw new Error('別の保存処理が終わるまでお待ちください。');
    state.remoteWriteInProgress = true;
    let conflict = null;
    let result;
    const previous = previousSnapshot || makeSharedSnapshot();
    const snapshot = makeSharedSnapshot(overrides);
    try {
      const changes = sharedSnapshotDiff(previous, snapshot);
      result = await D1Client.save({ expectedRevision: state.serverRevision, changes });
      state.serverRevision = result.revision;
      mirrorRemoteSnapshot(snapshot);
    } catch (error) {
      if (error.status === 409) conflict = error;
      else throw error;
    } finally {
      state.remoteWriteInProgress = false;
    }
    if (conflict) {
      try { await refreshRemoteData({ silent: true }); } catch (error) { /* 次の定期同期で再試行する */ }
      throw new Error('別の端末で先に更新されました。最新データを読み込みました。内容を確認して、もう一度操作してください。');
    }
    return result;
  }

  function persistenceErrorMessage(error, fallback) {
    const message = String(error && error.message || '');
    if (error && [401, 403, 409, 413, 428].includes(error.status)) return message || fallback;
    if (/共有サーバー|共有レジ|別の端末|Worker|D1/.test(message)) return message;
    return fallback;
  }

  function applyRemoteListChanges(current, delta) {
    const removed = new Set(delta.remove || []);
    const byId = new Map(current.filter((item) => !removed.has(item.id)).map((item) => [item.id, item]));
    (delta.upsert || []).forEach((item) => byId.set(item.id, item));
    return [...byId.values()];
  }

  function acceptRemoteSnapshot(snapshot) {
    state.products = normalizeProductsWithIcons(snapshot.products);
    state.transactions = snapshot.transactions;
    state.inventory = snapshot.inventory;
    state.settings = { ...state.settings, ...snapshot.settings };
    state.serverRevision = snapshot.revision;
    mirrorRemoteSnapshot(makeSharedSnapshot());
  }

  async function refreshRemoteData({ silent = false } = {}) {
    if (!state.remoteAuthenticated || state.remoteRefreshing || state.remoteWriteInProgress) return;
    state.remoteRefreshing = true;
    let changed = false;
    try {
      let response;
      do {
        response = await D1Client.getChanges(state.serverRevision);
        if (response.reset) {
          acceptRemoteSnapshot(await D1Client.getState());
          changed = true;
          break;
        }
        (response.events || []).forEach((event) => {
          if (event.changes && event.changes.products) {
            state.products = normalizeProductsWithIcons(applyRemoteListChanges(state.products, event.changes.products));
          }
          if (event.changes && event.changes.productOrder) {
            const order = new Map(event.changes.productOrder.map((id, index) => [id, index]));
            state.products.sort((left, right) => (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER));
          }
          if (event.changes && event.changes.transactions) {
            state.transactions = applyRemoteListChanges(state.transactions, event.changes.transactions)
              .sort((left, right) => String(right.recordedAt).localeCompare(String(left.recordedAt)));
          }
          if (event.changes && event.changes.inventory) state.inventory = event.changes.inventory;
          if (event.changes && event.changes.settings) state.settings = { ...state.settings, ...event.changes.settings };
          state.serverRevision = event.revision;
          changed = true;
        });
      } while (response.hasMore);
      if (changed) {
        mirrorRemoteSnapshot(makeSharedSnapshot());
        renderAll();
        if (!silent) setStatus('別の端末の更新を反映しました。', 'success');
      }
    } finally {
      state.remoteRefreshing = false;
    }
  }

  function getCheckoutLimitSettings() {
    // この会計だけの例外値を優先する。state.settings 自体は変更・保存しない。
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
    if (state.saleSaving) return;
    let quantity = Math.max(0, Math.floor(Number(nextQuantity) || 0));
    const product = findProduct(id);
    if (product) {
      const stock = getProductStockInfo(product);
      if (stock.limited && quantity > stock.maxQuantity) {
        const available = Math.max(0, Math.floor(Number(stock.maxQuantity) || 0));
        quantity = stock.maxQuantity;
        setStatus(available === 0
          ? `${product.name}は在庫切れです。管理画面から在庫残数を調整してください。`
          : `${product.name}は残り${available}個までです。`, 'error');
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

  function setSaleNote(note, expanded) {
    const value = String(note || '').slice(0, SALE_NOTE_MAX_LENGTH);
    state.saleNote = value;
    if (!elements.saleNote || !elements.saleNoteField || !elements.saleNoteToggle) return;
    elements.saleNote.value = value;
    const isExpanded = typeof expanded === 'boolean' ? expanded : Boolean(value);
    elements.saleNoteField.classList.toggle('is-hidden', !isExpanded);
    elements.saleNoteToggle.setAttribute('aria-expanded', String(isExpanded));
    elements.saleNoteToggle.textContent = isExpanded ? '− メモを閉じる' : value ? 'メモを表示' : '＋ 会計メモを追加';
    elements.saleNoteCount.textContent = `${value.length}/${SALE_NOTE_MAX_LENGTH}`;
  }

  function clearCartState() {
    cancelChangeConfirmation();
    state.fitCheckoutHeightAfterClear = state.checkoutHeight != null;
    state.cart.clear();
    state.cartProducts.clear();
    state.received = '';
    setSaleNote('', false);
    state.editingTransactionId = null;
    state.temporaryCheckoutSiblings = null;
    if (elements.received) elements.received.value = '';
    if (state.fitCheckoutHeightAfterClear && elements.checkoutPanel) {
      elements.checkoutPanel.querySelector('.checkout-scroll-area').scrollTop = 0;
    }
  }

  function requestClearCart() {
    if (state.saleSaving) return;
    const editing = Boolean(state.editingTransactionId);
    elements.clearCartDialogTitle.textContent = editing
      ? '変更内容を取り消しますか？'
      : '会計をすべて取り消しますか？';
    elements.clearCartDialogMessage.textContent = editing
      ? '編集中の内容を破棄して、編集前の会計に戻ります。確定済みの会計は変更されません。'
      : '選択中の商品、お預かり金額、会計メモを消します。確定済みの会計履歴は削除されません。';
    elements.clearCartDialogConfirm.textContent = editing ? '変更を取り消す' : 'すべて取り消す';

    if (typeof elements.clearCartDialog.showModal === 'function') {
      elements.clearCartDialog.showModal();
      return;
    }
    if (root.confirm(`${elements.clearCartDialogTitle.textContent}\n${elements.clearCartDialogMessage.textContent}`)) {
      confirmClearCart();
    }
  }

  function confirmClearCart() {
    if (elements.clearCartDialog.open) elements.clearCartDialog.close();
    clearCartState();
    renderAll();
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

  function isMobileCheckoutViewport() {
    return root.matchMedia ? root.matchMedia('(max-width: 560px)').matches : root.innerWidth <= 560;
  }

  function setMobileCheckoutOpen(isOpen, { restoreFocus = true } = {}) {
    const nextOpen = Boolean(isOpen && isMobileCheckoutViewport());
    const wasOpen = state.mobileCheckoutOpen;
    state.mobileCheckoutOpen = nextOpen;
    elements.checkoutPanel.classList.toggle('is-mobile-open', nextOpen);
    elements.pageShell.classList.toggle('mobile-checkout-open', nextOpen);
    root.document.body.classList.toggle('mobile-checkout-open', nextOpen);
    elements.mobileCheckoutOpen.setAttribute('aria-expanded', String(nextOpen));
    if (nextOpen) {
      elements.checkoutPanel.setAttribute('role', 'dialog');
      elements.checkoutPanel.setAttribute('aria-modal', 'true');
      elements.checkoutPanel.querySelector('.checkout-scroll-area').scrollTop = 0;
      elements.mobileCheckoutClose.focus();
    } else {
      elements.checkoutPanel.removeAttribute('role');
      elements.checkoutPanel.removeAttribute('aria-modal');
      if (wasOpen && restoreFocus) elements.mobileCheckoutOpen.focus();
    }
  }

  function handleMobileCheckoutKeydown(event) {
    // ネイティブdialogのフォーカス移動とEscape処理を優先する。
    if (elements.changeConfirmationDialog.open) return;
    if (!state.mobileCheckoutOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setMobileCheckoutOpen(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...elements.checkoutPanel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      event.preventDefault();
      elements.mobileCheckoutClose.focus();
    } else if (event.shiftKey && root.document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && root.document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function fitCheckoutHeightToContent() {
    if (state.checkoutHeight == null) return true;
    const panelRect = elements.checkoutPanel.getBoundingClientRect();
    const buttonRect = elements.confirmButton.getBoundingClientRect();
    if (!panelRect.height || !buttonRect.height) return false;
    const panelStyle = root.getComputedStyle(elements.checkoutPanel);
    const bottomPadding = Number.parseFloat(panelStyle.paddingBottom) || 0;
    const bottomBorder = Number.parseFloat(panelStyle.borderBottomWidth) || 0;
    const contentHeight = Math.ceil(buttonRect.bottom - panelRect.top + bottomPadding + bottomBorder);
    if (contentHeight < state.checkoutHeight) setCheckoutHeight(contentHeight);
    return true;
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
    const startNewRowInput = row.querySelector('[data-management-field="start-new-row"]');
    if (!product || !nameInput || !categoryInput || !priceInput || !stockLimitInput) return null;

    const inputName = nameInput.value.trim();
    const name = inputName === String(product.name).replace(/\r?\n/g, '\\n') ? product.name : inputName;
    const selectedCategory = categoryInput.value.trim();
    const category = selectedCategory === NEW_CATEGORY_VALUE
      ? (newCategoryInput ? newCategoryInput.value.trim() : '')
      : selectedCategory;
    const rawPrice = priceInput.value.trim();
    const unitPrice = Number(rawPrice);
    const stockLimit = readOptionalStockLimit(stockLimitInput);
    const currentStockLimit = Number.isInteger(product.stockLimit) && product.stockLimit >= 0 ? product.stockLimit : null;
    const startNewRow = Boolean(startNewRowInput && startNewRowInput.checked);
    const currentStartNewRow = product.startNewRow === true;
    const valid = Boolean(name && category && rawPrice !== '' && Number.isFinite(unitPrice) && stockLimit.valid);
    const hasUncommittedChanges = name !== product.name
      || category !== product.category
      || rawPrice !== String(product.unitPrice)
      || !stockLimit.valid
      || stockLimit.value !== currentStockLimit
      || startNewRow !== currentStartNewRow;
    const canSave = valid && (
      name !== product.name
      || category !== product.category
      || unitPrice !== Number(product.unitPrice)
      || stockLimit.value !== currentStockLimit
      || startNewRow !== currentStartNewRow
    );

    return { saveButton, product, name, category, rawPrice, unitPrice, stockLimit, startNewRow, hasUncommittedChanges, canSave };
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
    // カートだけでなく、管理画面の未保存フォームもページ離脱警告の対象にする。
    return state.cart.size > 0
      || state.received !== ''
      || Boolean(state.saleNote.trim())
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
        const cardState = `${quantity > 0 ? ' has-quantity' : ''}${limitExceeded ? ' is-limit-exceeded' : ''}${stockReached ? ' is-stock-reached' : ''}${stockUnavailable ? ' is-stock-exhausted' : ''}${stockLow ? ' is-stock-low' : ''}${product.startNewRow === true ? ' starts-new-row' : ''}`;
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
    elements.categoryOrderList.innerHTML = categories.map((category) => `
      <div class="category-order-row">
        <span class="category-order-name">${escapeHtml(category)}</span>
        <div class="category-order-actions" role="group" aria-label="${escapeHtml(category)}カテゴリの並び順">
          <button class="managed-product-action" type="button" data-category-order="-1" data-category="${escapeHtml(category)}" title="上へ" aria-label="${escapeHtml(category)}カテゴリを上へ移動">↑</button>
          <button class="managed-product-action" type="button" data-category-order="1" data-category="${escapeHtml(category)}" title="下へ" aria-label="${escapeHtml(category)}カテゴリを下へ移動">↓</button>
        </div>
      </div>`).join('') || '<p class="muted-label">カテゴリがありません。</p>';
    const groupedProducts = categories.flatMap((category) => state.products.filter((product) => product.category === category));
    elements.productManagementList.innerHTML = groupedProducts.map((product, index) => `
      <div class="managed-product-item" data-managed-product-id="${escapeHtml(product.id)}">
        <div class="managed-product-heading">
          <button class="managed-product-toggle" type="button" data-management-action="toggle" data-product-id="${escapeHtml(product.id)}" aria-expanded="${state.expandedManagedProducts.has(product.id)}" aria-controls="managed-product-editor-${index}" aria-label="${escapeHtml(productNameText(product.name))}の商品情報を開閉">
            <span class="managed-product-preview" aria-hidden="true">${iconMarkup(product)}</span>
            <span class="managed-product-summary"><strong>${productNameMarkup(product.name)}</strong><small>${escapeHtml(product.category)} · ${formatYen(product.unitPrice)}${product.startNewRow === true ? ' · 次の行から表示' : ''}</small></span>
          </button>
          <div class="managed-product-order" role="group" aria-label="${escapeHtml(productNameText(product.name))}の並び順">
            <button class="managed-product-action" type="button" data-management-action="move-up" data-product-id="${escapeHtml(product.id)}" title="上へ" aria-label="${escapeHtml(productNameText(product.name))}を上へ移動">↑</button>
            <button class="managed-product-action" type="button" data-management-action="move-down" data-product-id="${escapeHtml(product.id)}" title="下へ" aria-label="${escapeHtml(productNameText(product.name))}を下へ移動">↓</button>
          </div>
        </div>
        <div id="managed-product-editor-${index}" class="managed-product-row${state.expandedManagedProducts.has(product.id) ? '' : ' is-hidden'}">
        <div class="managed-product-info">
          <div class="managed-product-fields">
          <label class="managed-product-name">商品名<input type="text" value="${escapeHtml(String(product.name).replace(/\r?\n/g, '\\n'))}" data-management-field="name" data-product-id="${escapeHtml(product.id)}" aria-label="${escapeHtml(productNameText(product.name))}の商品名"></label>
            <label class="managed-product-category">カテゴリ<select data-management-field="category" data-product-id="${escapeHtml(product.id)}" aria-label="${escapeHtml(productNameText(product.name))}のカテゴリ">${categories.map((category) => `<option value="${escapeHtml(category)}"${category === product.category ? ' selected' : ''}>${escapeHtml(category)}</option>`).join('')}<option value="${NEW_CATEGORY_VALUE}">＋新しいカテゴリを追加</option></select></label>
            <label class="managed-product-price">単価<input type="number" step="1" value="${escapeHtml(product.unitPrice)}" data-management-field="price" data-product-id="${escapeHtml(product.id)}" aria-label="${escapeHtml(productNameText(product.name))}の単価"></label>
            <label class="managed-product-stock">在庫上限<input type="number" min="0" step="1" value="${Number.isInteger(product.stockLimit) && product.stockLimit >= 0 ? escapeHtml(product.stockLimit) : ''}" placeholder="無制限" data-management-field="stock-limit" data-product-id="${escapeHtml(product.id)}" aria-label="${escapeHtml(productNameText(product.name))}の在庫上限"><small class="managed-stock-summary">販売済 ${getProductSales(product)} / ${Number.isInteger(product.stockLimit) && product.stockLimit >= 0 ? `上限 ${product.stockLimit}・残り ${getProductStockInfo(product).remaining}` : '上限なし'}</small></label>
            <label class="managed-product-new-category is-hidden">新しいカテゴリ<input type="text" data-management-field="new-category" data-product-id="${escapeHtml(product.id)}" placeholder="カテゴリ名" aria-label="${escapeHtml(productNameText(product.name))}の新しいカテゴリ"></label>
          </div>
          <label class="managed-product-row-break"><input type="checkbox" data-management-field="start-new-row" data-product-id="${escapeHtml(product.id)}"${product.startNewRow === true ? ' checked' : ''} aria-label="${escapeHtml(productNameText(product.name))}から次の行に表示">この商品から次の行に表示</label>
          <div class="managed-stock-adjustment">
            <label>実在庫の残数<input type="number" min="0" step="1" value="${getProductPhysicalRemaining(product) ?? ''}" data-saved-value="${getProductPhysicalRemaining(product) ?? ''}" data-management-field="stock-remaining" data-product-id="${escapeHtml(product.id)}" aria-label="${escapeHtml(productNameText(product.name))}の現在庫残数"></label>
            <button class="managed-product-action" type="button" data-management-action="adjust-stock" data-product-id="${escapeHtml(product.id)}" disabled>残数を反映</button>
          </div>
        </div>
        <div class="managed-product-actions">
            <button class="managed-product-action managed-product-save" type="button" data-management-action="save" data-product-id="${escapeHtml(product.id)}" aria-label="${escapeHtml(productNameText(product.name))}の商品情報を反映" disabled>商品情報を反映</button>
          <button class="managed-product-action" type="button" data-management-action="copy" data-product-id="${escapeHtml(product.id)}" aria-label="${escapeHtml(productNameText(product.name))}をコピーして追加">コピー</button>
          <button class="managed-product-action" type="button" data-management-action="icon" data-product-id="${escapeHtml(product.id)}">画像を変更</button>
          <button class="managed-product-action managed-product-delete" type="button" data-management-action="delete" data-product-id="${escapeHtml(product.id)}">削除</button>
        </div>
        </div>
      </div>`).join('') || '<div class="empty-state">商品がありません。</div>';
    updateProductOrderActions();
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
    const stockError = getCartStockError(lines);
    const temporarySiblings = state.temporaryCheckoutSiblings;
    elements.cartTotal.textContent = formatYen(cart.total);
    elements.mobileCartTotal.textContent = formatYen(cart.total);
    elements.checkoutPanel.classList.toggle('is-limit-exceeded', limit.exceeded);
    elements.checkoutPanel.classList.toggle('is-stock-error', Boolean(stockError));
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
    elements.clearCart.textContent = state.editingTransactionId ? '変更を取り消す' : 'すべて取り消す';
    elements.editingBadge.classList.toggle('is-hidden', !state.editingTransactionId);
    if (!cart.lineItems.length) {
      elements.cartList.innerHTML = '<div class="empty-state">商品を選ぶと、ここに明細が表示されます。</div>';
    } else {
      elements.cartList.innerHTML = cart.lineItems.map((item) => {
        const cartProduct = state.products.find((candidate) => candidate.id === item.productId)
          || state.products.find((candidate) => candidate.category === item.category && candidate.name === item.name)
          || [...state.cartProducts.values()].find((candidate) => candidate.id === item.productId || (candidate.category === item.category && candidate.name === item.name));
        const id = item.productId || (cartProduct ? cartProduct.id : `${item.category}::${item.name}`);
        const itemName = productNameText(item.name) ? item.name : (cartProduct && cartProduct.name) || '商品';
        const lineLimitExceeded = limit.exceeded && item.category === limit.category;
        const itemStock = cartProduct ? getProductStockInfo(cartProduct) : null;
        const lineStockError = Boolean(itemStock && itemStock.limited && item.quantity > itemStock.maxQuantity);
        const stockBadge = lineStockError ? `<span class="cart-stock-badge">${itemStock.maxQuantity === 0 ? '在庫切れ' : '在庫不足'}</span>` : '';
        return `<div class="cart-line${lineLimitExceeded ? ' is-limit-exceeded' : ''}${lineStockError ? ' is-stock-error' : ''}">
          <div class="cart-line-product"><span class="cart-line-icon" aria-hidden="true">${iconMarkup(cartProduct || { category: item.category })}</span><div class="cart-line-content"><div class="cart-line-name">${productNameMarkup(itemName)}${lineLimitExceeded ? '<span class="cart-limit-badge">制限超過</span>' : ''}${stockBadge}</div><div class="cart-line-meta">${formatYen(item.unitPrice)} × ${item.quantity}</div></div></div>
          <div><div class="cart-line-total">${formatYen(item.subtotal)}</div><div class="stepper"><button type="button" data-action="decrement" data-product-id="${escapeHtml(id)}">−</button><input type="number" min="0" step="1" value="${item.quantity}" data-action="quantity" data-product-id="${escapeHtml(id)}"><button type="button" data-action="increment" data-product-id="${escapeHtml(id)}">＋</button></div></div>
        </div>`;
      }).join('');
    }
    const received = Number(state.received);
    const canCalculateChange = Number.isFinite(received) && state.received !== '';
    elements.change.textContent = canCalculateChange ? formatYen(received - cart.total) : '¥0';
    if (cart.total < 0) elements.paymentMessage.textContent = '合計がマイナスになる組み合わせは確定できません。';
    else if (stockError) elements.paymentMessage.textContent = stockError.message;
    else if (limit.exceeded) elements.paymentMessage.textContent = `${limit.category}は${limit.limit}点までです。下の人数をこの会計だけ変更できます。`;
    else if (temporarySiblings != null) elements.paymentMessage.textContent = `${limit.category}をこの会計だけ${temporarySiblings}人分として計算しています。`;
    else if (canCalculateChange && received < cart.total) elements.paymentMessage.textContent = `あと${formatYen(cart.total - received)}必要です。`;
    else elements.paymentMessage.textContent = '';
    const canConfirm = cart.lineItems.length > 0 && cart.total >= 0 && !stockError && !limit.exceeded && canCalculateChange && received >= cart.total;
    elements.confirmButton.textContent = state.saleSaving ? '保存中…'
      : state.editingTransactionId ? '変更を保存'
        : canConfirm && received > cart.total ? `お釣り ${formatYen(received - cart.total)} を確認` : '会計を確定する';
    elements.confirmButton.disabled = state.saleSaving || !canConfirm;
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
    const top = [...products]
      .filter((product) => Number(product.quantity) > 0)
      .sort((a, b) => (Number(b[metric]) || 0) - (Number(a[metric]) || 0) || b.sales - a.sales || a.name.localeCompare(b.name, 'ja'));
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
    let rowTop = 16;
    const rows = top.map((product) => {
      const value = Math.max(0, Number(product[metric]) || 0);
      const barWidth = Math.round(value / max * barMaxWidth);
      const labelLines = chartLabelLines(product.name);
      const rowHeight = Math.max(40, labelLines.length * 14 + 12);
      const y = rowTop + rowHeight / 2;
      rowTop += rowHeight;
      const valueText = valueLabel === 'quantity'
        ? `${product.quantity}個`
        : valueLabel === 'share'
          ? `${value.toFixed(value >= 10 ? 0 : 1)}%`
          : formatYen(product.sales);
      const barClass = valueLabel === 'quantity' ? 'quantity-bar' : valueLabel === 'share' ? 'share-bar' : '';
      const labelMarkup = labelLines.map((line, index) => `<tspan x="${labelX}" dy="${index === 0 ? -((labelLines.length - 1) * 7) : 14}">${escapeHtml(line)}</tspan>`).join('');
      return `<text class="chart-label" x="${labelX}" y="${y + 5}" text-anchor="end"><title>${escapeHtml(chartLabelText(product.name))}</title>${labelMarkup}</text><rect class="bar ${barClass}" x="${barX}" y="${y - 13}" width="${barWidth}" height="26" rx="5"/><text class="chart-value" x="${Math.min(chartWidth - 8, barX + barWidth + 8)}" y="${y + 5}">${escapeHtml(valueText)}</text>`;
    }).join('');
    const height = rowTop + 8;
    element.setAttribute('viewBox', `0 0 ${chartWidth} ${height}`);
    element.innerHTML = `<line class="grid-line" x1="${barX}" y1="16" x2="${barX}" y2="${height - 12}"/>${rows}`;
  }

  function renderChart(products) {
    renderHorizontalChart(elements.salesChart, products, 'sales', 'sales');
    renderHorizontalChart(elements.quantityChart, products, 'quantity', 'quantity');
    renderShareChart(elements.shareChart, products);
    renderShareChart(elements.quantityShareChart, products, 'quantity');
  }

  function renderShareChart(element, products, metric = 'sales') {
    const isQuantity = metric === 'quantity';
    const valueKey = isQuantity ? 'quantity' : 'sales';
    const chartTitle = isQuantity ? '販売数構成比' : '売上構成比';
    const totalLabel = isQuantity ? '販売数合計' : '売上合計';
    const formatTotal = isQuantity ? (value) => `${value.toLocaleString('ja-JP')}個` : formatYen;
    const soldProducts = products
      .filter((product) => Number(product.quantity) > 0)
      .sort((a, b) => Number(b.sales) - Number(a.sales) || a.name.localeCompare(b.name, 'ja'));
    const totalValue = soldProducts.reduce((total, product) => total + Math.max(0, Number(product[valueKey]) || 0), 0);
    const formatSharePercent = (share) => share === 0 ? '0' : share < 0.005 ? '<0.01' : share >= 10 ? share.toFixed(0) : share >= 1 ? share.toFixed(1) : share.toFixed(2);
    if (!soldProducts.length) {
      element.setAttribute('viewBox', '0 0 760 360');
      element.innerHTML = '<text x="380" y="180" text-anchor="middle">確定した会計がここに表示されます</text>';
      return;
    }
    const colors = ['#0072b2', '#d55e00', '#009e73', '#a64d79', '#5a4e9c', '#b04a4a', '#4f6d7a', '#8a6500'];
    const centerX = 190;
    const radius = 132;
    const innerRadius = 76;
    let angle = -90;
    // 商品色は売上順で共通化し、個数順に並べ替えても同じ商品は同じ色にする。
    const chartProducts = soldProducts.map((product, index) => ({ ...product, color: colors[index % colors.length] }));
    if (isQuantity) chartProducts.sort((a, b) => Number(b.quantity) - Number(a.quantity) || Number(b.sales) - Number(a.sales) || a.name.localeCompare(b.name, 'ja'));
    const slices = chartProducts.map((product) => {
      const sales = Math.max(0, Number(product.sales) || 0);
      const value = Math.max(0, Number(product[valueKey]) || 0);
      const share = totalValue > 0 ? value / totalValue : 0;
      const nextAngle = angle + share * 360;
      const result = {
        ...product,
        sales,
        share: share * 100,
        color: product.color,
        value,
        startAngle: angle,
        midAngle: angle + (nextAngle - angle) / 2,
        endAngle: nextAngle,
      };
      angle = nextAngle;
      return result;
    });
    let legendTop = 15;
    const legend = slices.map((slice) => {
      const labelLines = chartLabelLines(slice.name, 16);
      const rowHeight = Math.max(38, labelLines.length * 14 + 10);
      const y = legendTop + rowHeight / 2;
      legendTop += rowHeight;
      const labelMarkup = labelLines.map((line, index) => `<tspan x="424" dy="${index === 0 ? -((labelLines.length - 1) * 7) : 14}">${escapeHtml(line)}</tspan>`).join('');
      const shareText = `${formatSharePercent(slice.share)}%`;
      const quantityText = Math.max(0, Number(slice.quantity) || 0).toLocaleString('ja-JP');
      const metricText = `${shareText} · ${quantityText}個`;
      return `<rect class="share-legend-swatch" x="400" y="${y - 7}" width="14" height="14" rx="3" fill="${slice.color}"/><text class="share-legend-label" x="424" y="${y + 4}"><title>${escapeHtml(chartLabelText(slice.name))}</title>${labelMarkup}</text><text class="share-legend-value" x="744" y="${y + 4}" text-anchor="end"><title>${escapeHtml(`${chartTitle} ${shareText}、販売数 ${quantityText}個`)}</title>${escapeHtml(metricText)}</text>`;
    }).join('');
    const positiveSlices = slices.filter((slice) => slice.value > 0);
    const calloutCounts = { left: 0, right: 0 };
    positiveSlices.filter((slice) => slice.share < 8).forEach((slice) => {
      const side = Math.cos(slice.midAngle * Math.PI / 180) >= 0 ? 'right' : 'left';
      calloutCounts[side] += 1;
    });
    const maxSideCallouts = Math.max(calloutCounts.left, calloutCounts.right);
    const chartHeight = Math.max(360, legendTop + 8, maxSideCallouts ? 44 + maxSideCallouts * 28 : 0);
    const centerY = chartHeight / 2;
    const sliceMarkup = positiveSlices.length === 1
      ? `<circle class="share-slice" cx="${centerX}" cy="${centerY}" r="${radius}" fill="${positiveSlices[0].color}"/>`
      : positiveSlices.map((slice) => {
        const start = polarPoint(centerX, centerY, radius, slice.startAngle);
        const end = polarPoint(centerX, centerY, radius, slice.endAngle);
        const innerEnd = polarPoint(centerX, centerY, innerRadius, slice.endAngle);
        const innerStart = polarPoint(centerX, centerY, innerRadius, slice.startAngle);
        const largeArc = slice.endAngle - slice.startAngle > 180 ? 1 : 0;
        const path = `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} L ${innerEnd.x} ${innerEnd.y} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y} Z`;
        return `<path class="share-slice" d="${path}" fill="${slice.color}"/>`;
      }).join('');
    const sliceLabelMarkup = positiveSlices
      .filter((slice) => slice.share >= 8)
      .map((slice) => {
        const point = polarPoint(centerX, centerY, (radius + innerRadius) / 2, slice.midAngle);
        const x = point.x;
        const y = Number(point.y) - 2;
        const shareText = `${formatSharePercent(slice.share)}%`;
        const quantityText = Math.max(0, Number(slice.quantity) || 0).toLocaleString('ja-JP');
        return `<text class="share-slice-label" x="${x}" y="${y}" text-anchor="middle"><title>${escapeHtml(`${chartLabelText(slice.name)}: ${shareText}・${quantityText}個`)}</title><tspan x="${x}">${escapeHtml(shareText)}</tspan><tspan x="${x}" dy="12">${quantityText}個</tspan></text>`;
      }).join('');
    const calloutsBySide = { left: [], right: [] };
    positiveSlices.filter((slice) => slice.share < 8).forEach((slice) => {
      const side = Math.cos(slice.midAngle * Math.PI / 180) >= 0 ? 'right' : 'left';
      calloutsBySide[side].push({
        slice,
        desiredY: centerY + (radius + 18) * Math.sin(slice.midAngle * Math.PI / 180),
      });
    });
    const calloutPositions = [];
    Object.entries(calloutsBySide).forEach(([side, callouts]) => {
      const minY = 22;
      const maxY = chartHeight - 22;
      const gap = 28;
      const sorted = [...callouts].sort((left, right) => left.desiredY - right.desiredY);
      const positions = sorted.map((callout) => Math.max(minY, Math.min(maxY, callout.desiredY)));
      for (let index = 1; index < positions.length; index += 1) {
        positions[index] = Math.max(positions[index], positions[index - 1] + gap);
      }
      if (positions.length && positions[positions.length - 1] > maxY) {
        const shift = positions[positions.length - 1] - maxY;
        for (let index = 0; index < positions.length; index += 1) positions[index] -= shift;
      }
      for (let index = positions.length - 2; index >= 0; index -= 1) {
        positions[index] = Math.min(positions[index], positions[index + 1] - gap);
      }
      if (positions.length && positions[0] < minY) {
        const shift = minY - positions[0];
        for (let index = 0; index < positions.length; index += 1) positions[index] += shift;
      }
      sorted.forEach((callout, index) => calloutPositions.push({ ...callout, side, y: positions[index] }));
    });
    const calloutMarkup = calloutPositions.map(({ slice, side, y }) => {
      const start = polarPoint(centerX, centerY, radius + 2, slice.midAngle);
      const outside = polarPoint(centerX, centerY, radius + 14, slice.midAngle);
      const railX = side === 'left' ? 54 : 326;
      const lineEndX = side === 'left' ? 54 : 326;
      const labelX = side === 'left' ? 49 : 331;
      const anchor = side === 'left' ? 'end' : 'start';
      const shareText = `${formatSharePercent(slice.share)}%`;
      const quantityText = Math.max(0, Number(slice.quantity) || 0).toLocaleString('ja-JP');
      const path = `M ${start.x} ${start.y} L ${outside.x} ${outside.y} L ${railX} ${outside.y} L ${railX} ${y} L ${lineEndX} ${y}`;
      return `<path class="share-leader-line" d="${path}" stroke="${slice.color}"/><text class="share-outside-label" x="${labelX}" y="${y - 5}" text-anchor="${anchor}"><title>${escapeHtml(`${chartLabelText(slice.name)}: ${shareText}・${quantityText}個`)}</title><tspan x="${labelX}">${escapeHtml(shareText)}</tspan><tspan x="${labelX}" dy="12">${quantityText}個</tspan></text>`;
    }).join('');
    element.setAttribute('viewBox', `0 0 760 ${chartHeight}`);
    element.innerHTML = `${sliceMarkup}<circle class="share-hole" cx="${centerX}" cy="${centerY}" r="${innerRadius}"/>${sliceLabelMarkup}${calloutMarkup}<text class="share-total-label" x="${centerX}" y="${centerY - 6}" text-anchor="middle">${totalLabel}</text><text class="share-total-value" x="${centerX}" y="${centerY + 18}" text-anchor="middle">${escapeHtml(formatTotal(totalValue))}</text>${legend}`;
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
      const searchable = [...(transaction.items || []).flatMap((item) => [item.name, item.category]), transaction.note || ''].join(' ').toLocaleLowerCase('ja');
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
      const note = transaction.note ? `<div class="history-note"><strong>メモ</strong><span>${escapeHtml(transaction.note)}</span></div>` : '';
      return `<article class="history-card" role="listitem">
        <div class="history-card-header">
          <div class="history-time"><span>${escapeHtml(formatDate(transaction.recordedAt))}</span><small>${transaction.itemCount}点</small></div>
          <div class="history-card-actions"><button type="button" data-history-action="edit" data-transaction-id="${escapeHtml(transaction.id)}">変更</button><button type="button" data-history-action="delete" data-transaction-id="${escapeHtml(transaction.id)}">削除</button></div>
        </div>
        <div class="history-card-body">
          <div class="history-items">${detail || '<span class="muted-label">明細なし</span>'}${note}</div>
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
    elements.dailyCloseShare.disabled = report.transactionCount === 0;
  }

  function selectedDailyCloseReport() {
    const report = Core.dailyCloseReport(state.transactions, elements.dailyCloseDate.value);
    if (!report.transactionCount) {
      setStatus('選択した日に確定済みの会計はありません。', 'error');
      return null;
    }
    return report;
  }

  function exportDailyClose() {
    const report = selectedDailyCloseReport();
    if (!report) return;
    downloadCsvFile(`shirayuri-daily-close-${report.date}.csv`, report.csv);
    setStatus(`${report.date}の日次締めレポートを保存しました。`, 'success');
  }

  function shareDailyClose() {
    const report = selectedDailyCloseReport();
    if (!report) return;
    return shareCsvFile(`shirayuri-daily-close-${report.date}.csv`, report.csv, `${report.date}の日次締めレポート`);
  }

  function activateTab(tabName, swipeEnterFrom = '') {
    // 商品タブ全体を動かすとスマホで固定表示される会計パネルまで動くため、内側だけをアニメーションする。
    const swipeAnimationClasses = ['is-swipe-enter-from-left', 'is-swipe-enter-from-right'];
    if (tabName !== 'products') setMobileCheckoutOpen(false, { restoreFocus: false });
    elements.pageShell.dataset.activeTab = tabName;
    document.querySelectorAll('[data-tab-target]').forEach((tab) => {
      const active = tab.dataset.tabTarget === tabName;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('[data-tab-panel]').forEach((panel) => {
      const active = panel.dataset.tabPanel === tabName;
      const animationTarget = panel.dataset.tabPanel === 'products'
        ? panel.querySelector('.catalog-panel')
        : panel.firstElementChild;
      animationTarget?.classList.remove(...swipeAnimationClasses);
      panel.classList.toggle('is-hidden', !active);
      if (active && animationTarget && ['left', 'right'].includes(swipeEnterFrom)) {
        void animationTarget.offsetWidth;
        animationTarget.classList.add(`is-swipe-enter-from-${swipeEnterFrom}`);
      }
    });
    if (tabName === 'products' && state.fitCheckoutHeightAfterClear) {
      root.requestAnimationFrame(() => {
        if (fitCheckoutHeightToContent()) state.fitCheckoutHeightAfterClear = false;
      });
    }
  }

  function setupTabSwipe(tabbedResults) {
    if (!tabbedResults) return;
    // プルダウンやカテゴリフィルター上でも横スワイプを受け付け、縦スクロールは従来どおり操作できるようにする。
    // 商品タブはカタログだけを動かし、画面下部に固定された会計パネルはその場に残す。
    const tabs = ['products', 'chart', 'history'];
    const ignoredTargets = 'textarea, [contenteditable="true"], .tab-list, #checkout-panel, .chart-wrap, .table-scroll, .weekday-heatmap-scroll, .hourly-table-scroll, .hourly-category-table-scroll, .hourly-product-table-scroll';
    let touchStart = null;
    let returnAnimationTarget = null;
    let returnAnimationTimer = null;
    let returnAnimationCleanup = null;

    const getSwipeTarget = (tabName) => {
      const panel = tabbedResults.querySelector(`[data-tab-panel="${tabName}"]`);
      return tabName === 'products' ? panel?.querySelector('.catalog-panel') : panel?.firstElementChild;
    };

    const cancelReturnAnimation = () => {
      if (returnAnimationTimer != null) root.clearTimeout(returnAnimationTimer);
      if (returnAnimationTarget && returnAnimationCleanup) {
        returnAnimationTarget.removeEventListener('transitionend', returnAnimationCleanup);
        returnAnimationTarget.classList.remove('is-swipe-settling');
      }
      returnAnimationTarget = null;
      returnAnimationTimer = null;
      returnAnimationCleanup = null;
    };

    const resetSwipeTarget = (target, animateReturn) => {
      if (!target) return;
      target.classList.remove('is-swipe-dragging');
      if (!animateReturn) {
        if (returnAnimationTarget === target) cancelReturnAnimation();
        target.classList.remove('is-swipe-settling');
        target.style.removeProperty('transform');
        target.style.removeProperty('opacity');
        return;
      }

      cancelReturnAnimation();
      target.classList.add('is-swipe-settling');
      target.style.removeProperty('transform');
      target.style.removeProperty('opacity');
      returnAnimationTarget = target;
      returnAnimationCleanup = (event) => {
        if (event && (event.target !== target || event.propertyName !== 'transform')) return;
        cancelReturnAnimation();
      };
      target.addEventListener('transitionend', returnAnimationCleanup);
      returnAnimationTimer = root.setTimeout(() => returnAnimationCleanup(), 220);
    };

    tabbedResults.addEventListener('animationend', (event) => {
      if (!event.target.matches?.('.is-swipe-enter-from-left, .is-swipe-enter-from-right')) return;
      event.target.classList.remove('is-swipe-enter-from-left', 'is-swipe-enter-from-right');
    });

    tabbedResults.addEventListener('touchstart', (event) => {
      if (event.touches.length !== 1) {
        touchStart = null;
        return;
      }
      if (event.target.closest?.(ignoredTargets)) {
        touchStart = null;
        return;
      }
      const touch = event.touches[0];
      cancelReturnAnimation();
      touchStart = { x: touch.clientX, y: touch.clientY, at: Date.now(), horizontal: false, visualTarget: null };
    }, { passive: true, capture: true });

    tabbedResults.addEventListener('touchmove', (event) => {
      if (!touchStart || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const deltaX = touch.clientX - touchStart.x;
      const deltaY = touch.clientY - touchStart.y;

      if (!touchStart.horizontal) {
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 10) return;
        if (Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) {
          if (Math.abs(deltaY) >= 24) touchStart = null;
          return;
        }
        if (Math.abs(deltaX) < 10) return;

        touchStart.horizontal = true;
        const activeTab = document.querySelector('.tab-button.is-active')?.dataset.tabTarget;
        const activeIndex = tabs.indexOf(activeTab);
        const nextIndex = activeIndex + (deltaX < 0 ? 1 : -1);
        touchStart.visualTarget = activeIndex >= 0 && tabs[nextIndex] ? getSwipeTarget(activeTab) : null;
      }

      if (Math.abs(deltaX) < 18) return;
      if (event.cancelable) event.preventDefault();
      if (!touchStart.visualTarget) return;
      const width = tabbedResults.clientWidth || root.innerWidth || 320;
      const offset = Math.sign(deltaX) * Math.min(Math.abs(deltaX) * .88, width * .52);
      touchStart.visualTarget.classList.remove('is-swipe-settling');
      touchStart.visualTarget.classList.add('is-swipe-dragging');
      touchStart.visualTarget.style.transform = `translate3d(${offset}px, 0, 0)`;
      touchStart.visualTarget.style.opacity = String(1 - Math.min(Math.abs(offset) / width * .22, .22));
    }, { passive: false, capture: true });

    tabbedResults.addEventListener('touchend', (event) => {
      if (!touchStart || event.changedTouches.length !== 1) {
        touchStart = null;
        return;
      }
      const start = touchStart;
      touchStart = null;
      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      const activeTab = document.querySelector('.tab-button.is-active')?.dataset.tabTarget;
      const activeIndex = tabs.indexOf(activeTab);
      const nextIndex = activeIndex + (deltaX < 0 ? 1 : -1);
      const shouldNavigate = Date.now() - start.at <= 1000
        && Math.abs(deltaX) >= 36
        && Math.abs(deltaX) >= Math.abs(deltaY) * 1.15
        && activeIndex >= 0
        && Boolean(tabs[nextIndex]);

      if (shouldNavigate) {
        if (event.cancelable) event.preventDefault();
        resetSwipeTarget(start.visualTarget, false);
        activateTab(tabs[nextIndex], deltaX < 0 ? 'right' : 'left');
      } else {
        resetSwipeTarget(start.visualTarget, true);
      }
    }, { passive: false, capture: true });

    tabbedResults.addEventListener('touchcancel', () => {
      resetSwipeTarget(touchStart?.visualTarget, true);
      touchStart = null;
    }, { passive: true, capture: true });
  }

  function setAdminMode(isOpen) {
    if (isOpen) setMobileCheckoutOpen(false, { restoreFocus: false });
    elements.adminPanel.classList.toggle('is-hidden', !isOpen);
    elements.pageShell.classList.toggle('admin-mode', isOpen);
    elements.adminToggle.setAttribute('aria-expanded', String(isOpen));
  }

  function openAdminAccess() {
    if (!D1Client || !D1Client.isConfigured() || D1Client.isAdminAuthenticated()) {
      setAdminMode(true);
      return;
    }
    elements.adminPassword.value = '';
    elements.adminPasswordError.textContent = '';
    elements.adminPasswordDialog.showModal();
    elements.adminPassword.focus();
  }

  function restoreAdminPasswordGate(request) {
    if (request?.wasSharedGateLocked) root.document.documentElement.dataset.sharedGate = 'locked';
  }

  function requestAdminPassword() {
    if (D1Client && D1Client.isAdminAuthenticated()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const wasSharedGateLocked = root.document.documentElement.dataset.sharedGate === 'locked';
      state.adminPasswordRequest = { resolve, reject, wasSharedGateLocked };
      if (wasSharedGateLocked) delete root.document.documentElement.dataset.sharedGate;
      elements.adminPassword.value = '';
      elements.adminPasswordError.textContent = '';
      elements.adminPasswordDialog.showModal();
      elements.adminPassword.focus();
    });
  }

  function finishAdminPasswordRequest() {
    const request = state.adminPasswordRequest;
    if (!request) return false;
    state.adminPasswordRequest = null;
    restoreAdminPasswordGate(request);
    request.resolve();
    return true;
  }

  function cancelAdminPasswordRequest(message = '管理者認証をキャンセルしました。') {
    const request = state.adminPasswordRequest;
    if (!request) return false;
    state.adminPasswordRequest = null;
    restoreAdminPasswordGate(request);
    request.reject(new Error(message));
    return true;
  }

  async function connectAdmin(password) {
    if (!password) {
      elements.adminPasswordError.textContent = '管理者パスワードを入力してください。';
      elements.adminPassword.focus();
      return;
    }
    elements.adminPasswordSubmit.disabled = true;
    elements.adminPasswordError.textContent = '';
    try {
      await D1Client.adminLogin(password);
      elements.adminPasswordDialog.close();
      if (finishAdminPasswordRequest()) return;
      setAdminMode(true);
      setStatus('管理者として認証しました。商品・在庫・設定を変更できます。', 'success');
    } catch (error) {
      elements.adminPasswordError.textContent = error.message || '管理者認証に失敗しました。';
      elements.adminPassword.focus();
    } finally {
      elements.adminPasswordSubmit.disabled = false;
    }
  }

  function renderAll() {
    renderCatalog();
    renderProductManagement();
    renderSettings();
    renderCart();
    renderDashboard();
    renderHistory();
    if (state.fitCheckoutHeightAfterClear && fitCheckoutHeightToContent()) state.fitCheckoutHeightAfterClear = false;
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
    if (state.saleSaving) return;
    const transaction = state.transactions.find((item) => item.id === transactionId);
    if (!transaction) return;
    cancelChangeConfirmation();
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
    setSaleNote(transaction.note || '', Boolean(transaction.note));
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
    // 続けて確定した場合にも5秒の表示時間をリセットし、CSSのフェードを先頭から再生する。
    if (state.undoTimer) root.clearTimeout(state.undoTimer);
    state.undoTransactionId = transactionId;
    elements.undoLastSale.classList.remove('is-hidden');
    elements.undoLastSale.classList.remove('is-fading');
    void elements.undoLastSale.offsetWidth;
    elements.undoLastSale.classList.add('is-fading');
    state.undoTimer = root.setTimeout(clearUndoSale, 5000);
  }

  function undoLastSale() {
    const transactionId = state.undoTransactionId;
    if (!transactionId) return;
    const transaction = state.transactions.find((item) => item.id === transactionId);
    if (!transaction) {
      clearUndoSale();
      return;
    }
    const confirmation = `直前の会計（${formatDate(transaction.recordedAt)}・${formatYen(transaction.total)}）を取り消しますか？\n販売履歴から削除され、在庫数も戻ります。`;
    if (!root.confirm(confirmation)) return;
    deleteTransaction(transactionId, { confirm: false, undo: true });
  }

  async function deleteTransaction(transactionId, options = {}) {
    if (options.confirm !== false && !root.confirm('この会計を削除しますか？')) return;
    try {
      const previousTransaction = state.transactions.find((item) => item.id === transactionId);
      if (!previousTransaction) return;
      const nextTransactions = Core.removeTransaction(state.transactions, transactionId);
      const nextInventory = Core.applyInventoryTransactionChange(state.inventory, previousTransaction, null, state.products);
      await persistSharedSnapshot({ transactions: nextTransactions, inventory: nextInventory },
        () => Storage.saveSalesAndInventory(storage, nextTransactions, nextInventory));
      state.transactions = nextTransactions;
      state.inventory = nextInventory;
      if (state.undoTransactionId === transactionId) clearUndoSale();
      if (state.editingTransactionId === transactionId) clearCartState();
      renderAll();
      setStatus(options.undo ? '直前の会計を取り消しました。在庫数も戻しました。' : '会計を削除しました。在庫数も戻しました。', 'success');
    } catch (error) {
      setStatus(persistenceErrorMessage(error, '会計を削除できませんでした。現在の履歴を維持します。'), 'error');
    }
  }

  function handleHistoryAction(event) {
    const target = event.target.closest('[data-history-action]');
    if (!target) return;
    const transactionId = target.dataset.transactionId;
    if (target.dataset.historyAction === 'edit') editTransaction(transactionId);
    if (target.dataset.historyAction === 'delete') void deleteTransaction(transactionId);
  }

  function handleProductManagementAction(event) {
    const target = event.target.closest('[data-management-action]');
    if (!target) return;
    const productId = target.dataset.productId;
    if (target.dataset.managementAction === 'toggle') {
      const expanded = target.getAttribute('aria-expanded') !== 'true';
      if (expanded) state.expandedManagedProducts.add(productId);
      else state.expandedManagedProducts.delete(productId);
      target.setAttribute('aria-expanded', String(expanded));
      target.closest('.managed-product-item').querySelector('.managed-product-row').classList.toggle('is-hidden', !expanded);
      return;
    }
    if (target.dataset.managementAction === 'move-up') void moveProduct(productId, -1);
    if (target.dataset.managementAction === 'move-down') void moveProduct(productId, 1);
    if (target.dataset.managementAction === 'save') void saveProductDetails(productId, target);
    if (target.dataset.managementAction === 'adjust-stock') void adjustProductStock(productId, target);
    if (target.dataset.managementAction === 'copy') prepareProductCopy(productId, target.closest('.managed-product-row'));
    if (target.dataset.managementAction === 'icon') {
      elements.iconFile.dataset.targetProductId = productId;
      elements.iconFile.click();
    }
    if (target.dataset.managementAction === 'delete') void deleteProduct(productId);
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

  function handleCategoryOrderAction(event) {
    const button = event.target.closest('[data-category-order]');
    if (button) void moveCategory(button.dataset.category, Number(button.dataset.categoryOrder));
  }

  function updateProductOrderActions() {
    const categories = getProductCategories();
    const positions = new Map();
    categories.forEach((category) => {
      const products = state.products.filter((product) => product.category === category);
      products.forEach((product, index) => positions.set(product.id, { index, length: products.length }));
    });
    elements.productManagementList.querySelectorAll('.managed-product-order button').forEach((button) => {
      const position = positions.get(button.dataset.productId);
      const direction = button.dataset.managementAction === 'move-up' ? -1 : 1;
      button.disabled = state.productOrderSaving || !position || position.index + direction < 0 || position.index + direction >= position.length;
    });
    elements.categoryOrderList.querySelectorAll('[data-category-order]').forEach((button) => {
      const index = categories.indexOf(button.dataset.category);
      const destination = index + Number(button.dataset.categoryOrder);
      button.disabled = state.productOrderSaving || index < 0 || destination < 0 || destination >= categories.length;
    });
  }

  async function saveProductOrder(nextProducts, message) {
    if (state.productOrderSaving) return false;
    if (hasManagedProductChanges()) {
      setStatus('入力中の商品情報・在庫残数を反映してから、並び順を変更してください。', 'error');
      return false;
    }
    const scrollTop = elements.productManagementList.scrollTop;
    state.productOrderSaving = true;
    elements.categoryOrderList.inert = true;
    elements.productManagementList.inert = true;
    elements.productManagementList.setAttribute('aria-busy', 'true');
    updateProductOrderActions();
    try {
      await persistSharedSnapshot({ products: nextProducts }, () => Storage.saveProducts(storage, nextProducts));
      state.products = nextProducts;
      renderCatalog();
      renderProductManagement();
      elements.productManagementList.scrollTop = scrollTop;
      setStatus(message, 'success');
      return true;
    } catch (error) {
      setStatus(error.message || '並び順を保存できませんでした。もう一度お試しください。', 'error');
      return false;
    } finally {
      state.productOrderSaving = false;
      elements.categoryOrderList.inert = false;
      elements.productManagementList.inert = false;
      elements.productManagementList.removeAttribute('aria-busy');
      updateProductOrderActions();
    }
  }

  async function moveCategory(category, direction) {
    const categories = getProductCategories();
    const index = categories.indexOf(category);
    const destination = index + direction;
    if (index < 0 || ![-1, 1].includes(direction) || destination < 0 || destination >= categories.length) return;
    [categories[index], categories[destination]] = [categories[destination], categories[index]];
    const nextProducts = categories.flatMap((name) => state.products.filter((product) => product.category === name));
    if (!(await saveProductOrder(nextProducts, 'カテゴリの並び順を保存しました。'))) return;
    const buttons = [...elements.categoryOrderList.querySelectorAll('[data-category-order]')]
      .filter((button) => button.dataset.category === category);
    (buttons.find((button) => Number(button.dataset.categoryOrder) === direction && !button.disabled)
      || buttons.find((button) => !button.disabled))?.focus({ preventScroll: true });
  }

  async function moveProduct(productId, direction) {
    const product = state.products.find((candidate) => candidate.id === productId);
    if (!product || ![-1, 1].includes(direction)) return;
    const siblings = state.products.filter((candidate) => candidate.category === product.category);
    const index = siblings.findIndex((candidate) => candidate.id === productId);
    const destination = index + direction;
    if (destination < 0 || destination >= siblings.length) return;
    const nextProducts = state.products.slice();
    const from = nextProducts.indexOf(product);
    const to = nextProducts.indexOf(siblings[destination]);
    [nextProducts[from], nextProducts[to]] = [nextProducts[to], nextProducts[from]];
    if (!(await saveProductOrder(nextProducts, '商品の並び順を保存しました。'))) return;
    const row = [...elements.productManagementList.querySelectorAll('[data-managed-product-id]')]
      .find((candidate) => candidate.dataset.managedProductId === productId);
    if (row) {
      const action = direction < 0 ? 'move-up' : 'move-down';
      const preferred = row.querySelector(`[data-management-action="${action}"]`);
      (preferred && !preferred.disabled ? preferred : row.querySelector('.managed-product-order button:not(:disabled)'))?.focus({ preventScroll: true });
      const rowRect = row.getBoundingClientRect();
      const listRect = elements.productManagementList.getBoundingClientRect();
      if (rowRect.top < listRect.top) elements.productManagementList.scrollTop += rowRect.top - listRect.top;
      else if (rowRect.bottom > listRect.bottom) elements.productManagementList.scrollTop += rowRect.bottom - listRect.bottom;
    }
  }

  function prepareProductCopy(productId, row) {
    const source = state.products.find((product) => product.id === productId);
    if (!source) {
      setStatus('コピー元の商品が見つかりません。', 'error');
      return;
    }
    if (getManagedProductDraft(row, productId)?.hasUncommittedChanges) {
      setStatus('コピー元の商品情報を先に反映してください。', 'error');
      return;
    }
    if (hasProductAddFormChanges() && !root.confirm('入力中の商品追加フォームをコピー内容で置き換えますか？')) return;
    const copyId = root.crypto && typeof root.crypto.randomUUID === 'function'
      ? root.crypto.randomUUID()
      : `copy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const copy = Core.makeProductCopy(source, state.products, copyId);
    state.pendingProductCopy = copy;
    elements.productAddCategory.value = copy.category;
    elements.productAddNewCategory.value = '';
    elements.productAddName.value = copy.name;
    elements.productAddPrice.value = String(copy.unitPrice);
    elements.productAddStockLimit.value = Number.isInteger(copy.stockLimit) ? String(copy.stockLimit) : '';
    elements.productCopyNote.classList.remove('is-hidden');
    renderProductAddCategories();
    let fold = elements.productAddForm.closest('details');
    while (fold) {
      fold.open = true;
      fold = fold.parentElement.closest('details');
    }
    elements.productAddForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    elements.productAddName.focus({ preventScroll: true });
    elements.productAddName.select();
    setStatus('コピー内容を追加フォームにセットしました。確認して「商品を追加」を押してください。', 'success');
  }

  function cancelProductCopy() {
    state.pendingProductCopy = null;
    elements.productAddForm.reset();
    elements.productCopyNote.classList.add('is-hidden');
    renderProductAddCategories();
    setStatus('商品のコピーを取り消しました。', 'success');
  }

  async function saveProductDetails(productId, actionTarget) {
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
      if (draft.startNewRow) nextProduct.startNewRow = true;
      else delete nextProduct.startNewRow;
      const nextProducts = state.products.map((candidate) => candidate.id === productId ? nextProduct : candidate);
      const nextInventory = updateInventoryForProductChange(state.inventory, draft.product, nextProduct);
      await persistSharedSnapshot({ products: nextProducts, inventory: nextInventory },
        () => Storage.saveProductsAndInventory(storage, nextProducts, nextInventory));
      state.products = nextProducts;
      state.inventory = nextInventory;
      if (state.cartProducts.has(productId)) state.cartProducts.set(productId, nextProduct);
      renderAll();
      setStatus(`${draft.name}の商品情報を反映しました。`, 'success');
    } catch (error) {
      setStatus(persistenceErrorMessage(error, '商品情報を反映できませんでした。現在の商品一覧を維持します。'), 'error');
    }
  }

  async function adjustProductStock(productId, actionTarget) {
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
      const nextInventory = Core.adjustInventory(state.inventory, productId, product.name, value);
      await persistSharedSnapshot({ inventory: nextInventory },
        () => Storage.saveInventory(storage, nextInventory));
      state.inventory = nextInventory;
      renderAll();
      setStatus(`${product.name}の在庫残数を${value}個に調整しました。`, 'success');
    } catch (error) {
      setStatus(persistenceErrorMessage(error, '在庫数を保存できませんでした。現在の在庫を維持します。'), 'error');
    }
  }

  async function resetInventoryPeriod() {
    if (state.editingTransactionId) {
      setStatus('会計の変更を保存または取り消してから、販売期間をリセットしてください。', 'error');
      return;
    }
    if (state.cart.size > 0) {
      setStatus('カートを空にしてから、販売期間をリセットしてください。', 'error');
      return;
    }
    if (!state.products.length) {
      setStatus('リセットする商品がありません。', 'error');
      return;
    }
    if (!root.confirm('販売済みを0に戻し、現在の残数を新しい販売期間の初期在庫にしますか？\n\n会計履歴は残ります。この操作は全端末の共有データに反映されます。')) return;
    try {
      const reset = Core.resetInventoryPeriod(state.products, state.inventory);
      await persistSharedSnapshot({ products: reset.products, inventory: reset.inventory },
        () => Storage.saveProductsAndInventory(storage, reset.products, reset.inventory));
      state.products = reset.products;
      state.inventory = reset.inventory;
      renderAll();
      setStatus('販売済みを0に戻し、新しい販売期間を開始しました。会計履歴は保持しています。', 'success');
    } catch (error) {
      setStatus(persistenceErrorMessage(error, '販売期間をリセットできませんでした。現在の在庫を維持します。'), 'error');
    }
  }

  async function addProduct(event) {
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
      if (state.pendingProductCopy) {
        product.id = state.pendingProductCopy.id;
        if (state.pendingProductCopy.icon) product.icon = state.pendingProductCopy.icon;
        if (state.pendingProductCopy.iconPath) product.iconPath = state.pendingProductCopy.iconPath;
        if (state.pendingProductCopy.startNewRow === true) product.startNewRow = true;
      }
      if (stockLimit.value !== null) product.stockLimit = stockLimit.value;
      if (state.products.some((candidate) => candidate.id === product.id || (candidate.category === product.category && candidate.name === product.name))) {
        setStatus('同じカテゴリと商品名の商品がすでにあります。', 'error');
        return;
      }
      const nextProducts = [...state.products, product];
      const nextInventory = addInventoryForProduct(state.inventory, product);
      await persistSharedSnapshot({ products: nextProducts, inventory: nextInventory },
        () => Storage.saveProductsAndInventory(storage, nextProducts, nextInventory));
      state.products = nextProducts;
      state.inventory = nextInventory;
      state.pendingProductCopy = null;
      elements.productCopyNote.classList.add('is-hidden');
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

  async function deleteProduct(productId) {
    const product = state.products.find((candidate) => candidate.id === productId);
    if (!product || !root.confirm(`${product.name}を商品一覧から削除しますか？\n過去の会計履歴は残ります。`)) return;
    try {
      const nextProducts = state.products.filter((candidate) => candidate.id !== productId);
      await persistSharedSnapshot({ products: nextProducts }, () => Storage.saveProducts(storage, nextProducts));
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
    reader.onload = async () => {
      try {
        const nextProducts = state.products.map((product) => product.id === productId ? { ...product, icon: String(reader.result) } : product);
        await persistSharedSnapshot({ products: nextProducts }, () => Storage.saveProducts(storage, nextProducts));
        state.products = nextProducts;
        renderAll();
        setStatus('商品アイコンを更新しました。', 'success');
      } catch (error) {
        setStatus(persistenceErrorMessage(error, '商品アイコンを保存できませんでした。'), 'error');
      }
    };
    reader.onerror = () => setStatus('画像を読み込めませんでした。', 'error');
    reader.readAsDataURL(file);
  }

  function renderSettings() {
    updateUnsupportedFeatureVisibility();
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

  function supportsDirectoryBackup() {
    return typeof root.showDirectoryPicker === 'function' && Boolean(root.indexedDB);
  }

  function setBackupReminderDue(due) {
    state.backupReminderDue = Boolean(due);
    if (!elements.backupReminder) return;
    elements.backupReminder.hidden = !state.backupReminderDue;
    elements.backupReminder.classList.toggle('is-hidden', !state.backupReminderDue);
  }

  function postponeBackupReminder() {
    const interval = Math.max(1, Number(state.settings.autoBackupIntervalMinutes) || 5) * 60 * 1000;
    state.backupReminderSnoozedUntil = Date.now() + interval;
    setBackupReminderDue(false);
  }

  function updateBackupStatus() {
    if (!elements.backupStatus) return;
    const last = formatBackupDate(state.settings.historyBackupLastAt || state.settings.autoBackupLastAt);
    const lastMessage = last ? `最終バックアップ：${last}` : 'バックアップ履歴はまだありません。';
    const interval = Number(state.settings.autoBackupIntervalMinutes) || 5;
    let mode;
    if (!supportsDirectoryBackup()) {
      mode = state.settings.autoBackupEnabled
        ? `${interval}分ごとに、画面を開いている間だけ保存をお知らせします。`
        : '定期バックアップの通知は停止中です。';
      mode += ' この端末ではフォルダへの自動保存はできません。「今すぐ保存・共有」からCSVを保存できます。共有メニューでは「ファイルに保存」を選んでください。';
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
    const error = state.lastBackupError ? ` 直近のバックアップ処理で問題がありました：${state.lastBackupError}` : '';
    elements.backupStatus.textContent = `${mode} ${lastMessage}${reminder}${error}`;
  }

  function updateUnsupportedFeatureVisibility() {
    const folderBackup = supportsDirectoryBackup();
    // フォルダ非対応でも通知と手動保存は使える。設定欄全体は隠さない。
    if (elements.backupOptions) elements.backupOptions.hidden = false;
    if (elements.backupFolder) {
      elements.backupFolder.hidden = !folderBackup;
      elements.backupFolder.classList.toggle('is-hidden', !folderBackup);
    }
    if (elements.backupOptionsTitle) elements.backupOptionsTitle.textContent = folderBackup ? '自動バックアップの設定' : '定期バックアップの通知';
    if (elements.backupEnabledLabel) elements.backupEnabledLabel.textContent = folderBackup ? '自動バックアップを有効にする' : '定期的にバックアップを通知する';
    if (elements.backupIntervalLabel) elements.backupIntervalLabel.textContent = folderBackup ? '自動バックアップの間隔' : '通知の間隔';
    if (elements.backupSettingsSave) elements.backupSettingsSave.textContent = folderBackup ? '自動バックアップ設定を保存' : '通知設定を保存';
    if (elements.backupNow) elements.backupNow.textContent = folderBackup ? '今すぐバックアップ' : '今すぐ保存・共有';
    if (elements.backupStatus) elements.backupStatus.hidden = false;
    if (folderBackup) setBackupReminderDue(false);
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
    state.backupReminderStartedAt = Date.now();
    state.backupReminderSnoozedUntil = 0;
    setBackupReminderDue(false);
    updateBackupStatus();
  }

  async function persistSettings(settings, successMessage, errorMessage, { shared = false } = {}) {
    try {
      if (shared) {
        await persistSharedSnapshot({ settings }, () => Storage.saveSettings(storage, settings));
      } else {
        Storage.saveSettings(storage, settings);
      }
      state.settings = settings;
      applyProductColumnWidth();
      startAutoBackupTimer();
      renderSettings();
      renderCatalog();
      renderCart();
      setStatus(successMessage, 'success');
    } catch (error) {
      setStatus(persistenceErrorMessage(error, errorMessage), 'error');
    }
  }

  async function saveSettings() {
    const settings = {
      ...state.settings,
      enabled: elements.settingsEnabled.checked,
      category: elements.settingsCategory.value.trim() || '古園服',
      siblings: Math.max(1, Math.floor(Number(elements.settingsSiblings.value) || 1)),
      perSibling: Math.max(0, Math.floor(Number(elements.settingsPerSibling.value) || 0)),
    };
    state.temporaryCheckoutSiblings = null;
    updateSettingsSaveState();
    await persistSettings(settings, '制限設定を反映しました。', '制限設定を反映できませんでした。', { shared: true });
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
    const label = supportsDirectoryBackup() ? '自動バックアップ設定' : '通知設定';
    void persistSettings(settings, `${label}を保存しました。`, `${label}を保存できませんでした。`);
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

  async function shareExportFile(filename, contents, type, label, { historyBackup = false } = {}) {
    let shareFiles = null;
    try {
      if (typeof root.File === 'function') {
        shareFiles = [new root.File([contents], filename, { type })];
      }
    } catch {
      shareFiles = null;
    }

    let canShareFile = false;
    try {
      canShareFile = Boolean(shareFiles
        && root.navigator
        && typeof root.navigator.share === 'function'
        && typeof root.navigator.canShare === 'function'
        && root.navigator.canShare({ files: shareFiles }));
    } catch {
      canShareFile = false;
    }

    const downloadFallback = () => {
      downloadTextFile(filename, contents, `${type};charset=utf-8`);
      if (historyBackup) recordHistoryBackupSuccess('manual');
    };
    if (!canShareFile) {
      downloadFallback();
      setStatus(`このブラウザーでは${label}のファイルを直接共有できないため、ダウンロードしました。`, 'success');
      return;
    }

    try {
      await root.navigator.share({ files: shareFiles });
      if (historyBackup) recordHistoryBackupSuccess('manual');
      setStatus(`${label}を共有先に渡しました。`, 'success');
    } catch (error) {
      if (error && error.name === 'AbortError') {
        setStatus('共有をキャンセルしました。ファイルはダウンロードされていません。');
        return;
      }
      downloadFallback();
      const errorName = error && error.name && error.name !== 'Error' ? `（${error.name}）` : '';
      setStatus(`共有を開始できなかったため${errorName}、${label}をダウンロードしました。`, 'error');
    }
  }

  function shareCsvFile(filename, csv, label, options) {
    return shareExportFile(filename, `\uFEFF${csv}`, 'text/csv', label, options);
  }

  function backupTimestamp() {
    const date = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  }

  function openBackupHandleDatabase() {
    // フォルダーハンドルは localStorage に入れられないため IndexedDB に保存する。
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
    // ブラウザは保存済みハンドルの書き込み権限を後から失効させることがある。
    if (!handle) return false;
    if (typeof handle.queryPermission !== 'function') return true;
    return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted';
  }

  async function writeBackupCsv(csv) {
    // close() で書き込みを確定し、失敗時は abort() して途中までのCSVを残さない。
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
    // 履歴消去前に現在のCSVを別名で複製する。複製失敗時は呼び出し元が消去を中止する。
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
    if (!supportsDirectoryBackup()) return backupNow();
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
    if (!supportsDirectoryBackup()) {
      if (state.autoBackupInProgress) return;
      state.autoBackupInProgress = true;
      try {
        // shareCsvは最初のawait前に呼び、タップ直後の共有権限を維持する。
        return await shareCsv();
      } finally {
        state.autoBackupInProgress = false;
      }
    }
    if (!state.backupDirectoryHandle) {
      await selectBackupDirectory({ writeImmediately: true });
      return;
    }
    await exportBackupFiles();
  }

  async function restoreBackupDirectory() {
    if (!supportsDirectoryBackup()) return;
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
    if (!supportsDirectoryBackup()) {
      // iPhone等ではタイマーから共有画面を開かず、ユーザーのタップを待つ。
      if (root.document && root.document.visibilityState === 'hidden') return;
      const interval = Math.max(1, Number(state.settings.autoBackupIntervalMinutes) || 5) * 60 * 1000;
      const savedAt = Date.parse(state.settings.historyBackupLastAt || state.settings.autoBackupLastAt || '');
      const baseline = Math.max(Number.isFinite(savedAt) ? savedAt : 0, state.backupReminderStartedAt);
      const dueAt = Math.max(baseline + interval, state.backupReminderSnoozedUntil);
      setBackupReminderDue(state.transactions.length > 0 && Date.now() >= dueAt);
      updateBackupStatus();
      return;
    }
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
      state.backupReminderStartedAt = Date.now();
      state.backupReminderSnoozedUntil = 0;
      setBackupReminderDue(false);
      updateBackupStatus();
      return;
    }
    state.autoBackupTimer = root.setInterval(maybeRunAutoBackup, 60 * 1000);
    void maybeRunAutoBackup();
  }

  function getSaleDraft() {
    if (state.editingTransactionId && !state.transactions.some((transaction) => transaction.id === state.editingTransactionId)) {
      throw new Error('編集中の会計が見つかりません。履歴を確認してください。');
    }
    const lines = getCartLines();
    const cart = Core.calculateCart(lines);
    if (!cart.lineItems.length) throw new Error('商品を選んでください。');
    if (String(state.received).trim() === '') throw new Error('お預かり金額を入力してください。');
    const limit = Core.calculatePurchaseLimit(lines, getCheckoutLimitSettings());
    if (limit.exceeded) throw new Error(`${limit.category}は${limit.limit}点までです`);
    const stockError = getCartStockError(lines);
    if (stockError) throw new Error(stockError.message);
    // buildTransactionと同じ検証を、確認画面を開く前にも行う。
    const transaction = Core.buildTransaction({ id: 'preview', lines, received: Number(state.received), note: state.saleNote });
    const signature = JSON.stringify({ items: transaction.items, received: transaction.received, note: transaction.note || '', editingId: state.editingTransactionId });
    return { lines, ...transaction, signature };
  }

  function cancelChangeConfirmation() {
    state.pendingChangeConfirmation = null;
    if (elements.changeConfirmationDialog && elements.changeConfirmationDialog.open) elements.changeConfirmationDialog.close();
  }

  function showChangeConfirmation(draft, changed = false) {
    state.pendingChangeConfirmation = draft.signature;
    elements.changeConfirmationAmount.textContent = formatYen(draft.change);
    elements.changeConfirmationTotal.textContent = formatYen(draft.total);
    elements.changeConfirmationReceived.textContent = formatYen(draft.received);
    elements.changeConfirmationMessage.textContent = changed
      ? '会計内容が変わりました。金額をもう一度確認してください。'
      : '表示されたお釣りを確認してから、会計を確定してください。';
    if (typeof elements.changeConfirmationDialog.showModal !== 'function') {
      if (root.confirm(`お釣り ${formatYen(draft.change)}\n合計 ${formatYen(draft.total)} ／ お預かり ${formatYen(draft.received)}\n\nお釣りを確認して会計を確定しますか？`)) return confirmSale(draft.signature);
      state.pendingChangeConfirmation = null;
      return;
    }
    if (!elements.changeConfirmationDialog.open) elements.changeConfirmationDialog.showModal();
    // 開いた直後のEnterが確定ボタンへ届かないよう、金額へフォーカスする。
    elements.changeConfirmationAmount.focus();
  }

  async function requestConfirmSale() {
    if (state.saleSaving || elements.changeConfirmationDialog.open) return;
    try {
      const draft = getSaleDraft();
      if (!state.editingTransactionId && draft.change > 0) return await showChangeConfirmation(draft);
      return await confirmSale();
    } catch (error) {
      setStatus(error.message || '会計内容を確認してください。', 'error');
    }
  }

  function setSaleSaving(saving) {
    state.saleSaving = saving;
    elements.pageShell.inert = saving;
    elements.adminToggle.disabled = saving;
    elements.sharedLogout.disabled = saving;
    elements.checkoutPanel.setAttribute('aria-busy', String(saving));
    elements.changeConfirmationConfirm.disabled = saving;
    elements.changeConfirmationCancel.disabled = saving;
    elements.changeConfirmationConfirm.textContent = saving ? '保存中…' : 'お釣りを確認して確定';
    renderCart();
  }

  async function confirmSale(confirmedSignature = null) {
    if (state.saleSaving) return;
    // 履歴と在庫の次状態を両方保存してから画面上の state を更新し、保存失敗時の表示を食い違わせない。
    try {
      const draft = getSaleDraft();
      if (!state.editingTransactionId && (draft.change > 0 || confirmedSignature !== null) && confirmedSignature !== draft.signature) {
        return await showChangeConfirmation(draft, confirmedSignature !== null);
      }
      const existing = state.transactions.find((transaction) => transaction.id === state.editingTransactionId);
      const transaction = Core.buildTransaction({
        id: existing ? existing.id : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        recordedAt: existing ? existing.recordedAt : new Date().toISOString(),
        lines: draft.lines,
        received: draft.received,
        note: state.saleNote,
      });
      const nextTransactions = existing ? Core.upsertTransaction(state.transactions, transaction) : [transaction, ...state.transactions];
      const nextInventory = Core.applyInventoryTransactionChange(state.inventory, existing || null, transaction, state.products);
      setSaleSaving(true);
      await persistSharedSnapshot({ transactions: nextTransactions, inventory: nextInventory },
        () => Storage.saveSalesAndInventory(storage, nextTransactions, nextInventory));
      state.transactions = nextTransactions;
      state.inventory = nextInventory;
      // Persist successfully before dismissing the mobile checkout; keep it open when validation or storage fails.
      setMobileCheckoutOpen(false, { restoreFocus: false });
      clearCartState();
      renderAll();
      if (existing) clearUndoSale();
      else offerUndoForSale(transaction.id);
      setStatus(existing ? `会計を変更しました。${formatYen(transaction.total)}に更新しました。` : `会計を確定しました。${formatYen(transaction.total)}を記録しました。`, 'success');
    } catch (error) {
      cancelChangeConfirmation();
      setStatus(error.message || '会計を保存できませんでした。', 'error');
    } finally {
      if (state.saleSaving) setSaleSaving(false);
    }
  }

  function importProducts(file) {
    const reader = new FileReader();
    reader.onload = async () => {
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
          if (!parsed.hasStartNewRowColumn && existing.startNewRow === true) {
            merged.startNewRow = true;
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
        await persistSharedSnapshot({ products: nextProducts, inventory: nextInventory },
          () => Storage.saveProductsAndInventory(storage, nextProducts, nextInventory));
        state.products = nextProducts;
        state.inventory = nextInventory;
        clearCartState();
        renderAll();
        const warningText = parsed.warnings.length ? ` 注意: ${parsed.warnings.join(' ')}` : '';
        setStatus(`${parsed.stats.accepted - parsed.stats.duplicates}件の商品を取り込みました。${parsed.stats.rejected}件を除外、重複${parsed.stats.duplicates}件。${warningText}`, parsed.warnings.length ? 'error' : 'success');
      } catch (error) {
        setStatus(persistenceErrorMessage(error, '商品一覧を保存できませんでした。現在の商品一覧を維持します。'), 'error');
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

  function shareCsv() {
    const csv = Core.transactionsToCsv(state.transactions);
    const filename = `shirayuri-sales-history-${new Date().toISOString().slice(0, 10)}.csv`;
    return shareCsvFile(filename, csv, '販売履歴', { historyBackup: true });
  }

  function exportProductsCsv() {
    const csv = Core.productsToCsv(state.products);
    downloadCsvFile(`shirayuri-products-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    setStatus(`${state.products.length}件の商品一覧をダウンロードしました。`, 'success');
  }

  function shareProductsCsv() {
    const csv = Core.productsToCsv(state.products);
    return shareCsvFile(`shirayuri-products-${new Date().toISOString().slice(0, 10)}.csv`, csv, '商品一覧CSV');
  }

  function exportSettingsCsv() {
    const csv = Core.settingsToCsv(state.settings);
    downloadCsvFile(`shirayuri-settings-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    setStatus('制限設定をダウンロードしました。', 'success');
  }

  function shareSettingsCsv() {
    const csv = Core.settingsToCsv(state.settings);
    return shareCsvFile(`shirayuri-settings-${new Date().toISOString().slice(0, 10)}.csv`, csv, '制限設定');
  }

  function exportSettingsBundle() {
    const json = Core.settingsBundleToJson(state.products, state.settings, state.inventory);
    downloadJsonFile(`shirayuri-register-settings-${new Date().toISOString().slice(0, 10)}.json`, json);
    setStatus(`${state.products.length}件の商品・在庫数・レジ設定をダウンロードしました。販売履歴は含まれません。`, 'success');
  }

  function shareSettingsBundle() {
    const json = Core.settingsBundleToJson(state.products, state.settings, state.inventory);
    // Chromium は Web Share の .json / application/json を拒否するため、同じ JSON を .txt で渡す。
    return shareExportFile(`shirayuri-register-settings-${new Date().toISOString().slice(0, 10)}.txt`, json, 'text/plain', 'レジ設定');
  }

  function importTransactions(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      const parsed = Core.parseTransactionCsv(reader.result);
      if (!parsed.transactions.length || parsed.warnings.length) {
        setStatus(`会計履歴を復元できませんでした。${parsed.warnings.join(' ')}`, 'error');
        return;
      }
      if (!root.confirm('現在の会計履歴を、CSVの内容で置き換えますか？\n在庫数はこの端末の現在値を維持します。新しい端末へ在庫数も移す場合は、先に「レジ設定一式」を復元してください。')) return;
      try {
        migrateLegacyTransactionProductIds(parsed.transactions);
        const hasInventoryActivity = Object.values(state.inventory.salesByProduct || {}).some((quantity) => quantity > 0)
          || (state.inventory.adjustments || []).length > 0;
        const nextInventory = !state.transactions.length && !hasInventoryActivity
          ? Core.createInventoryLedger(state.products, parsed.transactions)
          : state.inventory;
        await persistSharedSnapshot({ transactions: parsed.transactions, inventory: nextInventory },
          () => Storage.saveSalesAndInventory(storage, parsed.transactions, nextInventory));
        state.transactions = parsed.transactions;
        state.inventory = nextInventory;
        clearUndoSale();
        clearCartState();
        renderAll();
        setStatus(`${parsed.transactions.length}件の会計履歴を復元しました。`, 'success');
      } catch (error) {
        setStatus(persistenceErrorMessage(error, '会計履歴を保存できませんでした。現在の履歴を維持します。'), 'error');
      }
    };
    reader.onerror = () => setStatus('会計履歴CSVを読み込めませんでした。', 'error');
    reader.readAsText(file, 'UTF-8');
  }

  function importSettings(file) {
    const reader = new FileReader();
    reader.onload = async () => {
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
        await persistSharedSnapshot({ settings: nextSettings }, () => Storage.saveSettings(storage, nextSettings));
        state.settings = nextSettings;
        applyProductColumnWidth();
        startAutoBackupTimer();
        renderSettings();
        renderCatalog();
        renderCart();
        setStatus('制限設定を復元しました。', 'success');
      } catch (error) {
        setStatus(persistenceErrorMessage(error, '制限設定を復元できませんでした。現在の設定を維持します。'), 'error');
      }
    };
    reader.onerror = () => setStatus('制限設定ファイルを読み込めませんでした。', 'error');
    reader.readAsText(file, 'UTF-8');
  }

  function importSettingsBundle(file) {
    const reader = new FileReader();
    reader.onload = async () => {
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
        await persistSharedSnapshot({ products: parsed.products, inventory: nextInventory, settings: nextSettings }, () => {
          Storage.saveProductsAndInventory(storage, parsed.products, nextInventory);
          Storage.saveSettings(storage, nextSettings);
        });
        state.products = parsed.products;
        state.inventory = nextInventory;
        state.settings = nextSettings;
        applyProductColumnWidth();
        startAutoBackupTimer();
        clearCartState();
        renderAll();
        setStatus(`${parsed.products.length}件の商品・在庫数・レジ設定を復元しました。販売履歴は変更していません。`, 'success');
      } catch (error) {
        // 商品・在庫と設定は別キーなので、片方だけ保存できた場合は読み込み前の組み合わせへ戻す。
        if (!D1Client || !D1Client.isConfigured()) {
          try {
            Storage.saveProductsAndInventory(storage, previousProducts, previousInventory);
            Storage.saveSettings(storage, previousSettings);
          } catch (restoreError) {
            // 保存先自体が利用できない場合は、現在の画面状態を維持する。
          }
        }
        setStatus(persistenceErrorMessage(error, 'レジ設定一式を保存できませんでした。現在の設定を維持します。'), 'error');
      }
    };
    reader.onerror = () => setStatus('レジ設定一式ファイルを読み込めませんでした。', 'error');
    reader.readAsText(file, 'UTF-8');
  }

  function finishAppStartup(warnings = []) {
    renderHourlyHourOptions();
    applyProductColumnWidth();
    renderAll();
    renderSettings();
    startAutoBackupTimer();
    void restoreBackupDirectory();
    setStatus(warnings.filter(Boolean).join(' '), warnings.some(Boolean) ? 'error' : '');
  }

  function startRemoteSyncTimer() {
    if (state.remoteSyncTimer) root.clearInterval(state.remoteSyncTimer);
    state.remoteSyncTimer = root.setInterval(() => {
      if (root.document.visibilityState === 'visible') {
        void refreshRemoteData({ silent: true }).catch((error) => {
          if (error.status === 401) lockRemoteSession('ログインの有効期限が切れました。再度ログインしてください。');
          else setStatus(error.message || '共有データを確認できませんでした。', 'error');
        });
      }
    }, 15000);
    if (!state.remoteVisibilityHandler) state.remoteVisibilityHandler = () => {
      if (root.document.visibilityState === 'visible') {
        void refreshRemoteData({ silent: true }).catch((error) => {
          if (error.status === 401) lockRemoteSession('ログインの有効期限が切れました。再度ログインしてください。');
        });
      }
    };
    root.document.addEventListener('visibilitychange', state.remoteVisibilityHandler);
  }

  function lockRemoteSession(message = '') {
    cancelChangeConfirmation();
    if (state.remoteSyncTimer) root.clearInterval(state.remoteSyncTimer);
    state.remoteSyncTimer = null;
    if (state.autoBackupTimer) root.clearInterval(state.autoBackupTimer);
    state.autoBackupTimer = null;
    state.remoteAuthenticated = false;
    cancelAdminPasswordRequest('共有ログインが終了しました。');
    if (D1Client && D1Client.isConfigured()) D1Client.adminLogout();
    if (elements.adminPasswordDialog && elements.adminPasswordDialog.open) elements.adminPasswordDialog.close();
    setAdminMode(false);
    root.document.documentElement.dataset.sharedGate = 'locked';
    elements.sharedLogin.hidden = false;
    elements.sharedLoginError.textContent = message;
    elements.sharedPassword.value = '';
    elements.sharedLogout.classList.add('is-hidden');
    elements.sharedPassword.focus();
  }

  async function connectRemote(password = '') {
    if (state.remoteConnecting) return;
    state.remoteConnecting = true;
    let temporaryAdminSession = false;
    elements.sharedLoginSubmit.disabled = true;
    elements.sharedLoginError.textContent = '';
    elements.sharedLoginMessage.textContent = '共有データを読み込んでいます。';
    try {
      if (password) await D1Client.login(password);
      else if (!D1Client.getToken()) throw new Error('共有パスワードを入力してください。');
      let snapshot = await D1Client.getState();
      let initializedFromThisDevice = false;
      if (!snapshot.initialized) {
        if (!D1Client.isAdminAuthenticated()) {
          await requestAdminPassword();
          temporaryAdminSession = true;
        }
        const shouldInitialize = root.confirm('D1に共有データがまだありません。\nこの端末の現在の商品一覧・会計履歴・在庫・購入制限を初期データとして登録しますか？\n\n初回登録する端末は1台だけにしてください。他端末の端末内データは自動では統合されません。');
        if (!shouldInitialize) {
          D1Client.logout();
          throw new Error('初回登録をキャンセルしました。データのある端末からもう一度ログインしてください。');
        }
        migrateLegacyTransactionProductIds();
        initializeInventoryLedger();
        try {
          await D1Client.initialize(makeSharedSnapshot());
          initializedFromThisDevice = true;
        } catch (error) {
          if (error.status !== 409) throw error;
        }
        snapshot = await D1Client.getState();
      }
      if (!initializedFromThisDevice) {
        const localSnapshot = makeSharedSnapshot();
        const remoteSnapshot = {
          products: normalizeProductsWithIcons(snapshot.products),
          transactions: snapshot.transactions,
          inventory: snapshot.inventory,
          settings: sharedSettings(snapshot.settings),
        };
        if (sharedSnapshotsDiffer(localSnapshot, remoteSnapshot)
          && !root.confirm('この端末には共有データと異なるローカルデータがあります。\n続行すると共有データでこの端末のデータを置き換えます（自動統合はしません）。\nこの端末にだけある会計履歴や商品設定を残す場合は、キャンセルして先にバックアップしてください。\n\n共有データに切り替えますか？')) {
          D1Client.logout();
          throw new Error('切り替えをキャンセルしました。必要なデータをバックアップしてから、もう一度ログインしてください。');
        }
      }
      acceptRemoteSnapshot(snapshot);
      state.remoteAuthenticated = true;
      const beforeMigrations = JSON.parse(JSON.stringify(makeSharedSnapshot()));
      migrateLegacyTransactionProductIds();
      initializeInventoryLedger();
      if (JSON.stringify(makeSharedSnapshot()) !== JSON.stringify(beforeMigrations)) {
        await persistSharedSnapshot({}, () => {}, beforeMigrations);
      }
      elements.sharedLogin.hidden = true;
      elements.sharedLogout.classList.remove('is-hidden');
      delete root.document.documentElement.dataset.sharedGate;
      finishAppStartup([]);
      startRemoteSyncTimer();
      setStatus('共有データに接続しました。', 'success');
    } catch (error) {
      if (error.status === 401) D1Client.logout();
      elements.sharedLoginMessage.textContent = '共有データを利用するにはログインしてください。';
      elements.sharedLoginError.textContent = error.message || 'ログインできませんでした。';
      elements.sharedPassword.focus();
    } finally {
      if (temporaryAdminSession) D1Client.adminLogout();
      state.remoteConnecting = false;
      elements.sharedLoginSubmit.disabled = false;
    }
  }

  function start() {
    elements.status = $('#status');
    elements.sharedLogin = $('#shared-login');
    elements.sharedLoginForm = $('#shared-login-form');
    elements.sharedPassword = $('#shared-password');
    elements.sharedLoginMessage = $('#shared-login-message');
    elements.sharedLoginError = $('#shared-login-error');
    elements.sharedLoginSubmit = $('#shared-login-submit');
    elements.sharedLogout = $('#shared-logout');
    elements.undoLastSale = $('#undo-last-sale');
    elements.pageShell = document.querySelector('.page-shell');
    elements.productList = $('#product-list');
    elements.productCount = $('#product-count');
    elements.cartList = $('#cart-list');
    elements.checkoutPanel = $('#checkout-panel');
    elements.checkoutResizeHandle = $('#checkout-resize-handle');
    elements.mobileCheckoutOpen = $('#mobile-checkout-open');
    elements.mobileCheckoutClose = $('#mobile-checkout-close');
    elements.mobileCartTotal = $('#mobile-cart-total');
    elements.paymentBox = document.querySelector('.payment-box');
    elements.cartTotal = $('#cart-total');
    elements.received = $('#received');
    elements.saleNoteToggle = $('#sale-note-toggle');
    elements.saleNoteField = $('#sale-note-field');
    elements.saleNote = $('#sale-note');
    elements.saleNoteCount = $('#sale-note-count');
    elements.change = $('#change');
    elements.paymentMessage = $('#payment-message');
    elements.confirmButton = $('#confirm-button');
    elements.changeConfirmationDialog = $('#change-confirmation-dialog');
    elements.changeConfirmationAmount = $('#change-confirmation-amount');
    elements.changeConfirmationTotal = $('#change-confirmation-total');
    elements.changeConfirmationReceived = $('#change-confirmation-received');
    elements.changeConfirmationMessage = $('#change-confirmation-message');
    elements.changeConfirmationCancel = $('#change-confirmation-cancel');
    elements.changeConfirmationConfirm = $('#change-confirmation-confirm');
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
    elements.quantityShareChart = $('#quantity-share-chart');
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
    elements.dailyCloseShare = $('#daily-close-share');
    elements.clearCart = $('#clear-cart');
    elements.clearCartDialog = $('#clear-cart-dialog');
    elements.clearCartDialogTitle = $('#clear-cart-dialog-title');
    elements.clearCartDialogMessage = $('#clear-cart-dialog-message');
    elements.clearCartDialogCancel = $('#clear-cart-dialog-cancel');
    elements.clearCartDialogConfirm = $('#clear-cart-dialog-confirm');
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
    elements.adminPasswordDialog = $('#admin-password-dialog');
    elements.adminPasswordForm = $('#admin-password-form');
    elements.adminPassword = $('#admin-password');
    elements.adminPasswordError = $('#admin-password-error');
    elements.adminPasswordSubmit = $('#admin-password-submit');
    elements.adminPasswordCancel = $('#admin-password-cancel');
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
    elements.backupOptionsTitle = $('#backup-options-title');
    elements.backupEnabledLabel = $('#backup-enabled-label');
    elements.backupIntervalLabel = $('#backup-interval-label');
    elements.backupReminder = $('#backup-reminder');
    elements.backupReminderSave = $('#backup-reminder-save');
    elements.backupReminderLater = $('#backup-reminder-later');
    elements.backupStatus = $('#backup-status');
    elements.backupNow = $('#backup-now');
    elements.iconFile = $('#icon-file');
    elements.productAddForm = $('#product-add-form');
    elements.productCopyNote = $('#product-copy-note');
    elements.productCopyCancel = $('#product-copy-cancel');
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
    elements.categoryOrderList = $('#category-order-list');
    elements.resetInventoryPeriod = $('#reset-inventory-period');
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
    elements.dailyCloseShare.addEventListener('click', shareDailyClose);
    elements.productManagementList.addEventListener('click', handleProductManagementAction);
    elements.categoryOrderList.addEventListener('click', handleCategoryOrderAction);
    elements.productManagementList.addEventListener('change', handleProductManagementChange);
    elements.productManagementList.addEventListener('input', handleProductManagementInput);
    elements.resetInventoryPeriod.addEventListener('click', () => { void resetInventoryPeriod(); });
    elements.productAddForm.addEventListener('submit', (event) => { void addProduct(event); });
    elements.productCopyCancel.addEventListener('click', cancelProductCopy);
    elements.productAddForm.addEventListener('input', updateProductAddActionState);
    elements.productAddForm.addEventListener('change', updateProductAddActionState);
    elements.productAddCategory.addEventListener('change', renderProductAddCategories);
    elements.productColumnWidth.addEventListener('change', saveProductColumnWidth);
    document.querySelector('.tab-list').addEventListener('click', (event) => {
      const tab = event.target.closest('[data-tab-target]');
      if (tab) activateTab(tab.dataset.tabTarget);
    });
    setupTabSwipe(document.querySelector('.tabbed-results'));
    elements.received.addEventListener('input', () => { state.received = elements.received.value; renderCart(); });
    elements.saleNoteToggle.addEventListener('click', () => {
      const opening = elements.saleNoteField.classList.contains('is-hidden');
      setSaleNote(state.saleNote, opening);
      if (opening) elements.saleNote.focus();
    });
    elements.saleNote.addEventListener('input', () => {
      state.saleNote = elements.saleNote.value;
      elements.saleNoteCount.textContent = `${state.saleNote.length}/${SALE_NOTE_MAX_LENGTH}`;
    });
    elements.checkoutResizeHandle.addEventListener('pointerdown', handleCheckoutResizeStart);
    elements.checkoutResizeHandle.addEventListener('keydown', handleCheckoutResizeKeydown);
    elements.mobileCheckoutOpen.addEventListener('click', () => setMobileCheckoutOpen(true));
    elements.mobileCheckoutClose.addEventListener('click', () => setMobileCheckoutOpen(false));
    root.document.addEventListener('keydown', handleMobileCheckoutKeydown);
    root.addEventListener('resize', () => {
      if (state.checkoutHeight) setCheckoutHeight(state.checkoutHeight);
      if (state.mobileCheckoutOpen && !isMobileCheckoutViewport()) setMobileCheckoutOpen(false, { restoreFocus: false });
    });
    elements.paymentBox.addEventListener('click', handleReceivedQuickAction);
    elements.checkoutLimitAdjustment.addEventListener('click', handleCheckoutLimitAdjustment);
    elements.checkoutLimitAdjustment.addEventListener('change', handleCheckoutLimitAdjustmentChange);
    elements.checkoutLimitReset.addEventListener('click', () => setTemporaryCheckoutSiblings(state.settings.siblings));
    $('#exact-total').addEventListener('click', () => { state.received = String(Core.calculateCart(getCartLines()).total); elements.received.value = state.received; renderCart(); });
    elements.confirmButton.addEventListener('click', () => { void requestConfirmSale(); });
    elements.changeConfirmationCancel.addEventListener('click', cancelChangeConfirmation);
    elements.changeConfirmationConfirm.addEventListener('click', () => { void confirmSale(state.pendingChangeConfirmation); });
    elements.changeConfirmationDialog.addEventListener('cancel', (event) => {
      if (state.saleSaving) event.preventDefault();
      else state.pendingChangeConfirmation = null;
    });
    elements.changeConfirmationDialog.addEventListener('close', () => {
      if (!elements.changeConfirmationDialog.open) state.pendingChangeConfirmation = null;
    });
    elements.clearCart.addEventListener('click', requestClearCart);
    elements.clearCartDialogCancel.addEventListener('click', () => elements.clearCartDialog.close());
    elements.clearCartDialogConfirm.addEventListener('click', confirmClearCart);
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
    $('#share-csv').addEventListener('click', shareCsv);
    $('#export-products-csv').addEventListener('click', exportProductsCsv);
    $('#share-products-csv').addEventListener('click', shareProductsCsv);
    elements.exportSettingsCsv.addEventListener('click', exportSettingsCsv);
    $('#share-settings-csv').addEventListener('click', shareSettingsCsv);
    elements.exportSettingsBundle.addEventListener('click', exportSettingsBundle);
    $('#share-settings-bundle').addEventListener('click', shareSettingsBundle);
    elements.iconFile.addEventListener('change', (event) => {
      replaceProductIcon(event.target.files[0], event.target.dataset.targetProductId);
      event.target.value = '';
    });
    elements.adminToggle.addEventListener('click', () => {
      const opening = elements.adminPanel.classList.contains('is-hidden');
      if (opening) openAdminAccess();
      else setAdminMode(false);
    });
    elements.adminClose.addEventListener('click', () => {
      setAdminMode(false);
      if (D1Client && D1Client.isConfigured()) D1Client.adminLogout();
    });
    elements.adminPasswordForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void connectAdmin(elements.adminPassword.value);
    });
    elements.adminPasswordCancel.addEventListener('click', () => {
      cancelAdminPasswordRequest();
      elements.adminPasswordDialog.close();
      elements.adminPassword.value = '';
      elements.adminPasswordError.textContent = '';
    });
    elements.adminPasswordDialog.addEventListener('cancel', () => {
      cancelAdminPasswordRequest();
      elements.adminPassword.value = '';
      elements.adminPasswordError.textContent = '';
    });
    elements.sharedLoginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void connectRemote(elements.sharedPassword.value);
    });
    elements.sharedLogout.addEventListener('click', () => {
      if (!root.confirm('共有レジからログアウトしますか？')) return;
      D1Client.logout();
      lockRemoteSession();
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
    elements.backupReminderSave.addEventListener('click', () => { void backupNow(); });
    elements.backupReminderLater.addEventListener('click', postponeBackupReminder);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void maybeRunAutoBackup();
    });
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
      try {
        await persistSharedSnapshot({ transactions: [] }, () => Storage.clearTransactions(storage));
      } catch (error) {
        setStatus(error.message || '会計履歴を消去できませんでした。', 'error');
        return;
      }
      state.transactions = [];
      clearUndoSale();
      renderAll();
      const archiveMessage = archiveResult.archived
        ? `バックアップCSVを${archiveResult.filename}としてアーカイブしました。`
        : 'アーカイブ対象のバックアップCSVはありませんでした。';
      setStatus(`会計履歴を消去しました。在庫残数・商品一覧・設定は維持されています。${archiveMessage}`, 'success');
    });
    if (D1Client && D1Client.isConfigured()) {
      root.document.documentElement.dataset.sharedGate = 'locked';
      elements.sharedLogin.hidden = false;
      elements.sharedLoginMessage.textContent = '共有データを利用するにはログインしてください。';
      if (D1Client.getToken()) void connectRemote();
      else elements.sharedPassword.focus();
      return;
    }
    migrateLegacyTransactionProductIds();
    const inventoryWarning = initializeInventoryLedger();
    const warnings = [storageInfo.warning, productState.warning, transactionState.warning, inventoryState.warning, settingsState.warning, inventoryWarning];
    finishAppStartup(warnings);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
})(typeof window !== 'undefined' ? window : globalThis);

