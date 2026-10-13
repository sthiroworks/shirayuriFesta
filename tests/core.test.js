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
    { category: '園グッズ', name: '手提げ', unitPrice: 500, icon: '👜' },
    { category: '古園服', name: '冬服ブレザー', unitPrice: 400, iconPath: 'assets/icons/winter-blazer.png' },
  ]);

  assert.equal(csv, [
    'カテゴリ,商品名,単価,アイコン,アイコンパス',
    '園グッズ,手提げ,500,👜,',
    '古園服,冬服ブレザー,400,,assets/icons/winter-blazer.png',
  ].join('\r\n'));
  assert.deepEqual(Core.parseProductText(csv).products, [
    { id: '園グッズ::手提げ', category: '園グッズ', name: '手提げ', unitPrice: 500, icon: '👜' },
    { id: '古園服::冬服ブレザー', category: '古園服', name: '冬服ブレザー', unitPrice: 400, iconPath: 'assets/icons/winter-blazer.png' },
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
    { category: '園グッズ', name: '手提げ', unitPrice: 500, quantity: 2, subtotal: 1000 },
    { category: '他', name: 'ありがとうチケット', unitPrice: -50, quantity: 1, subtotal: -50 },
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

test('transactionsToCsv creates one aggregation-friendly row per item', () => {
  const csv = Core.transactionsToCsv([{
    id: 'tx,1', recordedAt: '2026-10-12T12:00:00.000Z', total: 200, received: 200, change: 0, itemCount: 2,
    items: [
      { category: 'カテゴリ', name: '商品, "限定"', unitPrice: 100, quantity: 1, subtotal: 100 },
      { category: 'カテゴリ2', name: '別商品', unitPrice: 50, quantity: 2, subtotal: 100 },
    ],
  }]);

  const lines = csv.split('\r\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0], '会計ID,会計日時,会計日,週開始日,会計合計,お預かり,おつり,会計点数,明細番号,カテゴリ,商品名,単価,数量,売上金額');
  assert.match(lines[1], /^"tx,1",2026-10-12T12:00:00\.000Z,2026-10-12,2026-10-12,200,200,0,2,1,カテゴリ,/);
  assert.match(lines[1], /"商品, ""限定""",100,1,100$/);
  assert.match(lines[2], /,200,200,0,2,2,カテゴリ2,別商品,50,2,100$/);
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

