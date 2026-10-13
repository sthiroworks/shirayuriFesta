# Shirayuri Festa レジ・販売集計アプリ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** macOSのSafari/Chromeで`index.html`を直接開いて使える、標準ブラウザ機能だけのレジ・販売集計アプリを作る。

**Architecture:** Classic JavaScript filesを`index.html`から順に読み込む静的アプリにする。純粋な商品取込・会計計算・集計・CSV変換は`core.js`に分離し、`localStorage`の読み書きは`storage.js`に分離する。`app.js`はDOMイベントと表示更新だけを担当し、外部ライブラリやサーバーに依存しない。

**Tech Stack:** HTML5, CSS3, vanilla JavaScript, browser File API, `localStorage`, Blob download, inline SVG, Node.js built-in `node:test` for pure logic tests. No npm packages.

**Spec:** `docs/superpowers/specs/2026-10-12-sales-register-design.md`

## Global Constraints

- 外部ライブラリ、npmパッケージ、CDN、OSSコードは使わず、ブラウザ標準のFile API、`localStorage`、`Blob`、SVGだけで実装する。
- ファイル選択で `.csv` と `.tsv` を受け付け、XLSXの直接読込は対象外とする。
- 1会計を1行のCSVに出力する。
- マイナス単価を許可し、合計がマイナスになる会計は確定できない。
- `index.html`を直接開いても初期商品を表示できるよう、初期商品は通常のJavaScriptデータスクリプトとして同梱する。
- 確定ごとの任意CSVファイルへの自動追記は行わず、履歴保存後にCSVダウンロードを行う。

## Review Focus

- 価格表の左右2ブロックと正規化3列CSVの両方を読み、カテゴリを正しく引き継ぐ。`parseProductText extracts both price-table blocks`で固定する。
- `ありがとうチケット`のようなマイナス単価を商品として保持する。`parseProductText accepts negative unit price`で固定する。
- 空欄・非数値単価と重複商品を黙って商品化せず、警告と件数を返す。`parseProductText reports invalid and duplicate rows`で固定する。
- 明細にカンマ、引用符、改行があっても1会計1行のCSVを壊さない。`transactionsToCsv escapes detail fields`で固定する。
- 壊れた`localStorage`でも初期商品・空履歴で起動できる。`loadProducts/loadTransactions fall back from malformed storage`で固定する。

---

### Task 1: 商品取込・会計・集計の純粋ロジック

**Files:**
- Create: `core.js`
- Create: `tests/core.test.js`

**Interfaces:**
- Produces global `SalesRegisterCore` and CommonJS-compatible exports with:
  - `makeProduct(category, name, unitPrice)`
  - `parseProductText(text)` → `{ products, warnings, stats }`
  - `calculateCart(lines)` → `{ lineItems, itemCount, total }`
  - `buildTransaction({ id, recordedAt, lines, received })` → `Transaction`
  - `summarizeTransactions(transactions, period, now)` → `{ totalSales, transactionCount, itemCount, products, categories }`
  - `transactionsToCsv(transactions)` → `string`

- [ ] **Step 1: Write the failing tests** for the five review-focus behaviors plus cart total/change and all/今日 aggregation. Use Node's built-in `node:test` and `node:assert/strict`; do not add a test dependency.

- [ ] **Step 2: Run the focused test file to verify it fails**

  Run: `node --test tests/core.test.js`
  Expected: FAIL because `core.js` and its exported functions do not exist yet.

- [ ] **Step 3: Implement the minimal `core.js` API**

  Implement a quote-aware CSV/TSV parser, detect the normalized header form or the existing left/right `品名,金額` blocks, carry each block's category downward, normalize prices by removing currency symbols and grouping commas, and deduplicate by `category + name` with the last row winning. Keep the implementation independent of DOM and browser globals so Node can test it.

- [ ] **Step 4: Run the focused test file to verify it passes**

  Run: `node --test tests/core.test.js`
  Expected: all core tests PASS with zero failures.

- [ ] **Step 5: Run the full test suite and commit**

  Run: `node --test`
  Expected: all discovered tests PASS.

  Commit: `git add core.js tests/core.test.js` then `git commit -m "feat: add sales register domain logic"`.

### Task 2: 初期商品データとlocalStorage永続化

**Files:**
- Create: `products.default.js`
- Create: `storage.js`
- Create: `tests/storage.test.js`

**Interfaces:**
- `products.default.js` produces `window.DEFAULT_PRODUCTS` and CommonJS-compatible exports containing the current-day products: 10 `園グッズ`, 10 `古園服`, and `ありがとうチケット` at -50.
- `storage.js` produces global `SalesRegisterStorage` and CommonJS-compatible exports with:
  - `loadProducts(storage, fallbackProducts)` → `{ products, warning }`
  - `saveProducts(storage, products)` → `void`
  - `loadTransactions(storage)` → `{ transactions, warning }`
  - `saveTransactions(storage, transactions)` → `void`
  - `clearTransactions(storage)` → `void`

- [ ] **Step 1: Write the failing storage tests** for empty storage using defaults, round-tripping products and transactions, malformed JSON fallback, and transaction-only clearing with a small in-memory fake Storage object.

- [ ] **Step 2: Run the focused test file to verify it fails**

  Run: `node --test tests/storage.test.js`
  Expected: FAIL because `storage.js` does not exist yet.

- [ ] **Step 3: Implement the default data and storage API**

  Use versioned keys `shirayuri-products-v1` and `shirayuri-transactions-v1`. Never let malformed stored JSON prevent startup; return the fallback and a warning for the UI.

- [ ] **Step 4: Run focused and full tests**

  Run: `node --test tests/storage.test.js` and then `node --test`
  Expected: all tests PASS.

- [ ] **Step 5: Commit**

  Run: `git add products.default.js storage.js tests/storage.test.js` then `git commit -m "feat: add defaults and local storage"`.

### Task 3: レジ画面と会計確定フロー

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `app.js`

**Interfaces:**
- Consumes `SalesRegisterCore`, `SalesRegisterStorage`, and `window.DEFAULT_PRODUCTS` from Tasks 1–2.
- `app.js` owns an in-memory UI state `{ products, transactions, cart, received, period }` and delegates all money, item-count, and transaction creation decisions to `SalesRegisterCore`.

- [ ] **Step 1: Add the semantic HTML shell** with product area, cart area, payment controls, summary cards, import/export buttons, history table, status live region, and empty states. Include classic scripts in this order: `core.js`, `storage.js`, `products.default.js`, `app.js`.

- [ ] **Step 2: Add the responsive visual system** in `styles.css`: two-column desktop layout, single-column narrow layout, large touch targets, visible focus states, and compact currency/count cards. Use CSS variables and no icon/font package.

- [ ] **Step 3: Implement the minimal `app.js` interaction layer**

  Render category sections and quantity steppers from state; clicking a product increments quantity; quantity changes update cart and payment state; the exact-total action fills the received amount; confirm remains disabled for an empty cart, insufficient payment, or negative total. On a valid confirm, call `buildTransaction`, persist it, clear the cart, and render a success status.

- [ ] **Step 4: Perform the browser smoke check**

  Open `index.html` directly in Safari or Chrome and verify: default products appear, quantity changes affect the cart, the exact-total action fills payment, insufficient payment keeps confirm disabled, and a successful confirm clears the cart without a console error.

- [ ] **Step 5: Commit**

  Run: `git add index.html styles.css app.js` then `git commit -m "feat: add browser checkout screen"`.

### Task 4: 集計グラフ・インポート・履歴CSV出力

**Files:**
- Modify: `app.js`
- Modify: `styles.css`
- Modify: `index.html`
- Create: `README.md`

**Interfaces:**
- Consumes `summarizeTransactions`, `parseProductText`, and `transactionsToCsv` from `SalesRegisterCore`.

- [ ] **Step 1: Add the dashboard render path** using `summarizeTransactions` for `今日` and `全期間`, updating sales total, transaction count, item count, product ranking, category totals, and an inline SVG bar chart after every confirm.

- [ ] **Step 2: Add CSV/TSV import** using a file input and `FileReader`. Show accepted/rejected/duplicate counts and warnings; replace products only after parsing succeeds and preserve transactions. Do not mention or attempt XLSX parsing in the UI.

- [ ] **Step 3: Add CSV export and history controls**

  Build a UTF-8 BOM CSV Blob from `transactionsToCsv`, trigger a download named with the current date, show recent transactions in the history table, and require confirmation before clearing transactions.

- [ ] **Step 4: Add the usage README**

  Document direct opening on macOS, CSV/TSV conversion from Excel/Numbers, the one-row-per-transaction CSV format, browser-local persistence, and the fact that XLSX is intentionally not imported directly.

- [ ] **Step 5: Run the full verification**

  Run: `node --test`
  Expected: all unit tests PASS. Then repeat the browser smoke check with at least one imported CSV, one negative-price ticket, one confirmed sale, one insufficient-payment attempt, one CSV export, and one reload to confirm persistence.

- [ ] **Step 6: Commit**

  Run: `git add index.html styles.css app.js README.md` then `git commit -m "feat: add live dashboard and CSV workflow"`.

