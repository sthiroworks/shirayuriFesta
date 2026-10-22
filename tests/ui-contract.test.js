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
    'category-summary', 'category-quantity-summary', 'sales-chart', 'quantity-chart', 'share-chart', 'daily-sales-chart', 'inventory-chart-summary', 'inventory-chart', 'hourly-chart', 'hourly-metric', 'hourly-start-hour', 'hourly-end-hour', 'hourly-sort', 'hourly-hide-empty', 'hourly-table-body', 'hourly-table-foot', 'hourly-category-table-head', 'hourly-category-table-body', 'hourly-category-table-foot', 'hourly-product-table-head', 'hourly-product-table-body', 'hourly-product-table-foot', 'weekday-heatmap-head', 'weekday-heatmap-body', 'history-body', 'import-file', 'import-transactions-file',
    'tab-products', 'tab-chart', 'tab-history',
    'admin-toggle', 'admin-panel', 'product-management-panel', 'product-management-list', 'reset-inventory-period',
    'export-products-csv',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  assert.match(html, /core\.js[\s\S]*storage\.js[\s\S]*products\.default\.js[\s\S]*app\.js/);
  assert.match(html, /id="sales-summary" class="summary-grid"/);
  assert.match(html, /class="summary-cards-row"/);
  assert.ok(html.indexOf('id="sales-summary"') > html.indexOf('class="tab-list"'), 'summary cards share the tab area');
  assert.match(html, /<option value="week">今週<\/option>/);
  assert.match(html, /<option value="month">今月<\/option>/);
  assert.match(html, /class="analysis-time-filter"/);
  assert.match(html, /分析対象時間フィルタ/);
  assert.match(html, /時間帯分析フィルタ/);
  assert.match(html, /会計がない時間を隠す/);
  assert.match(html, /class="tabbed-results"\s+data-sales-interface/);
  assert.match(html, /class="product-management-tools"/);
  assert.match(html, /販売期間の切り替え/);
  assert.match(read('app.js'), /function resetInventoryPeriod\(/);
  assert.match(read('app.js'), /Core\.resetInventoryPeriod/);
  assert.match(read('app.js'), /persistSharedSnapshot\(\{ inventory: nextInventory \}/);
  assert.doesNotMatch(read('app.js'), /stockLimit = sales \+ value/);
  assert.match(read('app.js'), /function getProductPhysicalRemaining\(/);
  assert.match(read('app.js'), /手動調整済みの残数はそのまま保持/);
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
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"\s*\/>/);
  assert.match(css, /@media/);
  assert.match(css, /html \{ max-width: 100%; overflow-x: hidden;/);
  assert.match(css, /\.status:empty \{ display: none; \}/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /\.status \{ position: fixed; top: calc\(env\(safe-area-inset-top\) \+ 96px\);/);
  assert.match(css, /@media \(max-width: 560px\) \{[\s\S]*?\.status \{ top: calc\(env\(safe-area-inset-top\) \+ 76px\); right: auto; bottom: auto; left: 50%;/);
  assert.match(css, /\.product-list \{ display: grid; grid-template-columns: repeat\(var\(--product-grid-columns\), minmax\(0, 1fr\)\);/);
  assert.match(css, /\.product-list \{ grid-template-columns: repeat\(var\(--product-grid-columns-mobile\), minmax\(0, 1fr\)\); gap: 7px;/);
  assert.match(css, /\.product-add-grid \{ grid-template-columns: 1fr; gap: 8px; \}/);
  assert.match(css, /\.status \{ position: fixed;/);
  assert.doesNotMatch(css, /\.page-shell:has\(> \.status:empty\)/);
  assert.match(css, /\.admin-panel \.button, \.admin-panel \.managed-product-action \{ display: inline-flex;/);
  assert.match(app, /SalesRegisterCore/);
  assert.match(app, /SalesRegisterStorage/);
  assert.match(app, /transactionsToCsv/);
  assert.match(app, /activateTab/);
  assert.match(app, /function setupTabSwipe\(tabbedResults\)/);
  assert.match(app, /addEventListener\('touchstart'/);
  assert.match(app, /addEventListener\('touchstart',[\s\S]*?\{ passive: true, capture: true \}\)/);
  assert.match(app, /addEventListener\('touchmove',[\s\S]*?\{ passive: false, capture: true \}\)/);
  assert.match(app, /addEventListener\('touchend',[\s\S]*?\{ passive: false, capture: true \}\)/);
  assert.match(app, /Math\.abs\(deltaX\) >= 36/);
  assert.match(app, /Math\.abs\(deltaX\) >= Math\.abs\(deltaY\) \* 1\.15/);
  const ignoredSwipeTargets = app.match(/const ignoredTargets = '([^']+)';/)?.[1] ?? '';
  assert.doesNotMatch(ignoredSwipeTargets, /select|catalog-panel-actions/);
  assert.doesNotMatch(ignoredSwipeTargets, /button|input|select|(?:^|,\s*)a(?:,|$)/);
  assert.match(ignoredSwipeTargets, /\.chart-wrap/);
  assert.match(css, /\.tabbed-results button, \.tabbed-results input, \.tabbed-results select, \.tabbed-results textarea, \.tabbed-results a \{ touch-action: pan-y; \}/);
  assert.match(app, /if \(Math\.abs\(deltaX\) < 18\) return;/);
  assert.match(css, /\.catalog-panel-actions \{[^}]*touch-action: pan-y;/);
  assert.match(read('dist/styles.css'), /\.catalog-panel-actions \{[^}]*touch-action: pan-y;/);
  assert.match(app, /elements\.pageShell\.dataset\.activeTab = tabName/);
  assert.match(app, /tabbedResults\.addEventListener\('animationend'/);
  assert.match(app, /tabbedResults\.addEventListener\('touchmove'/);
  assert.match(app, /touchStart\.visualTarget\.style\.transform = `translate3d\(\$\{offset\}px, 0, 0\)`/);
  assert.match(app, /tabName === 'products' \? panel\?\.querySelector\('\.catalog-panel'\)/);
  assert.match(app, /resetSwipeTarget\(start\.visualTarget, true\)/);
  assert.match(app, /event\.target\.classList\.remove\('is-swipe-enter-from-left', 'is-swipe-enter-from-right'\)/);
  assert.match(css, /\.is-swipe-dragging \{ transition: none !important; will-change: transform, opacity; \}/);
  assert.match(css, /\.is-swipe-settling \{ transform: translate3d\(0, 0, 0\); opacity: 1; transition:/);
  assert.match(css, /\.page-shell\[data-active-tab="chart"\]/);
  assert.match(css, /\.page-shell\[data-active-tab="history"\]/);
  const distApp = read('dist/app.js');
  assert.match(distApp, /function setupTabSwipe\(tabbedResults\)/);
  assert.match(app, /\.hourly-product-table-scroll/);
  assert.match(app, /activateTab\(tabs\[nextIndex\], deltaX < 0 \? 'right' : 'left'\)/);
  assert.match(app, /const animationTarget = panel\.dataset\.tabPanel === 'products'[\s\S]*?panel\.querySelector\('\.catalog-panel'\)/);
  assert.match(app, /animationTarget\.classList\.add\(`is-swipe-enter-from-\$\{swipeEnterFrom\}`\)/);
  assert.match(css, /\.tab-panel \.is-swipe-enter-from-left \{ animation:/);
  assert.match(css, /\.tab-panel \.is-swipe-enter-from-right \{ animation:/);
  assert.doesNotMatch(css, /\.tab-panel\.is-swipe-enter-from-(?:left|right)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(app, /renderHorizontalChart/);
  assert.match(app, /renderShareChart/);
  const horizontalChart = app.match(/function renderHorizontalChart\([\s\S]*?\n  function renderChart/)?.[0] ?? '';
  assert.match(horizontalChart, /\.filter\(\(product\) => Number\(product\.quantity\) > 0\)/);
  assert.match(horizontalChart, /element\.innerHTML = [\s\S]*?\$\{rows\}/);
  assert.doesNotMatch(horizontalChart, /\$\{bars\}/);
  assert.doesNotMatch(app.match(/function renderHorizontalChart\([\s\S]*?\n  function renderChart/)?.[0] ?? '', /\.slice\(0, 8\)/);
  assert.doesNotMatch(app.match(/function renderShareChart\([\s\S]*?\n  function polarPoint/)?.[0] ?? '', /\.slice\(0, 7\)|その他/);
  assert.match(app, /function renderShareChart\(element, products\)[\s\S]*?\.filter\(\(product\) => Number\(product\.quantity\) > 0\)/);
  assert.match(app, /function chartLabelLines\(/);
  assert.match(app, /renderCategoryChart/);
  assert.match(app, /renderCategoryQuantityChart/);
  assert.match(app, /renderDailySalesChart/);
  assert.match(app, /renderInventoryChart/);
  assert.match(app, /renderWeekdayHeatmap/);
  assert.match(app, /renderHourlyChart/);
  assert.match(app, /renderHourlyTable/);
  assert.match(app, /renderHourlyCategoryTable/);
  assert.match(app, /renderHourlyProductTable/);
  assert.match(app, /hourlyCategories/);
  assert.match(app, /hourlyProducts/);
  assert.match(app, /getHourlyRows/);
  assert.match(app, /summarizeWeekdayHours/);
  assert.match(app, /function setAdminMode\(isOpen\)/);
  assert.match(app, /classList\.toggle\('admin-mode', isOpen\)/);
  assert.match(html, /class="category-chart"/);
  assert.match(html, /class="analytics-chart-card category-summary"/);
  assert.match(html, /aria-labelledby="inventory-chart-title"/);
  assert.match(html, /class="weekday-heatmap-scroll"/);
  assert.match(css, /\.weekday-heatmap-card \{ grid-column: 1 \/ -1; \}/);
  assert.match(css, /\.inventory-chart-row\.is-low \.inventory-chart-bar/);
  assert.match(css, /\.inventory-chart-label strong \{[^}]*overflow-wrap: anywhere;/);
  const distHorizontalChart = distApp.match(/function renderHorizontalChart\([\s\S]*?\n  function renderChart/)?.[0] ?? '';
  assert.match(distHorizontalChart, /\.filter\(\(product\) => Number\(product\.quantity\) > 0\)/);
  assert.match(distHorizontalChart, /element\.innerHTML = [\s\S]*?\$\{rows\}/);
  assert.doesNotMatch(distHorizontalChart, /\$\{bars\}/);
  assert.match(distApp, /if \(Math\.abs\(deltaX\) < 18\) return;/);
  const distIgnoredSwipeTargets = distApp.match(/const ignoredTargets = '([^']+)';/)?.[1] ?? '';
  assert.doesNotMatch(distIgnoredSwipeTargets, /button|input|select/);
});

test('checkout limit reset sits immediately before the sibling stepper', () => {
  for (const directory of ['', 'dist/']) {
    const html = read(`${directory}index.html`);
    const adjustmentStart = html.indexOf('id="checkout-limit-adjustment"');
    const resetIndex = html.indexOf('id="checkout-limit-reset"', adjustmentStart);
    const stepperIndex = html.indexOf('class="checkout-limit-stepper"', adjustmentStart);
    assert.ok(adjustmentStart >= 0 && resetIndex > adjustmentStart && resetIndex < stepperIndex);
    assert.doesNotMatch(read(`${directory}styles.css`), /#checkout-panel \.checkout-limit-reset \{[^}]*flex-basis:\s*100%/);
  }
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
  assert.match(html, /id="received"[^>]*inputmode="numeric"/);
  assert.doesNotMatch(html.match(/<input id="received"[^>]*>/)?.[0] ?? '', /readonly/);
  assert.match(html, /data-received-add="1000"/);
  assert.match(html, /data-received-action="clear"/);
  assert.match(html, /class="received-label-row"[\s\S]*?data-received-action="clear"[\s\S]*?<\/div>/);
  assert.match(html, /class="received-quick-buttons"[\s\S]*?id="exact-total"/);
  assert.match(html, /id="mobile-checkout-bar"[\s\S]*?id="mobile-checkout-open"[\s\S]*?会計に進む/);
  assert.match(html, /class="checkout-actions-footer"[\s\S]*?id="confirm-button"[\s\S]*?id="mobile-checkout-close"[\s\S]*?id="clear-cart"/);
  assert.match(html, /id="clear-cart-dialog"[\s\S]*?id="clear-cart-dialog-cancel"[\s\S]*?id="clear-cart-dialog-confirm"/);
  assert.match(app, /function setMobileCheckoutOpen\(/);
  assert.match(app, /function handleMobileCheckoutKeydown\(/);
  assert.match(app, /elements\.mobileCartTotal\.textContent = formatYen\(cart\.total\)/);
  assert.match(app, /handleReceivedQuickAction/);
  assert.match(app, /setCheckoutHeight/);
  assert.match(app, /fitCheckoutHeightAfterClear: false/);
  assert.match(app, /function fitCheckoutHeightToContent\(\) \{[\s\S]*?buttonRect\.bottom - panelRect\.top[\s\S]*?if \(contentHeight < state\.checkoutHeight\) setCheckoutHeight\(contentHeight\);/);
  assert.match(app, /function clearCartState\(\) \{[\s\S]*?state\.fitCheckoutHeightAfterClear = state\.checkoutHeight != null;/);
  assert.match(app, /function renderAll\(\) \{[\s\S]*?if \(state\.fitCheckoutHeightAfterClear && fitCheckoutHeightToContent\(\)\) state\.fitCheckoutHeightAfterClear = false;/);
  assert.match(app, /Math\.max\(minimum, Math\.floor\(\(root\.innerHeight \|\| 700\) \* 0\.9\)\)/);
  assert.match(css, /#checkout-panel\.is-mobile-open \{ position: fixed; inset: 0;[^}]*width: auto; height: auto; min-width: 0; min-height: 0;/);
  assert.match(css, /#checkout-panel\.is-mobile-open \{[^}]*flex-direction: column;/);
  assert.match(css, /\.checkout-actions-footer \{ flex: 0 0 auto;[^}]*safe-area-inset-bottom/);
  assert.match(css, /\.checkout-actions-footer \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 2\.2fr\); grid-template-rows: repeat\(2, minmax\(38px, 1fr\)\)/);
  assert.match(css, /\.checkout-footer-secondary \{ display: grid; grid-column: 1; grid-row: 1 \/ span 2;/);
  assert.match(css, /#checkout-panel \.checkout-actions-footer \.confirm-button \{ grid-column: 2; grid-row: 1 \/ span 2; height: auto; min-height: 81px;/);
  assert.match(css, /#checkout-panel \.payment-box \{ display: grid; grid-template-columns: minmax\(112px, 1fr\) minmax\(0, 2\.2fr\); grid-template-areas: "label quick" "received quick" "change quick"/);
  assert.match(css, /#checkout-panel \.change-row span \{ font-size: \.72rem; \}/);
  assert.match(css, /\.checkout-resize-handle \{ display: none; \}/);
  assert.match(css, /\.checkout-scroll-area \{[^}]*display: flex;[^}]*flex-direction: column;[^}]*overflow-x: hidden; overflow-y: auto;/);
  assert.match(css, /\.checkout-scroll-area \{[^}]*width: 100%; min-width: 0;/);
  assert.match(css, /\.checkout-actions-footer \{ flex: 0 0 auto; min-width: 0;/);
  assert.match(css, /#checkout-panel\.is-mobile-open #cart-list \{ flex: 1 1 0; min-height: 44px; overflow-y: auto;/);
  assert.match(html, /id="checkout-resize-handle"[\s\S]*?<\/button>\s*<div class="checkout-scroll-area">/);
  assert.match(css, /\.page-shell \{ padding: 18px 12px calc\(82px \+ env\(safe-area-inset-bottom\)\); \}/);
  assert.match(css, /\.page-shell\.mobile-checkout-open \.mobile-checkout-bar \{ display: none; \}/);
  assert.match(css, /@media \(min-width: 901px\)/);
  assert.match(css, /\.workspace-grid \{ grid-template-columns: minmax\(0, 3fr\) minmax\(420px, 1\.05fr\); \}/);
  assert.match(css, /\.checkout-panel \.cart-line \{ gap: 8px; padding: 8px 0;/);
  assert.match(app, /class="cart-line-icon" aria-hidden="true"/);
  assert.match(app, /const itemName = productNameText\(item\.name\) \? item\.name : \(cartProduct && cartProduct\.name\) \|\| '商品'/);
  assert.match(css, /\.cart-line-icon \{ display: grid; flex: 0 0 38px;/);
  assert.match(css, /\.received-quick-buttons \{ display: grid; grid-template-columns: repeat\(6, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.received-quick-buttons button\[data-received-add\] \{[^}]*flex: 1 1 0;/);
  assert.match(css, /#checkout-panel \.received-quick-buttons button \{ flex: 1 1 0; min-width: 0;/);
  assert.match(css, /\.received-quick-buttons button \{ min-width: 0; height: 50px;/);
  assert.match(css, /#exact-total \{ border: 1px solid #[\da-f]{6}; color: var\(--teal\); background: #[\da-f]{6}; \}/i);
  assert.match(css, /#checkout-panel \.payment-box \{[^}]*grid-template-columns: minmax\(112px, 1fr\) minmax\(0, 2\.2fr\); grid-template-areas: "label quick" "received quick" "change quick" "message message";/);
  assert.match(css, /#checkout-panel \.received-label-row \{ grid-area: label; margin: 0; \}/);
  assert.match(css, /#checkout-panel \.received-quick-buttons \{ grid-area: quick; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); grid-template-rows: repeat\(2, 48px\);/);
  assert.match(css, /\.confirm-button \{ width: 100%; height: 60px;/);
  assert.match(css, /\.site-header \{ align-items: center; flex-direction: row; gap: 16px; \}/);
  assert.match(css, /\.header-actions \{ flex: 0 0 auto; justify-content: flex-end; margin-left: auto; \}/);
});

test('UI exposes editable limits, history actions, and replaceable product icons', () => {
  const html = read('index.html');
  const app = read('app.js');
  const core = read('core.js');
  const css = read('styles.css');
  for (const id of ['settings-panel', 'settings-enabled', 'settings-siblings', 'settings-per-sibling', 'settings-category', 'product-column-width', 'category-filter-options', 'category-filter-summary-count', 'backup-settings-save', 'icon-file', 'product-add-form', 'product-add-category', 'product-add-new-category-field', 'product-add-new-category', 'product-add-name', 'product-add-price']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  assert.match(html, /<select id="settings-category"><\/select\s*>/);
  assert.match(html, /class="catalog-panel-actions"/);
  assert.match(html, /class="category-filter-control"/);
  assert.match(html, /<select id="product-add-category" required><\/select\s*>/);
  assert.ok(html.indexOf('class="settings-data-actions"') < html.indexOf('class="backup-settings"'), 'restriction file actions stay with restriction settings');
  assert.match(app, /data-history-action/);
  assert.match(app, /data-management-action/);
  assert.match(app, /商品情報を反映/);
  assert.match(app, /data-management-field="name"/);
  assert.match(app, /data-management-field="category"/);
  assert.match(app, /data-management-field="new-category"/);
  assert.match(app, /function handleProductManagementChange/);
  assert.match(app, /function saveProductDetails/);
  assert.match(app, /data-management-action="copy"/);
  assert.match(app, /function prepareProductCopy/);
  assert.match(app, /Core\.makeProductCopy/);
  assert.match(html, /id="product-copy-note"/);
  assert.match(html, /id="product-copy-cancel"/);
  assert.match(html, /制限設定を反映/);
  assert.match(html, /制限設定のバックアップ/);
  assert.match(html, /制限設定を復元/);
  assert.match(html, /制限設定をダウンロード/);
  assert.match(app, /function archiveSalesHistoryBackup/);
  assert.match(app, /shirayuri-sales-history-archive-/);
  assert.match(app, /バックアップCSVをアーカイブできなかったため/);
  assert.match(html, /自動バックアップ設定を保存/);
  assert.match(html, /次の行から表示したい商品は「この商品から次の行に表示」にチェックし、「商品情報を反映」を押してください/);
  assert.match(app, /const accessibleLabel = stockUnavailable/);
  assert.match(app, /aria-label="\$\{escapeHtml\(accessibleLabel\)\}"/);
  assert.match(app, /function getCartStockError\(/);
  assert.match(app, /在庫切れです。管理画面から在庫残数を調整してください/);
  assert.match(app, /elements\.confirmButton\.disabled = [^;]*Boolean\(stockError\)/);
  assert.match(app, /is-stock-error/);
  assert.match(html, /id="payment-message"[^>]*role="alert"[^>]*aria-live="polite"/);
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
  assert.match(app, /hiddenCategories/);
  assert.match(app, /data-category-filter/);
  assert.match(app, /handleCategoryFilterChange/);
  assert.match(app, /handleCategoryFilterOutsideClick/);
  assert.match(core, /商品列幅/);
  assert.match(app, /autoBackupIntervalMinutes: 5/);
  assert.match(core, /autoBackupIntervalMinutes \|\| 5/);
  assert.match(app, /calculatePurchaseLimit/);
  assert.match(app, /has-quantity/);
  assert.match(app, /is-limit-exceeded/);
  assert.match(app, /category-selection-count/);
  assert.match(app, /category-heading-rule/);
  assert.match(app, /selectedCount/);
  assert.match(css, /\.category-selection-count/);
  assert.match(css, /\.category-heading-rule/);
  assert.match(css, /\.category-filter-control/);
  assert.match(css, /\.category-filter-menu/);
  assert.match(css, /\.period-control \{ display: flex; align-items: center; justify-content: space-between;/);
  assert.match(css, /\.summary-cards-row \{ display: grid; grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
  assert.doesNotMatch(css, /\.summary-cards-row \{ display: contents;/);
  assert.match(css, /\.product-card\.is-limit-exceeded/);
  assert.match(css, /\.checkout-panel\.is-limit-exceeded/);
  assert.match(app, /checkoutLimitBadge/);
  assert.match(app, /lineLimitExceeded/);
  assert.match(css, /\.cart-line\.is-limit-exceeded/);
  assert.match(css, /\.cart-line\.is-limit-exceeded \{ border-bottom-color/);
 });

test('shared management changes require a separate admin authentication flow', () => {
  const html = read('index.html');
  const app = read('app.js');
  const client = read('d1-client.js');
  for (const id of ['admin-password-dialog', 'admin-password-form', 'admin-password', 'admin-password-error', 'admin-password-submit', 'admin-password-cancel']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  assert.match(app, /function openAdminAccess\(\)/);
  assert.match(app, /await D1Client\.adminLogin\(password\)/);
  assert.match(app, /if \(opening\) openAdminAccess\(\)/);
  assert.match(app, /D1Client\.adminLogout\(\)/);
  assert.match(client, /shirayuri-d1-admin-session-v2/);
  assert.match(client, /request\('\/api\/admin\/login'/);
  assert.match(client, /tokenType: requiresAdmin \? 'admin' : 'register'/);
});

test('history, inventory, backup, and daily close improvements are wired into the UI', () => {
  const html = read('index.html');
  const app = read('app.js');
  const css = read('styles.css');
  for (const id of ['undo-last-sale', 'history-search', 'history-from', 'history-to', 'history-results', 'history-load-more', 'stock-adjustment-history', 'daily-close-date', 'daily-close-summary', 'daily-close-export']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  assert.match(app, /filtered\.slice\(0, state\.historyVisibleCount\)/);
  assert.match(app, /function undoLastSale\(\)/);
  assert.match(html, /id="sale-note-toggle"[\s\S]*?aria-controls="sale-note-field"/);
  assert.match(html, /<textarea[\s\S]*?id="sale-note"[\s\S]*?maxlength="200"/);
  assert.match(app, /note: state\.saleNote/);
  assert.match(app, /escapeHtml\(transaction\.note\)/);
  assert.match(app, /transaction\.note \|\| ''\]/);
  assert.match(css, /\.history-note span \{ white-space: pre-wrap;/);
  assert.match(app, /const confirmation = `直前の会計（\$\{formatDate\(transaction\.recordedAt\)\}・\$\{formatYen\(transaction\.total\)\}）を取り消しますか？/);
  assert.match(app, /if \(!root\.confirm\(confirmation\)\) return;/);
  assert.match(app, /elements\.undoLastSale\.classList\.add\('is-fading'\)/);
  assert.match(app, /setTimeout\(clearUndoSale, 5000\)/);
  assert.match(app, /saveSalesAndInventory/);
  assert.match(app, /function adjustProductStock\(/);
  assert.match(app, /Core\.dailyCloseReport/);
  assert.match(app, /24時間以上バックアップがないため/);
  assert.match(css, /\.daily-close-panel/);
  assert.match(css, /\.history-tools/);
  assert.match(css, /\.managed-stock-adjustment/);
  assert.match(html, /<div class="undo-sale-anchor">\s*<button[\s\S]*?id="undo-last-sale"[\s\S]*?<\/button>\s*<\/div>\s*<\/div>\s*<div class="checkout-actions-footer">\s*<button[\s\S]*?id="confirm-button"/);
  assert.match(app, /function requestClearCart\(\)[\s\S]*?elements\.clearCartDialog\.showModal\(\)/);
  assert.match(app, /elements\.clearCart\.addEventListener\('click', requestClearCart\)/);
  assert.match(app, /elements\.clearCartDialogConfirm\.addEventListener\('click', confirmClearCart\)/);
  assert.match(css, /\.undo-sale-anchor \{ position: relative; height: 0; margin-top: 14px; \}/);
  assert.match(css, /\.undo-last-sale \{[\s\S]*?position: absolute;[\s\S]*?left: 50%;/);
  assert.match(css, /\.undo-last-sale \{[\s\S]*?background: rgba\(255, 255, 255, \.97\);/);
  assert.match(css, /\.undo-last-sale\.is-fading \{ animation: undo-last-sale-fade 5s linear forwards; \}/);
  assert.match(css, /@keyframes undo-last-sale-fade/);
});

test('inventory remaining chart and weekday-by-hour heatmap are wired into analytics', () => {
  const html = read('index.html');
  const app = read('app.js');
  const core = read('core.js');
  const css = read('styles.css');
  for (const id of ['inventory-chart-summary', 'inventory-chart', 'weekday-heatmap-head', 'weekday-heatmap-body']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  assert.match(app, /function renderInventoryChart\(\)/);
  assert.match(app, /function renderWeekdayHeatmap\(summary\)/);
  assert.match(app, /Core\.summarizeInventoryAvailability/);
  assert.match(app, /Core\.summarizeWeekdayHours/);
  assert.match(core, /function summarizeInventoryAvailability\(/);
  assert.match(core, /function summarizeWeekdayHours\(/);
  assert.match(css, /\.weekday-heatmap-card \{ grid-column: 1 \/ -1; \}/);
  assert.match(css, /\.inventory-chart-row\.is-low \.inventory-chart-bar/);
});

test('very small phone layouts wrap controls and prevent fixed-width overflow', () => {
  const css = read('styles.css');
  assert.match(css, /@media \(max-width: 560px\) \{[\s\S]*?\.catalog-panel \.panel-heading \{ flex-wrap: wrap;/);
  assert.match(css, /@media \(max-width: 360px\) \{[\s\S]*?\.summary-cards-row \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.product-card \{ height: auto !important; min-height: 92px !important;/);
  assert.match(css, /#checkout-panel \.payment-box \{ grid-template-columns: minmax\(100px, 1fr\) minmax\(0, 1\.5fr\);/);
  assert.match(css, /#checkout-panel \.received-quick-buttons \{ min-width: 0;/);
  assert.match(css, /\.checkout-scroll-area \{[^}]*overflow-x: hidden; overflow-y: auto;/);
  assert.match(css, /\.checkout-panel\.is-stock-error/);
  assert.match(css, /\.cart-line\.is-stock-error/);
  assert.match(css, /\.history-money \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
});

test('register settings share uses a shareable text file without changing JSON downloads', () => {
  const html = read('index.html');
  const app = read('app.js');
  assert.match(app, /function exportSettingsBundle\(\)[\s\S]*?shirayuri-register-settings-\$\{[^}]+\}\.json/);
  assert.match(app, /function shareSettingsBundle\(\)[\s\S]*?shirayuri-register-settings-\$\{[^}]+\}\.txt`, json, 'text\/plain'/);
  assert.match(html, /id="import-settings-bundle-file"[\s\S]*?accept="\.json,\.txt,application\/json,text\/plain"/);
});

