const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('../core.js');

test('parseProductText extracts both price-table blocks', () => {
  const text = [
    '値段表,,,',
    '園グッズ,,,古園服,',
    '品名,金額,,品名,金額',
    '手提げ,500,,冬服ブレザー,400',
    '上履き袋,300,,冬服ブラウス,200',
  ].join('\n');

  const result = Core.parseProductText(text);

  assert.deepEqual(result.products, [
    { id: '園グッズ::手提げ', category: '園グッズ', name: '手提げ', unitPrice: 500 },
    { id: '園グッズ::上履き袋', category: '園グッズ', name: '上履き袋', unitPrice: 300 },
    { id: '古園服::冬服ブレザー', category: '古園服', name: '冬服ブレザー', unitPrice: 400 },
    { id: '古園服::冬服ブラウス', category: '古園服', name: '冬服ブラウス', unitPrice: 200 },
  ]);
  assert.equal(result.stats.accepted, 4);
});

test('parseProductText accepts negative unit price in normalized CSV', () => {
  const result = Core.parseProductText([
    'カテゴリ,商品名,単価',
    '他,ありがとうチケット,-50',
  ].join('\n'));

  assert.equal(result.products[0].unitPrice, -50);
  assert.equal(result.products[0].name, 'ありがとうチケット');
});

test('parseProductText keeps optional CSV icons', () => {
  const result = Core.parseProductText('カテゴリ,商品名,単価,アイコン\n園グッズ,手提げ,500,👜');
  assert.deepEqual(result.products[0], {
    id: '園グッズ::手提げ',
    category: '園グッズ',
    name: '手提げ',
    unitPrice: 500,
    icon: '👜',
  });
});

test('productsToCsv exports products in a re-importable normalized format', () => {
  const csv = Core.productsToCsv([
    { id: 'product-tote', category: '園グッズ', name: '手提げ', unitPrice: 500, icon: '👜', stockLimit: 20 },
    { id: 'product-blazer', category: '古園服', name: '冬服ブレザー', unitPrice: 400, iconPath: 'assets/icons/winter-blazer.png' },
  ]);

  assert.equal(csv, [
    'カテゴリ,商品名,単価,アイコン,アイコンパス,在庫上限,商品ID',
    '園グッズ,手提げ,500,👜,,20,product-tote',
    '古園服,冬服ブレザー,400,,assets/icons/winter-blazer.png,,product-blazer',
  ].join('\r\n'));
  assert.deepEqual(Core.parseProductText(csv).products, [
    { id: 'product-tote', category: '園グッズ', name: '手提げ', unitPrice: 500, icon: '👜', stockLimit: 20 },
    { id: 'product-blazer', category: '古園服', name: '冬服ブレザー', unitPrice: 400, iconPath: 'assets/icons/winter-blazer.png' },
  ]);
});

test('settings bundle preserves products, custom icons, and portable settings', () => {
  const json = Core.settingsBundleToJson([
    { id: 'custom-1', category: '園グッズ', name: '手提げ', unitPrice: 500, icon: 'data:image/png;base64,AAAA' },
    { id: 'custom-2', category: '古園服', name: '冬服', unitPrice: 400, iconPath: 'assets/icons/winter-blazer.png' },
  ], {
    enabled: true,
    category: '古園服',
    siblings: 2,
    perSibling: 4,
    productColumnWidth: 'standard',
    autoBackupEnabled: true,
    autoBackupIntervalMinutes: 5,
    autoBackupLastAt: 'not-portable',
  });

  const parsed = Core.parseSettingsBundle(json);

  assert.deepEqual(parsed.warnings, []);
  assert.deepEqual(parsed.products, [
    { id: 'custom-1', category: '園グッズ', name: '手提げ', unitPrice: 500, icon: 'data:image/png;base64,AAAA' },
    { id: 'custom-2', category: '古園服', name: '冬服', unitPrice: 400, iconPath: 'assets/icons/winter-blazer.png' },
  ]);
  assert.deepEqual(parsed.settings, {
    enabled: true,
    category: '古園服',
    siblings: 2,
    perSibling: 4,
    productColumnWidth: 'standard',
    autoBackupEnabled: true,
    autoBackupIntervalMinutes: 5,
  });
  assert.doesNotMatch(json, /not-portable/);
});

test('settings bundle carries inventory counts and adjustment history without sales transactions', () => {
  const inventory = {
    salesByProduct: { 'p1': 7 },
    remainingByProduct: { 'p1': 3 },
    adjustments: [{ id: 'a1', productId: 'p1', productName: '手提げ', recordedAt: '2026-10-15T01:00:00.000Z', before: 4, after: 3 }],
  };
  const json = Core.settingsBundleToJson([{ id: 'p1', category: '園グッズ', name: '手提げ', unitPrice: 500, stockLimit: 10 }], {
    enabled: true, category: '古園服', siblings: 1, perSibling: 4,
  }, inventory);
  const parsed = Core.parseSettingsBundle(json);
  assert.equal(JSON.parse(json).version, 2);
  assert.deepEqual(parsed.inventory, inventory);
  assert.equal(Object.hasOwn(parsed, 'transactions'), false);
});

test('parseProductText reports invalid and duplicate rows', () => {
  const result = Core.parseProductText([
    'カテゴリ,商品名,単価',
    '園グッズ,手提げ,500',
    '園グッズ,空欄,',
    '園グッズ,壊れた価格,abc',
    '園グッズ,手提げ,550',
  ].join('\n'));

  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].unitPrice, 550);
  assert.equal(result.stats.rejected, 2);
  assert.equal(result.stats.duplicates, 1);
  assert.equal(result.warnings.length, 2);
});

test('calculateCart returns subtotals, item count, and total', () => {
  const result = Core.calculateCart([
    { product: Core.makeProduct('園グッズ', '手提げ', 500), quantity: 2 },
    { product: Core.makeProduct('他', 'ありがとうチケット', -50), quantity: 1 },
  ]);

  assert.deepEqual(result.lineItems, [
    { category: '園グッズ', name: '手提げ', unitPrice: 500, quantity: 2, subtotal: 1000, productId: '園グッズ::手提げ' },
    { category: '他', name: 'ありがとうチケット', unitPrice: -50, quantity: 1, subtotal: -50, productId: '他::ありがとうチケット' },
  ]);
  assert.equal(result.itemCount, 3);
  assert.equal(result.total, 950);
});

test('buildTransaction calculates change and rejects insufficient payment', () => {
  const lines = [{ product: Core.makeProduct('園グッズ', '手提げ', 500), quantity: 2 }];
  const transaction = Core.buildTransaction({
    id: 'tx-1',
    recordedAt: '2026-10-12T01:00:00.000Z',
    lines,
    received: 1200,
  });

  assert.equal(transaction.total, 1000);
  assert.equal(transaction.received, 1200);
  assert.equal(transaction.change, 200);
  assert.throws(() => Core.buildTransaction({
    id: 'tx-2', recordedAt: transaction.recordedAt, lines, received: 999,
  }), /不足/);
});

test('summarizeTransactions aggregates today and all periods', () => {
  const transactions = [
    {
      id: 'today', recordedAt: '2026-10-12T03:00:00.000Z', total: 950, received: 1000, change: 50, itemCount: 3,
      items: [
        { category: '園グッズ', name: '手提げ', unitPrice: 500, quantity: 2, subtotal: 1000 },
        { category: '他', name: 'ありがとうチケット', unitPrice: -50, quantity: 1, subtotal: -50 },
      ],
    },
    {
      id: 'yesterday', recordedAt: '2026-10-11T03:00:00.000Z', total: 300, received: 300, change: 0, itemCount: 1,
      items: [{ category: '園グッズ', name: '上履き袋', unitPrice: 300, quantity: 1, subtotal: 300 }],
    },
  ];

  const today = Core.summarizeTransactions(transactions, 'today', new Date('2026-10-12T12:00:00.000Z'));
  assert.equal(today.totalSales, 950);
  assert.equal(today.transactionCount, 1);
  assert.equal(today.itemCount, 3);
  assert.equal(today.averageTransaction, 950);
  assert.equal(today.daily[0].sales, 950);
  assert.equal(today.hourly.length, 24);
  assert.equal(today.hourly.reduce((sum, hour) => sum + hour.transactionCount, 0), 1);
  const todayCategoryHour = today.hourlyCategories.find((hour) => hour.hour === new Date(transactions[0].recordedAt).getHours());
  assert.deepEqual(todayCategoryHour.categories.map(({ category, quantity, sales }) => ({ category, quantity, sales })), [
    { category: '園グッズ', quantity: 2, sales: 1000 },
    { category: '他', quantity: 1, sales: -50 },
  ]);
  const todayProductHour = today.hourlyProducts.find((hour) => hour.hour === new Date(transactions[0].recordedAt).getHours());
  assert.deepEqual(todayProductHour.products.map(({ category, name, quantity, sales }) => ({ category, name, quantity, sales })), [
    { category: '園グッズ', name: '手提げ', quantity: 2, sales: 1000 },
    { category: '他', name: 'ありがとうチケット', quantity: 1, sales: -50 },
  ]);
  assert.equal(today.products[0].name, '手提げ');

  const todayHour = new Date(transactions[0].recordedAt).getHours();
  const filteredToday = Core.summarizeTransactions(transactions, 'today', new Date('2026-10-12T12:00:00.000Z'), { startHour: todayHour, endHour: todayHour });
  assert.equal(filteredToday.totalSales, 950);

  const week = Core.summarizeTransactions([
    transactions[0],
    { ...transactions[1], recordedAt: '2026-10-13T03:00:00.000Z' },
  ], 'week', new Date('2026-10-12T12:00:00.000Z'));
  assert.equal(week.transactionCount, 2);

  const month = Core.summarizeTransactions(transactions, 'month', new Date('2026-10-12T12:00:00.000Z'));
  assert.equal(month.transactionCount, 2);

  const all = Core.summarizeTransactions(transactions, 'all', new Date('2026-10-12T12:00:00.000Z'));
  assert.equal(all.totalSales, 1250);
  assert.equal(all.transactionCount, 2);
  assert.equal(all.averageTransaction, 625);
  assert.equal(all.categories.find((item) => item.category === '園グッズ').sales, 1300);
});

test('summarizeWeekdayHours groups transactions by local weekday and hour with period filters', () => {
  const at = (year, month, day, hour, minute = 0) => new Date(year, month, day, hour, minute).toISOString();
  const transactions = [
    { id: 'mon-1', recordedAt: at(2026, 9, 12, 9), total: 500, itemCount: 1 },
    { id: 'mon-2', recordedAt: at(2026, 9, 12, 9, 30), total: 300, itemCount: 2 },
    { id: 'tue', recordedAt: at(2026, 9, 13, 10), total: 100, itemCount: 1 },
    { id: 'outside-hours', recordedAt: at(2026, 9, 13, 11), total: 200, itemCount: 1 },
    { id: 'outside-week', recordedAt: at(2026, 9, 5, 9), total: 900, itemCount: 4 },
  ];
  const summary = Core.summarizeWeekdayHours(transactions, 'week', new Date(2026, 9, 13, 12), { startHour: 9, endHour: 10 });
  const monday = summary.weekdays.find((day) => day.weekday === 1);
  const tuesday = summary.weekdays.find((day) => day.weekday === 2);
  assert.equal(monday.hours[9].transactionCount, 2);
  assert.equal(monday.hours[9].sales, 800);
  assert.equal(tuesday.hours[10].transactionCount, 1);
  assert.equal(summary.maxTransactions, 2);
  assert.equal(summary.weekdays.flatMap((day) => day.hours).reduce((count, hour) => count + hour.transactionCount, 0), 3);
});

test('transactionsToCsv creates one aggregation-friendly row per item', () => {
  const csv = Core.transactionsToCsv([{
    id: 'tx,1', recordedAt: '2026-10-12T12:00:00.000Z', total: 200, received: 200, change: 0, itemCount: 2,
    items: [
      { category: 'カテゴリ', name: '商品, "限定"', unitPrice: 100, quantity: 1, subtotal: 100, productId: 'product-1' },
      { category: 'カテゴリ2', name: '別商品', unitPrice: 50, quantity: 2, subtotal: 100, productId: 'product-2' },
    ],
  }]);

  const lines = csv.split('\r\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0], '会計ID,会計日時,会計日,週開始日,会計合計,お預かり,おつり,会計点数,明細番号,カテゴリ,商品名,単価,数量,売上金額,商品ID');
  assert.match(lines[1], /^"tx,1",2026-10-12T12:00:00\.000Z,2026-10-12,2026-10-12,200,200,0,2,1,カテゴリ,/);
  assert.match(lines[1], /"商品, ""限定""",100,1,100,product-1$/);
  assert.match(lines[2], /,200,200,0,2,2,カテゴリ2,別商品,50,2,100,product-2$/);
});

test('parseTransactionCsv restores complete transactions from exported CSV', () => {
  const source = [{
    id: 'tx-restore', recordedAt: '2026-10-12T12:00:00.000Z', total: 200, received: 300, change: 100, itemCount: 3,
    items: [
      { category: 'カテゴリ', name: '商品A', unitPrice: 100, quantity: 1, subtotal: 100 },
      { category: 'カテゴリ', name: '商品B', unitPrice: 50, quantity: 2, subtotal: 100 },
    ],
  }];

  const parsed = Core.parseTransactionCsv(Core.transactionsToCsv(source));
  assert.deepEqual(parsed.warnings, []);
  assert.deepEqual(parsed.transactions, source);
});

test('calculatePurchaseLimit applies an editable per-sibling category limit', () => {
  const lines = [
    { product: Core.makeProduct('古園服', '冬服ブレザー', 400), quantity: 3 },
    { product: Core.makeProduct('古園服', '夏服セーラー', 200), quantity: 2 },
    { product: Core.makeProduct('園グッズ', '手提げ', 500), quantity: 20 },
  ];

  const result = Core.calculatePurchaseLimit(lines, { enabled: true, category: '古園服', siblings: 1, perSibling: 4 });
  assert.deepEqual(result, { category: '古園服', count: 5, limit: 4, exceeded: true });
  assert.equal(Core.calculatePurchaseLimit(lines, { enabled: true, category: '古園服', siblings: 2, perSibling: 4 }).exceeded, false);
  assert.equal(Core.calculatePurchaseLimit(lines, { enabled: false, category: '古園服', siblings: 1, perSibling: 4 }).exceeded, false);
});

test('upsertTransaction replaces an edited transaction and removeTransaction deletes it', () => {
  const original = { id: 'tx-1', recordedAt: '2026-10-12T01:00:00.000Z', total: 500, received: 500, change: 0, itemCount: 1, items: [] };
  const edited = { ...original, total: 300, received: 500, change: 200 };
  assert.deepEqual(Core.upsertTransaction([original], edited), [edited]);
  assert.deepEqual(Core.upsertTransaction([original], { ...edited, id: 'tx-2' }), [original, { ...edited, id: 'tx-2' }]);
  const secondTransaction = { ...edited, id: 'tx-2' };
  assert.deepEqual(Core.removeTransaction([original, secondTransaction], 'tx-1'), [secondTransaction]);
});

test('inventory ledger tracks sales separately and restores stock when a sale is removed', () => {
  const product = { id: 'p1', category: '園グッズ', name: '手提げ', unitPrice: 500, stockLimit: 5 };
  const sale = { id: 'tx1', items: [{ productId: 'p1', category: '園グッズ', name: '手提げ', quantity: 2 }] };
  const ledger = Core.createInventoryLedger([product], [sale]);
  assert.equal(ledger.salesByProduct.p1, 2);
  assert.equal(ledger.remainingByProduct.p1, 3);

  const changedSale = { ...sale, items: [{ ...sale.items[0], quantity: 3 }] };
  const afterEdit = Core.applyInventoryTransactionChange(ledger, sale, changedSale, [product]);
  assert.equal(afterEdit.salesByProduct.p1, 3);
  assert.equal(afterEdit.remainingByProduct.p1, 2);

  const afterDelete = Core.applyInventoryTransactionChange(afterEdit, changedSale, null, [product]);
  assert.equal(afterDelete.salesByProduct.p1, 0);
  assert.equal(afterDelete.remainingByProduct.p1, 5);
});

test('inventory availability summary uses the lower of physical and sales-limit remaining', () => {
  const products = [
    { id: 'limited-a', category: '園グッズ', name: '手提げ', stockLimit: 10 },
    { id: 'limited-b', category: '園グッズ', name: 'コップ袋', stockLimit: 0 },
    { id: 'unlimited', category: 'その他', name: 'チケット' },
  ];
  const summary = Core.summarizeInventoryAvailability(products, {
    salesByProduct: { 'limited-a': 6 },
    remainingByProduct: { 'limited-a': 2 },
  });
  assert.deepEqual(summary.map(({ product, total, sold, remaining, soldPercent }) => ({ id: product.id, total, sold, remaining, soldPercent })), [
    { id: 'limited-a', total: 10, sold: 6, remaining: 2, soldPercent: 80 },
    { id: 'limited-b', total: 0, sold: 0, remaining: 0, soldPercent: 0 },
  ]);
});

test('inventory adjustment is recorded separately from transaction data', () => {
  const ledger = Core.createInventoryLedger([{ id: 'p1', name: '手提げ', stockLimit: 5 }], []);
  const adjusted = Core.adjustInventory(ledger, 'p1', '手提げ', 3, new Date('2026-10-15T01:00:00.000Z'));
  assert.equal(adjusted.remainingByProduct.p1, 3);
  assert.equal(adjusted.adjustments.length, 1);
  assert.equal(adjusted.adjustments[0].before, 5);
  assert.equal(adjusted.adjustments[0].after, 3);
  assert.throws(() => Core.adjustInventory(ledger, 'p1', '手提げ', -1), /0以上/);
});

test('daily close report summarizes a selected local day and product sales', () => {
  const today = new Date(2026, 9, 15, 12, 0, 0).toISOString();
  const report = Core.dailyCloseReport([{
    id: 'tx1', recordedAt: today, total: 500, received: 1000, change: 500, itemCount: 1,
    items: [{ category: '園グッズ', name: '手提げ', productId: 'p1', quantity: 1, unitPrice: 500, subtotal: 500 }],
  }], '2026-10-15');
  assert.equal(report.transactionCount, 1);
  assert.equal(report.totalSales, 500);
  assert.equal(report.totalReceived, 1000);
  assert.match(report.csv, /商品別,2026-10-15,園グッズ,手提げ/);
});

