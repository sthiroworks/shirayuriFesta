const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('browser workflow includes import, live aggregation, and CSV export paths', () => {
  const app = read('app.js');
  const html = read('index.html');
  assert.match(app, /FileReader/);
  assert.match(app, /parseProductText/);
  assert.match(app, /summarizeTransactions/);
  assert.match(app, /transactionsToCsv/);
  assert.match(app, /productsToCsv/);
  assert.match(app, /settingsBundleToJson/);
  assert.match(app, /parseSettingsBundle/);
  assert.match(app, /parseTransactionCsv/);
  assert.match(app, /new Blob/);
  assert.match(html, /商品一覧CSVを読み込む/);
  assert.match(html, /商品一覧CSVをダウンロード/);
  assert.match(html, /販売履歴を復元/);
  assert.match(html, /販売履歴をダウンロード/);
  assert.match(html, /レジ設定を復元/);
  assert.match(html, /レジ設定をダウンロード/);
  assert.match(html, /今日/);
  assert.match(html, /全期間/);
});

test('README documents the standard-library macOS workflow and CSV boundary', () => {
  const readme = read('README.md');
  assert.match(readme, /Safari|Chrome/);
  assert.match(readme, /CSV/);
  assert.match(readme, /XLSX/);
  assert.match(readme, /localStorage/);
});

