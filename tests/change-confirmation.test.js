const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../core.js');

function harness(directory = '', options = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', directory, 'app.js'), 'utf8');
  const names = [
    'formatYen', 'getCartLines', 'findProduct', 'getCheckoutLimitSettings', 'changeQuantity',
    'clearCartState', 'renderCart', 'getSaleDraft', 'cancelChangeConfirmation',
    'showChangeConfirmation', 'requestConfirmSale', 'renderSaleCompletion', 'setSaleSaving',
    'confirmSale', 'handleMobileCheckoutKeydown',
  ];
  const functions = names.map((name) => {
    const start = new RegExp('^  (?:async )?function ' + name + '\\(', 'm').exec(source);
    assert.ok(start, name);
    const tail = source.slice(start.index + start[0].length);
    const next = /\n  (?:async )?function \w+\(/.exec(tail);
    assert.ok(next, name + ' has a following function');
    return source.slice(start.index, start.index + start[0].length + next.index);
  }).join('\n');
  const makeElement = () => {
    const classes = new Set();
    return {
      hidden: false, disabled: false, open: false, value: '', textContent: '', innerHTML: '',
      attributes: {}, inert: false, focused: false,
      classList: {
        toggle(name, force) { if (force) classes.add(name); else classes.delete(name); },
        contains(name) { return classes.has(name); },
      },
      setAttribute(name, value) { this.attributes[name] = value; },
      focus() { this.focused = true; },
      showModal() { this.open = true; },
      close() { this.open = false; },
      querySelector() { return { scrollTop: 0 }; },
    };
  };
  const elements = Object.fromEntries([...new Set([...functions.matchAll(/elements\.(\w+)/g)].map((match) => match[1]))]
    .map((name) => [name, makeElement()]));
  const product = { id: 'p1', name: '確認用商品', category: '園グッズ', unitPrice: 200, stockLimit: 5 };
  const state = {
    products: [product], transactions: [], inventory: Core.createInventoryLedger([product], []),
    settings: { enabled: true, category: '古園服', siblings: 1, perSibling: 4 },
    cart: new Map([['p1', 1]]), cartProducts: new Map(), received: '1000', saleNote: '',
    editingTransactionId: null, temporaryCheckoutSiblings: null, checkoutHeight: null,
    mobileCheckoutOpen: true, saleSaving: false, pendingChangeConfirmation: null, lastCompletedSale: null,
  };
  const calls = { saves: [], statuses: [], undo: [], mobile: [], fallback: [] };
  let stockError = null;
  let saveError = null;
  const context = {
    Core, state, elements, storage: {}, root: {
      document: { activeElement: null },
      confirm(message) { calls.fallback.push(message); return options.acceptFallback === true; },
    },
    Storage: { saveSalesAndInventory(_storage, transactions, inventory) { calls.local = { transactions, inventory }; } },
    productNameText: (text) => String(text || ''),
    productNameMarkup: (text) => String(text || ''),
    iconMarkup: () => '',
    escapeHtml: (text) => String(text),
    getProductStockInfo: () => ({ limited: false }),
    getCartStockError: () => stockError,
    setSaleNote(note) { state.saleNote = note; },
    renderCatalog() {},
    setStatus(message, type) { calls.statuses.push({ message, type }); },
    setMobileCheckoutOpen(open) { state.mobileCheckoutOpen = open; calls.mobile.push(open); },
    clearUndoSale() { calls.undo.push(null); },
    offerUndoForSale(id) { calls.undo.push(id); },
    async persistSharedSnapshot(snapshot, localPersist) {
      calls.saves.push(snapshot);
      if (options.saveGate) await options.saveGate;
      if (saveError) throw saveError;
      localPersist();
    },
    renderAll() { api.renderCart(); },
  };
  const api = vm.runInNewContext(functions + '\n({' + names.join(',') + '});', context);
  if (options.noDialog) elements.changeConfirmationDialog.showModal = undefined;
  return {
    api, state, elements, calls, product,
    setStockError(error) { stockError = error; },
    setSaveError(error) { saveError = error; },
  };
}

for (const directory of ['', 'dist/']) {
  const prefix = directory || 'source/';

  test(prefix + 'change requires review, focuses the amount, then persists and retains a receipt', async () => {
    const h = harness(directory);
    h.api.renderCart();
    assert.equal(h.elements.confirmButton.textContent, 'お釣り ¥800 を確認');
    await h.api.requestConfirmSale();
    assert.equal(h.calls.saves.length, 0);
    assert.equal(h.elements.changeConfirmationDialog.open, true);
    assert.equal(h.elements.changeConfirmationAmount.textContent, '¥800');
    assert.equal(h.elements.changeConfirmationTotal.textContent, '¥200');
    assert.equal(h.elements.changeConfirmationReceived.textContent, '¥1,000');
    assert.equal(h.elements.changeConfirmationAmount.focused, true);
    await h.api.requestConfirmSale();
    assert.equal(h.calls.saves.length, 0, 'another first-step tap must not confirm');
    await h.api.confirmSale(h.state.pendingChangeConfirmation);
    assert.equal(h.calls.saves.length, 1);
    assert.equal(h.state.transactions.length, 1);
    assert.equal(h.state.transactions[0].change, 800);
    assert.equal(h.state.cart.size, 0);
    assert.equal(h.state.received, '');
    assert.equal(h.state.mobileCheckoutOpen, false);
    assert.equal(h.elements.changeConfirmationDialog.open, false);
    assert.equal(h.elements.saleCompletion.hidden, false);
    assert.equal(h.elements.saleCompletionAmount.textContent, '¥800');
    assert.match(h.elements.saleCompletionDetails.textContent, /合計 ¥200 ／ お預かり ¥1,000/);
    h.api.renderCart();
    assert.equal(h.elements.saleCompletion.hidden, false, 'normal refresh does not dismiss the receipt');
    h.api.changeQuantity('p1', 1);
    assert.equal(h.elements.saleCompletion.hidden, true);
    assert.equal(h.state.lastCompletedSale, null);
  });

  test(prefix + 'cancel keeps the draft and exact payment bypasses the review', async () => {
    const h = harness(directory);
    await h.api.requestConfirmSale();
    h.api.cancelChangeConfirmation();
    assert.equal(h.state.pendingChangeConfirmation, null);
    assert.equal(h.elements.changeConfirmationDialog.open, false);
    assert.equal(h.state.cart.get('p1'), 1);
    assert.equal(h.state.received, '1000');
    assert.equal(h.calls.saves.length, 0);
    h.state.received = '200';
    h.api.renderCart();
    assert.equal(h.elements.confirmButton.textContent, '会計を確定する');
    await h.api.requestConfirmSale();
    assert.equal(h.calls.saves.length, 1);
    assert.equal(h.elements.saleCompletionAmount.textContent, '¥0');
    assert.match(h.elements.saleCompletionDetails.textContent, /ちょうど/);
  });

  test(prefix + 'incomplete, insufficient, empty, stock and purchase-limit errors cannot save', async () => {
    for (const configure of [
      (h) => { h.state.received = ''; },
      (h) => { h.state.received = '100'; },
      (h) => { h.state.received = 'NaN'; },
      (h) => { h.state.cart.clear(); },
      (h) => { h.product.unitPrice = -100; },
      (h) => { h.setStockError({ message: '在庫切れです' }); },
      (h) => { h.state.settings.category = '園グッズ'; h.state.settings.perSibling = 0; },
    ]) {
      const h = harness(directory);
      configure(h);
      h.api.renderCart();
      assert.equal(h.elements.confirmButton.disabled, true);
      await h.api.requestConfirmSale();
      assert.equal(h.calls.saves.length, 0);
      assert.equal(h.elements.changeConfirmationDialog.open, false);
      assert.equal(h.state.lastCompletedSale, null);
      assert.equal(h.calls.statuses.at(-1).type, 'error');
    }
  });

  test(prefix + 'changed receipt, quantity, price or memo requires a fresh review including zero change', async () => {
    for (const change of [
      (h) => { h.state.received = '200'; },
      (h) => { h.state.cart.set('p1', 2); },
      (h) => { h.product.unitPrice = 250; },
      (h) => { h.state.saleNote = '確認用メモ'; },
    ]) {
      const h = harness(directory);
      await h.api.requestConfirmSale();
      const old = h.state.pendingChangeConfirmation;
      change(h);
      await h.api.confirmSale(old);
      assert.equal(h.calls.saves.length, 0);
      assert.notEqual(h.state.pendingChangeConfirmation, old);
      assert.match(h.elements.changeConfirmationMessage.textContent, /もう一度/);
      await h.api.confirmSale(h.state.pendingChangeConfirmation);
      assert.equal(h.calls.saves.length, 1);
    }
  });

  test(prefix + 'stock is revalidated on final confirmation', async () => {
    const h = harness(directory);
    await h.api.requestConfirmSale();
    h.setStockError({ message: '別の端末で売り切れました' });
    await h.api.confirmSale(h.state.pendingChangeConfirmation);
    assert.equal(h.calls.saves.length, 0);
    assert.equal(h.elements.changeConfirmationDialog.open, false);
    assert.equal(h.state.cart.get('p1'), 1);
    assert.match(h.calls.statuses.at(-1).message, /売り切れ/);
  });

  test(prefix + 'failed persistence keeps the cart, requires another review and unlocks controls', async () => {
    const h = harness(directory);
    h.setSaveError(new Error('別の端末で先に更新されました'));
    await h.api.requestConfirmSale();
    await h.api.confirmSale(h.state.pendingChangeConfirmation);
    assert.equal(h.state.transactions.length, 0);
    assert.equal(h.state.cart.get('p1'), 1);
    assert.equal(h.state.received, '1000');
    assert.equal(h.state.lastCompletedSale, null);
    assert.equal(h.elements.pageShell.inert, false);
    assert.equal(h.state.saleSaving, false);
    assert.equal(h.state.mobileCheckoutOpen, true);
    assert.equal(h.elements.changeConfirmationDialog.open, false);
    assert.match(h.calls.statuses.at(-1).message, /別の端末/);
    h.setSaveError(null);
    await h.api.requestConfirmSale();
    assert.equal(h.calls.saves.length, 1);
    await h.api.confirmSale(h.state.pendingChangeConfirmation);
    assert.equal(h.state.transactions.length, 1);
  });

  test(prefix + 'a slow save blocks double submissions and cart mutation', async () => {
    let resolve;
    const saveGate = new Promise((done) => { resolve = done; });
    const h = harness(directory, { saveGate });
    await h.api.requestConfirmSale();
    const signature = h.state.pendingChangeConfirmation;
    const saving = h.api.confirmSale(signature);
    assert.equal(h.state.saleSaving, true);
    assert.equal(h.elements.pageShell.inert, true);
    assert.equal(h.elements.changeConfirmationConfirm.disabled, true);
    assert.equal(h.elements.changeConfirmationCancel.disabled, true);
    assert.equal(h.elements.confirmButton.disabled, true);
    assert.equal(h.elements.sharedLogout.disabled, true);
    await h.api.confirmSale(signature);
    await h.api.requestConfirmSale();
    h.api.changeQuantity('p1', 3);
    assert.equal(h.state.cart.get('p1'), 1);
    assert.equal(h.calls.saves.length, 1);
    resolve();
    await saving;
    assert.equal(h.state.transactions.length, 1);
    assert.equal(h.state.inventory.salesByProduct.p1, 1);
    assert.equal(h.elements.pageShell.inert, false);
    assert.equal(h.elements.sharedLogout.disabled, false);
  });

  test(prefix + 'history editing updates the same record without a new-cash review or receipt', async () => {
    const h = harness(directory);
    const original = Core.buildTransaction({ id: 'existing', lines: h.api.getCartLines(), received: 1000 });
    h.state.transactions = [original];
    h.state.inventory = Core.createInventoryLedger([h.product], [original]);
    h.state.editingTransactionId = original.id;
    h.state.cart.set('p1', 2);
    h.api.renderCart();
    assert.equal(h.elements.confirmButton.textContent, '変更を保存');
    await h.api.requestConfirmSale();
    assert.equal(h.state.transactions.length, 1);
    assert.equal(h.state.transactions[0].id, 'existing');
    assert.equal(h.state.transactions[0].recordedAt, original.recordedAt);
    assert.equal(h.state.transactions[0].change, 600);
    assert.equal(h.state.lastCompletedSale, null);
    assert.equal(h.elements.saleCompletion.hidden, true);
    assert.equal(h.elements.changeConfirmationDialog.open, false);
  });

  test(prefix + 'native dialog owns Escape and keyboard focus while open', async () => {
    const h = harness(directory);
    await h.api.requestConfirmSale();
    const event = { key: 'Escape', preventDefault() { throw new Error('must let the native dialog handle Escape'); } };
    h.api.handleMobileCheckoutKeydown(event);
    assert.equal(h.state.mobileCheckoutOpen, true);
    assert.equal(h.calls.saves.length, 0);
  });

  test(prefix + 'a remotely removed history record cannot accidentally become a new sale', async () => {
    const h = harness(directory);
    h.state.editingTransactionId = 'removed-record';
    await h.api.requestConfirmSale();
    assert.equal(h.calls.saves.length, 0);
    assert.match(h.calls.statuses.at(-1).message, /編集中の会計が見つかりません/);
  });

  test(prefix + 'the modal actions and persistent receipt are wired into the responsive UI', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', directory, 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', directory, 'styles.css'), 'utf8');
    const app = fs.readFileSync(path.join(__dirname, '..', directory, 'app.js'), 'utf8');
    assert.match(html, /id="change-confirmation-dialog"[\s\S]*?aria-labelledby="change-confirmation-title"/);
    assert.match(html, /id="change-confirmation-amount" tabindex="-1"/);
    assert.match(app, /elements\.confirmButton\.addEventListener\('click', \(\) => \{ void requestConfirmSale\(\); \}\)/);
    assert.match(app, /confirmSale\(state\.pendingChangeConfirmation\)/);
    assert.match(app, /changeConfirmationDialog\.addEventListener\('cancel'/);
    assert.match(app, /if \(state.saleSaving\) event.preventDefault\(\)/);
    assert.match(html, /class="register-notices">[\s\S]*?id="backup-reminder"[\s\S]*?id="sale-completion"/);
    assert.match(css, /\.register-notices \{[^}]*display: grid; gap: 10px/);
    assert.match(css, /\.sale-completion\[hidden\] \{ display: none; \}/);
    assert.match(css, /\.change-confirmation-dialog \{[^}]*overflow-y: auto/);
    assert.match(css, /#checkout-panel \.checkout-actions-footer \.confirm-button \{[^}]*white-space: normal; overflow-wrap: anywhere/);
  });

  test(prefix + 'dialog fallback still requires an explicit confirmation with the change amount', async () => {
    for (const accepted of [false, true]) {
      const h = harness(directory, { noDialog: true, acceptFallback: accepted });
      await h.api.requestConfirmSale();
      assert.equal(h.calls.fallback.length, 1);
      assert.match(h.calls.fallback[0], /お釣り ¥800/);
      assert.equal(h.calls.saves.length, accepted ? 1 : 0);
    }
  });

  test(prefix + 'a removed or edited completed sale does not leave a stale change receipt', async () => {
    const h = harness(directory);
    h.state.received = '200';
    await h.api.requestConfirmSale();
    assert.equal(h.elements.saleCompletion.hidden, false);
    h.state.transactions = [];
    h.api.renderSaleCompletion();
    assert.equal(h.elements.saleCompletion.hidden, true);
  });
}
