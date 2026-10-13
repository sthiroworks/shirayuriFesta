const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('index contains the checkout and dashboard interaction contract', () => {
  const html = read('index.html');
  for (const id of [
    'product-list', 'cart-list', 'received', 'exact-total', 'confirm-button', 'checkout-resize-handle', 'checkout-limit-badge',
    'sales-total', 'transaction-count', 'item-count', 'average-transaction',
    'category-summary', 'category-quantity-summary', 'sales-chart', 'quantity-chart', 'share-chart', 'daily-sales-chart', 'hourly-chart', 'hourly-metric', 'hourly-start-hour', 'hourly-end-hour', 'hourly-sort', 'hourly-hide-empty', 'hourly-table-body', 'hourly-table-foot', 'hourly-category-table-head', 'hourly-category-table-body', 'hourly-category-table-foot', 'hourly-product-table-head', 'hourly-product-table-body', 'hourly-product-table-foot', 'history-body', 'import-file', 'import-transactions-file',
    'tab-products', 'tab-chart', 'tab-history',
    'admin-toggle', 'admin-panel', 'product-management-panel', 'product-management-list',
    'export-products-csv',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  assert.match(html, /core\.js[\s\S]*storage\.js[\s\S]*products\.default\.js[\s\S]*app\.js/);
  assert.match(html, /id="sales-summary" class="summary-grid"/);
  assert.ok(html.indexOf('id="sales-summary"') > html.indexOf('class="tab-list"'), 'summary cards share the tab area');
  assert.match(html, /<option value="week">今週<\/option>/);
  assert.match(html, /<option value="month">今月<\/option>/);
  assert.match(html, /class="analysis-time-filter"/);
  assert.match(html, /分析対象時間フィルタ/);
  assert.match(html, /時間帯分析フィルタ/);
  assert.match(html, /会計がない時間を隠す/);
  assert.match(html, /class="tabbed-results" data-sales-interface/);
  assert.match(html, /class="product-management-tools"/);
  assert.match(html, /class="backup-history-actions"/);
  assert.match(html, /class="[^"]*data-transfer-panel[^"]*"/);
  assert.match(html, /id="data-transfer-title"/);
  assert.doesNotMatch(html, /class="admin-toolbar"/);
  assert.match(html, /商品一覧CSVを読み込む/);
});

test('styles and app files are present and app uses the core and storage APIs', () => {
  const html = read('index.html');
  const css = read('styles.css');
  const app = read('app.js');
  assert.match(html, /styles\.css/);
  assert.match(css, /@media/);
  assert.match(css, /\.status:empty \{ display: none; \}/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /\.status \{ top: calc\(env\(safe-area-inset-top\) \+ 12px\); right: auto; bottom: auto; left: 50%;/);
  assert.match(css, /\.product-list \{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(var\(--product-card-min-width\), 1fr\)\);/);
  assert.match(css, /\.product-list \{ grid-template-columns: repeat\(var\(--product-grid-columns-mobile\), minmax\(0, 1fr\)\); gap: 7px;/);
  assert.match(css, /\.product-add-grid \{ grid-template-columns: 1fr; gap: 8px; \}/);
  assert.match(css, /\.page-shell:has\(> \.status:empty\) \{ padding-top: 0; \}/);
  assert.match(css, /\.admin-panel \.button, \.admin-panel \.managed-product-action \{ display: inline-flex;/);
  assert.match(app, /SalesRegisterCore/);
  assert.match(app, /SalesRegisterStorage/);
  assert.match(app, /transactionsToCsv/);
  assert.match(app, /activateTab/);
  assert.match(app, /renderHorizontalChart/);
  assert.match(app, /renderShareChart/);
  assert.match(app, /renderCategoryChart/);
  assert.match(app, /renderCategoryQuantityChart/);
  assert.match(app, /renderDailySalesChart/);
  assert.match(app, /renderHourlyChart/);
  assert.match(app, /renderHourlyTable/);
  assert.match(app, /renderHourlyCategoryTable/);
  assert.match(app, /renderHourlyProductTable/);
  assert.match(app, /hourlyCategories/);
  assert.match(app, /hourlyProducts/);
  assert.match(app, /getHourlyRows/);
  assert.match(app, /function setAdminMode\(isOpen\)/);
  assert.match(app, /classList\.toggle\('admin-mode', isOpen\)/);
  assert.match(html, /class="category-chart"/);
  assert.match(html, /class="analytics-chart-card category-summary"/);
});

test('app warns when browser persistence is unavailable and resets payment on import', () => {
  const html = read('index.html');
  const css = read('styles.css');
  const app = read('app.js');
  assert.match(app, /ブラウザの保存機能が利用できない/);
  assert.match(app, /statusTimer/);
  assert.match(app, /root\.clearTimeout\(state\.statusTimer\)/);
  assert.match(app, /root\.setTimeout\(\(\) =>/);
  assert.match(app, /state\.received = ''/);
  assert.match(html, /id="received"[^>]*readonly/);
  assert.match(html, /data-received-add="1000"/);
  assert.match(html, /data-received-action="clear"/);
  assert.match(app, /handleReceivedQuickAction/);
  assert.match(app, /setCheckoutHeight/);
  assert.match(app, /innerHeight \|\| 700\) \* \.5/);
  assert.match(css, /#checkout-panel \{ position: fixed;/);
  assert.match(css, /max-height: 50vh/);
  assert.match(css, /\.checkout-resize-handle \{ display: block;/);
  assert.match(css, /padding: 18px 12px calc\(var\(--checkout-space, 36vh\)/);
  assert.match(css, /@media \(min-width: 901px\)/);
  assert.match(css, /\.workspace-grid \{ grid-template-columns: minmax\(0, 3fr\) minmax\(420px, 1\.05fr\); \}/);
  assert.match(css, /\.checkout-panel \.cart-line \{ gap: 8px; padding: 8px 0;/);
  assert.match(css, /\.received-quick-buttons button\[data-received-add\] \{ flex: 1 1 0; \}/);
  assert.match(css, /#checkout-panel \.received-quick-buttons button \{ flex: 1 1 0; min-width: 0;/);
  assert.match(css, /\.received-quick-buttons button \{ min-width: 0; height: 42px;/);
  assert.match(css, /\.confirm-button \{ width: 100%; height: 60px;/);
  assert.match(css, /\.site-header \{ align-items: center; flex-direction: row; gap: 16px; \}/);
  assert.match(css, /\.header-actions \{ flex: 0 0 auto; justify-content: flex-end; margin-left: auto; \}/);
});

test('UI exposes editable limits, history actions, and replaceable product icons', () => {
  const html = read('index.html');
  const app = read('app.js');
  const core = read('core.js');
  const css = read('styles.css');
  for (const id of ['settings-panel', 'settings-enabled', 'settings-siblings', 'settings-per-sibling', 'settings-category', 'product-column-width', 'backup-settings-save', 'icon-file', 'product-add-form', 'product-add-category', 'product-add-new-category-field', 'product-add-new-category', 'product-add-name', 'product-add-price']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  assert.match(html, /<select id="settings-category"><\/select>/);
  assert.match(html, /class="catalog-panel-actions"/);
  assert.match(html, /<select id="product-add-category" required><\/select>/);
  assert.ok(html.indexOf('class="settings-data-actions"') < html.indexOf('class="backup-settings"'), 'restriction file actions stay with restriction settings');
  assert.match(app, /data-history-action/);
  assert.match(app, /data-management-action/);
  assert.match(app, /商品情報を反映/);
  assert.match(app, /data-management-field="name"/);
  assert.match(app, /data-management-field="category"/);
  assert.match(app, /data-management-field="new-category"/);
  assert.match(app, /function handleProductManagementChange/);
  assert.match(app, /function saveProductDetails/);
  assert.match(html, /制限設定を反映/);
  assert.match(html, /制限設定のバックアップ/);
  assert.match(html, /制限設定を復元/);
  assert.match(html, /制限設定をダウンロード/);
  assert.match(app, /function archiveSalesHistoryBackup/);
  assert.match(app, /shirayuri-sales-history-archive-/);
  assert.match(app, /バックアップCSVをアーカイブできなかったため/);
  assert.match(html, /自動バックアップ設定を保存/);
  assert.match(html, /同じ行の「商品情報を反映」を押してください/);
  assert.match(app, /const accessibleLabel = limitExceeded/);
  assert.match(app, /aria-label="\$\{escapeHtml\(accessibleLabel\)\}"/);
  assert.match(app, /renderProductManagement/);
  assert.match(app, /function exportProductsCsv\(\)/);
  assert.match(app, /function exportSettingsBundle\(\)/);
  assert.match(app, /function importSettingsBundle\(file\)/);
  assert.match(html, /id="import-settings-bundle-file"/);
  assert.match(html, /id="export-settings-bundle"/);
  assert.match(app, /renderProductAddCategories/);
  assert.match(app, /NEW_CATEGORY_VALUE/);
  assert.match(app, /readAsDataURL/);
  assert.match(app, /loadSettings/);
  assert.match(app, /productColumnWidth/);
  assert.match(core, /商品列幅/);
  assert.match(app, /autoBackupIntervalMinutes: 5/);
  assert.match(core, /autoBackupIntervalMinutes \|\| 5/);
  assert.match(app, /calculatePurchaseLimit/);
  assert.match(app, /has-quantity/);
  assert.match(app, /is-limit-exceeded/);
  assert.match(css, /\.product-card\.is-limit-exceeded/);
  assert.match(css, /\.checkout-panel\.is-limit-exceeded/);
  assert.match(app, /checkoutLimitBadge/);
  assert.match(app, /lineLimitExceeded/);
  assert.match(css, /\.cart-line\.is-limit-exceeded/);
  assert.match(css, /\.cart-line\.is-limit-exceeded \{ border-bottom-color/);
});

