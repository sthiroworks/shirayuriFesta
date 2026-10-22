const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../core.js');

const Worker = import('../cloudflare/worker.mjs');

const emptyInventory = { salesByProduct: {}, remainingByProduct: {}, adjustments: [] };
const defaultSettings = { enabled: true, category: '古園服', siblings: 1, perSibling: 4 };
const transaction = { id: 'tx-1', recordedAt: '2026-10-20T01:00:00.000Z', total: 100, received: 100, change: 0, itemCount: 1, items: [] };
const product = { id: 'p1', category: '園グッズ', name: '手提げ', unitPrice: 800 };

test('resetInventoryPeriod starts a new inventory period without deleting history data', () => {
  const products = [
    { id: 'p1', category: '園グッズ', name: '手提げ', unitPrice: 800, stockLimit: 10 },
    { id: 'p2', category: '古園服', name: 'ブレザー', unitPrice: 400 },
  ];
  const inventory = {
    salesByProduct: { p1: 4, p2: 2 },
    remainingByProduct: { p1: 6 },
    adjustments: [{ id: 'adjustment-1', after: 6 }],
  };
  const reset = Core.resetInventoryPeriod(products, inventory);

  assert.equal(reset.products[0].stockLimit, 6);
  assert.equal(reset.products[1].stockLimit, undefined);
  assert.deepEqual(reset.inventory.salesByProduct, { p1: 0, p2: 0 });
  assert.deepEqual(reset.inventory.remainingByProduct, { p1: 6 });
  assert.deepEqual(reset.inventory.adjustments, inventory.adjustments);
  assert.equal(inventory.salesByProduct.p1, 4, 'the original ledger is not mutated');
});

function fakeDb(revision = 0, initialized = false) {
  const batches = [];
  const stats = { allCalls: 0 };
  return {
    batches,
    stats,
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) { return { ...statement, values }; },
        async first() {
          if (sql.includes('FROM app_meta')) return {
            revision,
            initialized: initialized ? 1 : 0,
            settings_json: JSON.stringify(defaultSettings),
            inventory_json: JSON.stringify(emptyInventory),
          };
          return null;
        },
        async all() { stats.allCalls += 1; return { results: [] }; },
      };
      return statement;
    },
    async batch(statements) {
      batches.push(statements);
      return statements.map((statement, index) => ({ meta: { changes: index === 0 ? 1 : 1 } }));
    },
  };
}

test('browser D1 client is exposed under the global name expected by the app', () => {
  const browser = {
    SHIRAYURI_D1_API_URL: 'https://api.example',
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
  const source = fs.readFileSync(require.resolve('../d1-client.js'), 'utf8');
  vm.runInNewContext(source, { window: browser });

  assert.equal(typeof browser.SalesRegisterD1Client?.isConfigured, 'function');
  assert.equal(browser.SalesRegisterD1Client.isConfigured(), true);
});

test('deployed runtime modules stay synchronized with their source files', () => {
  for (const file of ['app.js', 'index.html', 'styles.css', 'core.js', 'storage.js', 'products.default.js', 'd1-client.js']) {
    const source = fs.readFileSync(require.resolve(`../${file}`), 'utf8');
    const deployed = fs.readFileSync(require.resolve(`../dist/${file}`), 'utf8');
    assert.equal(deployed, source, `${file} must match the deployed dist copy`);
  }
});

test('D1 snapshots and deltas reject malformed records and accept existing data shape', async () => {
  const { validateSnapshot, validateChanges, changesRequireAdmin } = await Worker;
  const snapshot = validateSnapshot({ products: [], transactions: [transaction], inventory: emptyInventory, settings: defaultSettings });
  assert.deepEqual(snapshot.transactions, [transaction]);
  assert.deepEqual(validateChanges({ transactions: { upsert: [transaction], remove: [] } }).transactions.upsert, [transaction]);
  assert.deepEqual(validateChanges({ productOrder: ['p1'] }).productOrder, ['p1']);
  assert.equal(changesRequireAdmin({ transactions: { upsert: [transaction], remove: [] }, inventory: emptyInventory }), false);
  assert.equal(changesRequireAdmin({ inventory: emptyInventory }), true);
  assert.equal(changesRequireAdmin({ products: { upsert: [product], remove: [] } }), true);
  assert.throws(() => validateSnapshot({ products: [{ id: 'p1' }], transactions: [], inventory: emptyInventory, settings: defaultSettings }), /商品一覧/);
  assert.throws(() => validateChanges({ transactions: { upsert: [transaction], remove: ['tx-1'] } }), /ID/);
});

test('D1 sync rejects a stale terminal revision and writes only requested deltas', async () => {
  const { syncDatabase, initializeDatabase } = await Worker;
  const staleDb = fakeDb(7, true);
  await assert.rejects(syncDatabase(staleDb, 6, { transactions: { upsert: [transaction], remove: [] } }), (error) => error.status === 409);
  assert.equal(staleDb.batches.length, 0);

  const currentDb = fakeDb(7, true);
  const result = await syncDatabase(currentDb, 7, {
    products: { upsert: [product], remove: [] },
    productOrder: ['p1'],
    transactions: { upsert: [transaction], remove: [] },
    inventory: { salesByProduct: { p1: 1 }, remainingByProduct: {}, adjustments: [] },
  });
  assert.deepEqual(result, { revision: 8, changed: true });
  assert.equal(currentDb.batches.length, 1);
  assert.match(currentDb.batches[0][0].sql, /revision = \?/);
  assert.ok(currentDb.batches[0].some((statement) => statement.sql.includes('INSERT INTO transactions')));
  assert.ok(currentDb.batches[0].some((statement) => statement.sql.includes('INSERT INTO products')));
  assert.ok(currentDb.batches[0].some((statement) => statement.sql.includes('SET sort_order')));
  assert.ok(currentDb.batches[0].some((statement) => statement.sql.includes('INSERT INTO change_log')));
  assert.equal(currentDb.stats.allCalls, 0, '普通の会計保存は履歴全件を読み直さない');

  const initialDb = fakeDb();
  await initializeDatabase(initialDb, { products: [], transactions: [transaction], inventory: emptyInventory, settings: defaultSettings });
  assert.equal(initialDb.batches[0][1].values.length, 5, '初期履歴のbind引数はSQLのプレースホルダー数と一致');
});

test('Worker issues an expiring login token only to configured origins', async () => {
  const { handleRequest } = await Worker;
  const env = { APP_PASSWORD: 'a-long-test-password', ADMIN_PASSWORD: 'a-different-admin-password', SESSION_SECRET: 'a-test-session-signing-secret', ALLOWED_ORIGINS: 'https://register.example' };
  const denied = await handleRequest(new Request('https://api.example/api/login', {
    method: 'POST', headers: { Origin: 'https://unlisted.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ password: env.APP_PASSWORD }),
  }), env);
  assert.equal(denied.status, 403);

  const login = await handleRequest(new Request('https://api.example/api/login', {
    method: 'POST', headers: { Origin: 'https://register.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ password: env.APP_PASSWORD }),
  }), env);
  assert.equal(login.status, 200);
  const { token } = await login.json();
  const wrongAdminLogin = await handleRequest(new Request('https://api.example/api/admin/login', {
    method: 'POST', headers: { Origin: 'https://register.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ password: env.APP_PASSWORD }),
  }), env);
  assert.equal(wrongAdminLogin.status, 401);
  const adminLogin = await handleRequest(new Request('https://api.example/api/admin/login', {
    method: 'POST', headers: { Origin: 'https://register.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ password: env.ADMIN_PASSWORD }),
  }), env);
  assert.equal(adminLogin.status, 200);
  const { token: adminToken } = await adminLogin.json();
  const db = fakeDb(0, false);
  const state = await handleRequest(new Request('https://api.example/api/state', {
    headers: { Origin: 'https://register.example', Authorization: `Bearer ${token}` },
  }), { ...env, DB: db });
  assert.equal(state.status, 200);
  assert.equal((await state.json()).initialized, false);
  const unauthorized = await handleRequest(new Request('https://api.example/api/state', { headers: { Origin: 'https://register.example' } }), { ...env, DB: db });
  assert.equal(unauthorized.status, 401);

  const protectedBody = {
    expectedRevision: 0,
    changes: { inventory: { salesByProduct: {}, remainingByProduct: {}, adjustments: [] } },
  };
  const regularProtectedWrite = await handleRequest(new Request('https://api.example/api/sync', {
    method: 'POST', headers: { Origin: 'https://register.example', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(protectedBody),
  }), { ...env, DB: fakeDb(0, true) });
  assert.equal(regularProtectedWrite.status, 403);
  assert.match((await regularProtectedWrite.json()).error, /管理者権限/);
  const adminProtectedWrite = await handleRequest(new Request('https://api.example/api/sync', {
    method: 'POST', headers: { Origin: 'https://register.example', Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(protectedBody),
  }), { ...env, DB: fakeDb(0, true) });
  assert.equal(adminProtectedWrite.status, 200);

  const regularInitialize = await handleRequest(new Request('https://api.example/api/initialize', {
    method: 'POST', headers: { Origin: 'https://register.example', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ products: [], transactions: [], inventory: emptyInventory, settings: defaultSettings }),
  }), { ...env, DB: fakeDb() });
  assert.equal(regularInitialize.status, 403);
});
