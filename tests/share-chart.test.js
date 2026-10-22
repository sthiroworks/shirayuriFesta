const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../core.js');

const renderers = ['', 'dist/'].map((directory) => {
  const source = fs.readFileSync(path.join(__dirname, '..', directory, 'app.js'), 'utf8');
  // Exercise the actual SVG renderer without starting the app or writing browser storage.
  const helpers = source.slice(source.indexOf('  function escapeHtml('), source.indexOf('  function formatDate('));
  const charts = source.slice(source.indexOf('  function renderShareChart('), source.indexOf('  function renderHistory('));
  const render = vm.runInNewContext(helpers + charts + '\nrenderShareChart;');
  return (products, metric, existingElement) => {
    const element = existingElement || { innerHTML: '', attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
    render(element, products, metric);
    return element;
  };
});

function legendColors(markup) {
  return new Map([...markup.matchAll(/<rect class="share-legend-swatch"[^>]*fill="([^"]+)"\/><text class="share-legend-label"[^>]*><title>([^<]+)<\/title>/g)]
    .map((match) => [match[2], match[1]]));
}

test('quantity composition weights units rather than revenue and preserves matching product colors', () => {
  const products = Object.freeze([
    Object.freeze({ name: '高単価商品', quantity: 1, sales: 900 }),
    Object.freeze({ name: '個数の多い商品', quantity: 9, sales: 100 }),
    Object.freeze({ name: '未販売の商品', quantity: 0, sales: 0 }),
  ]);
  for (const render of renderers) {
    const sales = render(products).innerHTML;
    const quantity = render(products, 'quantity').innerHTML;
    assert.match(sales, /高単価商品: 90%・1個/);
    assert.match(quantity, /高単価商品: 10%・1個/);
    assert.match(quantity, /個数の多い商品: 90%・9個/);
    assert.match(quantity, />販売数合計<\/text>/);
    assert.match(quantity, /class="share-total-value"[^>]*>10個<\/text>/);
    assert.match(sales, /class="share-total-value"[^>]*>¥1,000<\/text>/);
    assert.doesNotMatch(quantity, /未販売の商品/);
    for (const [name, color] of legendColors(sales)) assert.equal(legendColors(quantity).get(name), color);
  }
});

test('zero-priced and discount items still contribute their units to quantity composition', () => {
  const products = [
    { name: '無料商品', quantity: 3, sales: 0 },
    { name: '割引チケット', quantity: 1, sales: -50 },
  ];
  for (const render of renderers) {
    const quantity = render(products, 'quantity').innerHTML;
    assert.match(quantity, /無料商品: 75%・3個/);
    assert.match(quantity, /割引チケット: 25%・1個/);
    assert.match(quantity, /class="share-total-value"[^>]*>4個<\/text>/);
    assert.doesNotMatch(quantity, /NaN|Infinity/);
    const sales = render(products).innerHTML;
    assert.match(sales, /class="share-total-value"[^>]*>¥0<\/text>/);
    assert.doesNotMatch(sales, /class="share-slice"/);
  }
});

test('quantity composition handles a single sold product and resets correctly when data is cleared', () => {
  for (const render of renderers) {
    const chart = render([{ name: 'ひとつの商品', quantity: 7, sales: 0 }], 'quantity');
    assert.match(chart.innerHTML, /<circle class="share-slice"/);
    assert.match(chart.innerHTML, /ひとつの商品: 100%・7個/);
    chart.attributes.viewBox = '0 0 760 1400';
    render([], 'quantity', chart);
    assert.equal(chart.attributes.viewBox, '0 0 760 360');
    assert.match(chart.innerHTML, /確定した会計/);
    assert.doesNotMatch(chart.innerHTML, /share-slice|share-legend/);
  }
});

test('quantity composition keeps every product and gives small shares leader-line labels', () => {
  const products = [
    { name: '主な商品', quantity: 990, sales: 9900 },
    ...Array.from({ length: 10 }, (_, index) => ({ name: '少数商品' + index, quantity: 1, sales: 1 })),
    { name: '<小花&限定>', quantity: 0, sales: 0 },
  ];
  for (const render of renderers) {
    const chart = render(products, 'quantity');
    assert.equal(legendColors(chart.innerHTML).size, 11);
    assert.equal((chart.innerHTML.match(/class="share-leader-line"/g) || []).length, 10);
    for (let index = 0; index < 10; index += 1) assert.ok(chart.innerHTML.includes('少数商品' + index + ': 0.10%・1個'));
    assert.match(chart.innerHTML, /class="share-total-value"[^>]*>1,000個<\/text>/);
    assert.doesNotMatch(chart.innerHTML, /その他|NaN|Infinity/);
    const escaped = render([{ name: '<小花&限定>', quantity: 1, sales: 10 }], 'quantity').innerHTML;
    assert.match(escaped, /&lt;小花&amp;限定&gt;/);
    assert.doesNotMatch(escaped, /<小花/);
  }
});

test('quantity composition uses the same period and time-filtered totals as the dashboard', () => {
  const at = (day, hour) => new Date(2026, 9, day, hour).toISOString();
  const makeTransaction = (id, day, hour, quantity) => ({
    id, recordedAt: at(day, hour), itemCount: quantity, total: quantity * 200,
    items: [{ category: '園グッズ', name: id, quantity, subtotal: quantity * 200, unitPrice: 200 }],
  });
  const transactions = [
    makeTransaction('対象の会計', 23, 9, 4),
    makeTransaction('時間外の会計', 23, 10, 12),
    makeTransaction('前日の会計', 22, 9, 20),
  ];
  const summary = Core.summarizeTransactions(transactions, 'today', new Date(2026, 9, 23, 12), { startHour: 9, endHour: 9 });
  assert.equal(summary.itemCount, 4);
  for (const render of renderers) {
    const chart = render(summary.products, 'quantity').innerHTML;
    assert.match(chart, /対象の会計: 100%・4個/);
    assert.match(chart, /class="share-total-value"[^>]*>4個<\/text>/);
    assert.doesNotMatch(chart, /時間外の会計|前日の会計/);
  }
});
