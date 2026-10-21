(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SalesRegisterCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // DOM やブラウザ保存領域に依存しない計算・変換処理。Node のテストからも同じ関数を使う。
  function clean(value) {
    return value == null ? '' : String(value).replace(/^\uFEFF/, '').trim();
  }

  function normalizeHeader(value) {
    return clean(value).toLowerCase().replace(/[\s_\-]/g, '');
  }

  function productId(category, name) {
    return `${category}::${name}`;
  }

  function makeProduct(category, name, unitPrice) {
    const normalizedCategory = clean(category) || 'その他';
    const normalizedName = clean(name);
    const price = Number(unitPrice);
    if (!normalizedName || !Number.isFinite(price)) throw new Error('商品名と単価が必要です');
    return {
      id: productId(normalizedCategory, normalizedName),
      category: normalizedCategory,
      name: normalizedName,
      unitPrice: price,
    };
  }

  function makeProductCopy(source, products, copyId) {
    const baseName = `${clean(source.name)}（コピー）`;
    let name = baseName;
    let sequence = 2;
    while ((products || []).some((product) => product.category === source.category && product.name === name)) {
      name = `${clean(source.name)}（コピー${sequence}）`;
      sequence += 1;
    }
    const copy = makeProduct(source.category, name, source.unitPrice);
    if (copyId) copy.id = String(copyId);
    if (Number.isInteger(source.stockLimit) && source.stockLimit >= 0) copy.stockLimit = source.stockLimit;
    if (source.icon) copy.icon = source.icon;
    if (source.iconPath) copy.iconPath = source.iconPath;
    return copy;
  }

  function detectDelimiter(text) {
    const firstLine = String(text).split(/\r?\n/, 1)[0];
    return firstLine.includes('\t') ? '\t' : ',';
  }

  function parseRows(text, delimiter) {
    // 引用符の内側では区切り文字・改行をセルの値として扱い、二重引用符は1文字に戻す。
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    const source = String(text).replace(/^\uFEFF/, '');
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (quoted) {
        if (char === '"' && source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          field += char;
        }
      } else if (char === '"') {
        quoted = true;
      } else if (char === delimiter) {
        row.push(field);
        field = '';
      } else if (char === '\n') {
        row.push(field.replace(/\r$/, ''));
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += char;
      }
    }
    if (field !== '' || row.length > 0) {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
    }
    return rows;
  }

  function parsePrice(value) {
    const raw = clean(value).replace(/[¥￥円,\s]/g, '');
    if (!raw) return null;
    const price = Number(raw);
    return Number.isFinite(price) ? price : null;
  }

  function parseProductText(text) {
    const rows = parseRows(text, detectDelimiter(text));
    const warnings = [];
    const products = new Map();
    const stats = { accepted: 0, rejected: 0, duplicates: 0 };

    function addProduct(category, name, price, rowNumber, icon, iconPath, stockLimitValue, productIdValue) {
      const normalizedCategory = clean(category) || 'その他';
      const normalizedName = clean(name);
      if (!normalizedName || price === null) {
        stats.rejected += 1;
        warnings.push(`${rowNumber}行目: 商品名または単価が不正です`);
        return;
      }
      const rawStockLimit = clean(stockLimitValue);
      const stockLimit = rawStockLimit === '' ? null : parsePrice(rawStockLimit);
      if (rawStockLimit !== '' && (stockLimit === null || !Number.isInteger(stockLimit) || stockLimit < 0)) {
        stats.rejected += 1;
        warnings.push(`${rowNumber}行目: 在庫上限は0以上の整数で入力してください`);
        return;
      }
      const product = makeProduct(normalizedCategory, normalizedName, price);
      if (clean(productIdValue)) product.id = clean(productIdValue);
      if (stockLimit !== null) product.stockLimit = stockLimit;
      const normalizedIcon = clean(icon);
      if (normalizedIcon) product.icon = normalizedIcon;
      const normalizedIconPath = clean(iconPath);
      if (normalizedIconPath) product.iconPath = normalizedIconPath;
      if (products.has(product.id)) {
        stats.duplicates += 1;
        const existingIndex = Array.from(products.keys()).indexOf(product.id);
        if (existingIndex >= 0) products.delete(product.id);
      }
      products.set(product.id, product);
      stats.accepted += 1;
    }

    const nonEmptyRows = rows.filter((row) => row.some((cell) => clean(cell)));
    const headerIndex = nonEmptyRows.findIndex((row) => {
      const headers = row.map(normalizeHeader);
      return headers.includes('カテゴリ') || headers.includes('category') || headers.includes('商品名') || headers.includes('品名');
    });
    const normalizedHeader = headerIndex >= 0 ? nonEmptyRows[headerIndex].map(normalizeHeader) : null;
    const categoryIndex = normalizedHeader && normalizedHeader.findIndex((value) => ['カテゴリ', '分類', 'category'].includes(value));
    const nameIndex = normalizedHeader && normalizedHeader.findIndex((value) => ['商品名', '品名', 'name', 'product'].includes(value));
    const priceIndex = normalizedHeader && normalizedHeader.findIndex((value) => ['単価', '金額', '価格', 'price', 'unitprice'].includes(value));
    const iconIndex = normalizedHeader && normalizedHeader.findIndex((value) => ['アイコン', 'icon', 'emoji'].includes(value));
    const iconPathIndex = normalizedHeader && normalizedHeader.findIndex((value) => ['アイコンパス', 'iconpath'].includes(value));
    const stockLimitIndex = normalizedHeader && normalizedHeader.findIndex((value) => ['在庫上限', 'stocklimit', 'stock'].includes(value));
    const productIdIndex = normalizedHeader && normalizedHeader.findIndex((value) => ['商品id', 'productid'].includes(value));
    const isNormalized = normalizedHeader && categoryIndex >= 0 && nameIndex >= 0 && priceIndex >= 0;

    if (isNormalized) {
      nonEmptyRows.slice(headerIndex + 1).forEach((row, offset) => {
        const rowNumber = headerIndex + offset + 2;
        addProduct(row[categoryIndex], row[nameIndex], parsePrice(row[priceIndex]), rowNumber, iconIndex >= 0 ? row[iconIndex] : '', iconPathIndex >= 0 ? row[iconPathIndex] : '', stockLimitIndex >= 0 ? row[stockLimitIndex] : '', productIdIndex >= 0 ? row[productIdIndex] : '');
      });
    } else {
      const blocks = [];
      rows.forEach((row, rowIndex) => {
        for (let column = 0; column < row.length - 1; column += 1) {
          if (normalizeHeader(row[column]) === '品名' && normalizeHeader(row[column + 1]) === '金額') {
            const category = clean(rows[rowIndex - 1] && rows[rowIndex - 1][column]);
            blocks.push({ nameColumn: column, priceColumn: column + 1, headerRow: rowIndex, category });
          }
        }
      });
      if (blocks.length > 0) {
        blocks.forEach((block) => {
          for (let rowIndex = block.headerRow + 1; rowIndex < rows.length; rowIndex += 1) {
            const row = rows[rowIndex];
            const name = clean(row[block.nameColumn]);
            const rawPrice = row[block.priceColumn];
            if (!name && !clean(rawPrice)) continue;
            addProduct(block.category, name, parsePrice(rawPrice), rowIndex + 1);
          }
        });
      } else {
        rows.forEach((row, rowIndex) => {
          if (row.length >= 3 && row.some((cell) => clean(cell))) {
            addProduct(row[0], row[1], parsePrice(row[2]), rowIndex + 1);
          }
        });
      }
    }

    if (products.size === 0 && rows.length > 0) warnings.push('取り込める商品がありません');
    return {
      products: Array.from(products.values()),
      warnings,
      stats,
      hasStockLimitColumn: Boolean(normalizedHeader && stockLimitIndex >= 0),
      hasProductIdColumn: Boolean(normalizedHeader && productIdIndex >= 0),
    };
  }

  function calculateCart(lines) {
    const lineItems = [];
    (lines || []).forEach((line) => {
      const product = line.product || line;
      const quantity = Math.max(0, Math.floor(Number(line.quantity) || 0));
      if (!product || quantity === 0) return;
      const subtotal = product.unitPrice * quantity;
      const item = {
        category: product.category,
        name: product.name,
        unitPrice: product.unitPrice,
        quantity,
        subtotal,
      };
      if (typeof product.id === 'string' && product.id) item.productId = product.id;
      lineItems.push(item);
    });
    return {
      lineItems,
      itemCount: lineItems.reduce((sum, item) => sum + item.quantity, 0),
      total: lineItems.reduce((sum, item) => sum + item.subtotal, 0),
    };
  }

  function buildTransaction(input) {
    const cart = calculateCart(input.lines);
    const received = Number(input.received);
    const note = clean(input.note);
    if (cart.total < 0) throw new Error('合計金額がマイナスです');
    if (!Number.isFinite(received) || received < cart.total) throw new Error('お預かりが不足しています');
    return {
      id: String(input.id),
      recordedAt: input.recordedAt || new Date().toISOString(),
      total: cart.total,
      received,
      change: received - cart.total,
      itemCount: cart.itemCount,
      items: cart.lineItems,
      ...(note ? { note } : {}),
    };
  }

  function calculatePurchaseLimit(lines, settings) {
    // 制限対象カテゴリだけを合算する。設定には会計単位の一時上書きも渡せる。
    const enabled = Boolean(settings && settings.enabled);
    const category = clean(settings && settings.category);
    const siblings = Math.max(1, Math.floor(Number(settings && settings.siblings) || 1));
    const perSibling = Math.max(0, Math.floor(Number(settings && settings.perSibling) || 0));
    const limit = siblings * perSibling;
    if (!enabled || !category) return { category, count: 0, limit: 0, exceeded: false };
    const cart = calculateCart(lines);
    const count = cart.lineItems.filter((item) => item.category === category).reduce((sum, item) => sum + item.quantity, 0);
    return { category, count, limit, exceeded: count > limit };
  }

  function upsertTransaction(transactions, transaction) {
    const list = Array.isArray(transactions) ? transactions : [];
    const index = list.findIndex((item) => item.id === transaction.id);
    if (index < 0) return [...list, transaction];
    return list.map((item, itemIndex) => itemIndex === index ? transaction : item);
  }

  function removeTransaction(transactions, transactionId) {
    return (transactions || []).filter((transaction) => transaction.id !== transactionId);
  }

  function isSameLocalDay(dateValue, now) {
    const date = new Date(dateValue);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  }

  function isSameLocalWeek(dateValue, now) {
    // 集計期間は端末のローカル時刻で扱い、週は月曜開始・翌週月曜未満とする。
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return false;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = start.getDay();
    start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    return date >= start && date < end;
  }

  function isSameLocalMonth(dateValue, now) {
    const date = new Date(dateValue);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }

  function localDateKey(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '';
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }

  function isWithinLocalHour(dateValue, timeRange) {
    if (!timeRange) return true;
    const date = new Date(dateValue);
    const startValue = Number(timeRange.startHour);
    const endValue = Number(timeRange.endHour);
    if (!Number.isFinite(startValue) || !Number.isFinite(endValue)) return true;
    const start = Math.min(startValue, endValue);
    const end = Math.max(startValue, endValue);
    if (start <= 0 && end >= 23) return true;
    if (Number.isNaN(date.getTime())) return false;
    return date.getHours() >= start && date.getHours() <= end;
  }

  function summarizeTransactions(transactions, period, nowValue, timeRange) {
    // 期間と時間帯を先に絞り、その同じ対象集合から全ての集計表・グラフ用データを作る。
    const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
    const selected = (transactions || []).filter((transaction) => {
      if (period === 'today') return isSameLocalDay(transaction.recordedAt, now);
      if (period === 'week') return isSameLocalWeek(transaction.recordedAt, now);
      if (period === 'month') return isSameLocalMonth(transaction.recordedAt, now);
      return true;
    }).filter((transaction) => isWithinLocalHour(transaction.recordedAt, timeRange));
    const productMap = new Map();
    const categoryMap = new Map();
    const dailyMap = new Map();
    const hourlyMap = new Map();
    const hourlyCategoryMap = new Map();
    const hourlyProductMap = new Map();
    selected.forEach((transaction) => {
      const date = new Date(transaction.recordedAt);
      const dateKey = localDateKey(transaction.recordedAt);
      const hour = Number.isNaN(date.getTime()) ? null : date.getHours();
      if (dateKey) {
        const day = dailyMap.get(dateKey) || { date: dateKey, sales: 0, transactionCount: 0, itemCount: 0 };
        day.sales += transaction.total;
        day.transactionCount += 1;
        day.itemCount += transaction.itemCount;
        dailyMap.set(dateKey, day);
        const hourSummary = hourlyMap.get(hour) || { hour, sales: 0, transactionCount: 0, itemCount: 0 };
        hourSummary.sales += transaction.total;
        hourSummary.transactionCount += 1;
        hourSummary.itemCount += transaction.itemCount;
        hourlyMap.set(hour, hourSummary);
      }
      (transaction.items || []).forEach((item) => {
        const key = productId(item.category, item.name);
        const product = productMap.get(key) || { id: key, category: item.category, name: item.name, quantity: 0, sales: 0, unitPrice: item.unitPrice };
        product.quantity += item.quantity;
        product.sales += item.subtotal;
        productMap.set(key, product);
        const category = categoryMap.get(item.category) || { category: item.category, quantity: 0, sales: 0 };
        category.quantity += item.quantity;
        category.sales += item.subtotal;
        categoryMap.set(item.category, category);
        if (hour !== null) {
          const hourlyCategoryKey = `${hour}::${item.category}`;
          const hourlyCategory = hourlyCategoryMap.get(hourlyCategoryKey) || { hour, category: item.category, quantity: 0, sales: 0 };
          hourlyCategory.quantity += item.quantity;
          hourlyCategory.sales += item.subtotal;
          hourlyCategoryMap.set(hourlyCategoryKey, hourlyCategory);
          const hourlyProductKey = `${hour}::${item.category}::${item.name}`;
          const hourlyProduct = hourlyProductMap.get(hourlyProductKey) || { hour, category: item.category, name: item.name, quantity: 0, sales: 0 };
          hourlyProduct.quantity += item.quantity;
          hourlyProduct.sales += item.subtotal;
          hourlyProductMap.set(hourlyProductKey, hourlyProduct);
        }
      });
    });
    const sortByQuantity = (a, b) => b.quantity - a.quantity || b.sales - a.sales || a.name.localeCompare(b.name, 'ja');
    return {
      totalSales: selected.reduce((sum, transaction) => sum + transaction.total, 0),
      transactionCount: selected.length,
      itemCount: selected.reduce((sum, transaction) => sum + transaction.itemCount, 0),
      averageTransaction: selected.length ? selected.reduce((sum, transaction) => sum + transaction.total, 0) / selected.length : 0,
      products: Array.from(productMap.values()).sort(sortByQuantity),
      categories: Array.from(categoryMap.values()).sort((a, b) => b.sales - a.sales || a.category.localeCompare(b.category, 'ja')),
      daily: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
      hourly: Array.from({ length: 24 }, (_, hour) => hourlyMap.get(hour) || { hour, sales: 0, transactionCount: 0, itemCount: 0 }),
      hourlyCategories: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        categories: Array.from(hourlyCategoryMap.values())
          .filter((category) => category.hour === hour)
          .sort((a, b) => b.sales - a.sales || a.category.localeCompare(b.category, 'ja')),
      })),
      hourlyProducts: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        products: Array.from(hourlyProductMap.values())
          .filter((product) => product.hour === hour)
          .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name, 'ja')),
      })),
    };
  }

  function summarizeWeekdayHours(transactions, period, nowValue, timeRange) {
    const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
    const labels = ['日', '月', '火', '水', '木', '金', '土'];
    const weekdays = labels.map((label, weekday) => ({
      weekday,
      label,
      hours: Array.from({ length: 24 }, (_, hour) => ({ hour, transactionCount: 0, itemCount: 0, sales: 0 })),
    }));
    const selected = (transactions || []).filter((transaction) => {
      if (period === 'today') return isSameLocalDay(transaction.recordedAt, now);
      if (period === 'week') return isSameLocalWeek(transaction.recordedAt, now);
      if (period === 'month') return isSameLocalMonth(transaction.recordedAt, now);
      return true;
    }).filter((transaction) => isWithinLocalHour(transaction.recordedAt, timeRange));
    selected.forEach((transaction) => {
      const date = new Date(transaction.recordedAt);
      if (Number.isNaN(date.getTime())) return;
      const cell = weekdays[date.getDay()].hours[date.getHours()];
      cell.transactionCount += 1;
      cell.itemCount += Number(transaction.itemCount) || 0;
      cell.sales += Number(transaction.total) || 0;
    });
    return {
      weekdays,
      maxTransactions: Math.max(0, ...weekdays.flatMap((day) => day.hours.map((hour) => hour.transactionCount))),
    };
  }

  function csvEscape(value) {
    const text = value == null ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function formatExportDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { date: '', weekStart: '' };
    const toText = (target) => [target.getFullYear(), String(target.getMonth() + 1).padStart(2, '0'), String(target.getDate()).padStart(2, '0')].join('-');
    const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = localDate.getDay();
    localDate.setDate(localDate.getDate() + (day === 0 ? -6 : 1 - day));
    return { date: toText(date), weekStart: toText(localDate) };
  }

  function transactionsToCsv(transactions) {
    const lines = ['会計ID,会計日時,会計日,週開始日,会計合計,お預かり,おつり,会計点数,明細番号,カテゴリ,商品名,単価,数量,売上金額,商品ID,会計メモ'];
    (transactions || []).forEach((transaction) => {
      const dates = formatExportDate(transaction.recordedAt);
      const items = transaction.items || [];
      items.forEach((item, index) => {
        lines.push([
          transaction.id,
          transaction.recordedAt,
          dates.date,
          dates.weekStart,
          transaction.total,
          transaction.received,
          transaction.change,
          transaction.itemCount,
          index + 1,
          item.category,
          item.name,
          item.unitPrice,
          item.quantity,
          item.subtotal,
          item.productId || '',
          transaction.note || '',
        ].map(csvEscape).join(','));
      });
    });
    return lines.join('\r\n');
  }

  function inventoryKeyForItem(item, products) {
    if (item && clean(item.productId)) return clean(item.productId);
    const product = (products || []).find((candidate) => candidate.category === item.category && candidate.name === item.name);
    return product ? product.id : `${clean(item && item.category)}::${clean(item && item.name)}`;
  }

  function inventoryCountsForTransaction(transaction, products) {
    const counts = {};
    (transaction && transaction.items || []).forEach((item) => {
      const key = inventoryKeyForItem(item, products);
      const quantity = Math.max(0, Math.floor(Number(item.quantity) || 0));
      if (!key || !quantity) return;
      counts[key] = (counts[key] || 0) + quantity;
    });
    return counts;
  }

  function createInventoryLedger(products, transactions) {
    // 販売累計は履歴から集計する一方、物理残数は上限から初期化して別々に保持する。
    const ledger = { salesByProduct: {}, remainingByProduct: {}, adjustments: [] };
    (transactions || []).forEach((transaction) => {
      const counts = inventoryCountsForTransaction(transaction, products);
      Object.entries(counts).forEach(([key, quantity]) => {
        ledger.salesByProduct[key] = (ledger.salesByProduct[key] || 0) + quantity;
      });
    });
    (products || []).forEach((product) => {
      const limit = Number(product.stockLimit);
      if (Number.isInteger(limit) && limit >= 0) {
        ledger.remainingByProduct[product.id] = Math.max(0, limit - (ledger.salesByProduct[product.id] || 0));
      }
    });
    return ledger;
  }

  function applyInventoryTransactionChange(inventory, previousTransaction, nextTransaction, products) {
    // 新旧会計の差分だけを反映するため、編集・取消でも過去分を二重に加減算しない。
    // 販売累計と物理残数は別軸で更新し、在庫調整履歴はそのまま引き継ぐ。
    const source = inventory || {};
    const ledger = {
      salesByProduct: { ...(source.salesByProduct || {}) },
      remainingByProduct: { ...(source.remainingByProduct || {}) },
      adjustments: Array.isArray(source.adjustments) ? source.adjustments.slice() : [],
    };
    const before = inventoryCountsForTransaction(previousTransaction, products);
    const after = inventoryCountsForTransaction(nextTransaction, products);
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    keys.forEach((key) => {
      const oldQuantity = before[key] || 0;
      const newQuantity = after[key] || 0;
      const delta = newQuantity - oldQuantity;
      const currentSales = Math.max(0, Math.floor(Number(ledger.salesByProduct[key]) || 0));
      const product = (products || []).find((candidate) => candidate.id === key);
      const limit = Number(product && product.stockLimit);
      if (Number.isInteger(limit) && limit >= 0 && !Object.prototype.hasOwnProperty.call(ledger.remainingByProduct, key)) {
        ledger.remainingByProduct[key] = Math.max(0, limit - currentSales);
      }
      ledger.salesByProduct[key] = Math.max(0, currentSales + delta);
      if (Object.prototype.hasOwnProperty.call(ledger.remainingByProduct, key)) {
        ledger.remainingByProduct[key] = Math.max(0, Number(ledger.remainingByProduct[key]) - delta);
      }
    });
    return ledger;
  }

  function adjustInventory(inventory, productId, productName, remaining, now) {
    // 手動調整は現在残数だけを置き換え、販売累計には触れず、直近50件の変更履歴を残す。
    const quantity = Number(remaining);
    if (!productId || !Number.isInteger(quantity) || quantity < 0) throw new Error('在庫残数は0以上の整数で入力してください');
    const source = inventory || {};
    const ledger = {
      salesByProduct: { ...(source.salesByProduct || {}) },
      remainingByProduct: { ...(source.remainingByProduct || {}) },
      adjustments: Array.isArray(source.adjustments) ? source.adjustments.slice() : [],
    };
    const previous = Object.prototype.hasOwnProperty.call(ledger.remainingByProduct, productId)
      ? Math.max(0, Number(ledger.remainingByProduct[productId]) || 0)
      : null;
    ledger.remainingByProduct[productId] = quantity;
    ledger.adjustments.unshift({
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      productId,
      productName: clean(productName),
      recordedAt: (now ? new Date(now) : new Date()).toISOString(),
      before: previous,
      after: quantity,
    });
    ledger.adjustments = ledger.adjustments.slice(0, 50);
    return ledger;
  }

  function summarizeInventoryAvailability(products, inventory) {
    const source = inventory || {};
    const sales = source.salesByProduct || {};
    const physical = source.remainingByProduct || {};
    return (products || []).flatMap((product) => {
      const limit = Number(product && product.stockLimit);
      if (!Number.isInteger(limit) || limit < 0) return [];
      const sold = Math.max(0, Math.floor(Number(sales[product.id]) || 0));
      const limitRemaining = Math.max(0, limit - sold);
      const physicalRemaining = Object.prototype.hasOwnProperty.call(physical, product.id)
        ? Math.max(0, Math.floor(Number(physical[product.id]) || 0))
        : limitRemaining;
      const remaining = Math.min(limitRemaining, physicalRemaining);
      const remainingRatio = limit ? remaining / limit : 0;
      return [{ product, total: limit, sold, remaining, remainingRatio, soldPercent: limit ? Math.round((1 - remainingRatio) * 100) : 0 }];
    });
  }

  function dailyCloseReport(transactions, date) {
    // 指定日のローカル日付で締め、CSVには日計1行と商品別明細を出す。
    // 商品IDのない古い会計はカテゴリ名と商品名の組でまとめる。
    const targetDate = clean(date);
    const dailyTransactions = (transactions || []).filter((transaction) => localDateKey(transaction.recordedAt) === targetDate);
    const totals = dailyTransactions.reduce((result, transaction) => {
      result.sales += Number(transaction.total) || 0;
      result.items += Number(transaction.itemCount) || 0;
      result.received += Number(transaction.received) || 0;
      result.change += Number(transaction.change) || 0;
      return result;
    }, { sales: 0, items: 0, received: 0, change: 0 });
    const products = new Map();
    dailyTransactions.forEach((transaction) => (transaction.items || []).forEach((item) => {
      const key = `${clean(item.productId) || `${clean(item.category)}::${clean(item.name)}`}`;
      const current = products.get(key) || { category: clean(item.category), name: clean(item.name), quantity: 0, sales: 0 };
      current.quantity += Number(item.quantity) || 0;
      current.sales += Number(item.subtotal) || (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0);
      products.set(key, current);
    }));
    const lines = [['区分', '対象日', 'カテゴリ', '商品名', '会計数', '販売個数', '売上', 'お預かり', 'おつり']];
    lines.push(['日計', targetDate, '', '', dailyTransactions.length, totals.items, totals.sales, totals.received, totals.change]);
    Array.from(products.values()).sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name, 'ja')).forEach((item) => {
      lines.push(['商品別', targetDate, item.category, item.name, '', item.quantity, item.sales, '', '']);
    });
    return {
      date: targetDate,
      transactionCount: dailyTransactions.length,
      itemCount: totals.items,
      totalSales: totals.sales,
      totalReceived: totals.received,
      totalChange: totals.change,
      products: Array.from(products.values()),
      csv: lines.map((row) => row.map(csvEscape).join(',')).join('\r\n'),
    };
  }

  function productsToCsv(products) {
    const lines = ['カテゴリ,商品名,単価,アイコン,アイコンパス,在庫上限,商品ID'];
    (products || []).forEach((product) => {
      lines.push([
        product.category,
        product.name,
        product.unitPrice,
        product.icon || '',
        product.iconPath || '',
        Number.isInteger(product.stockLimit) && product.stockLimit >= 0 ? product.stockLimit : '',
        product.id || '',
      ].map(csvEscape).join(','));
    });
    return lines.join('\r\n');
  }

  function settingsToCsv(settings) {
    const columnWidth = ['compact', 'standard', 'wide'].includes(settings && settings.productColumnWidth) ? settings.productColumnWidth : 'standard';
    const lines = ['制限有効,対象カテゴリ,きょうだい人数,1人あたり上限,商品列幅,自動バックアップ有効,自動バックアップ間隔分,自動バックアップ最終出力'];
    lines.push([
      settings && settings.enabled ? 'true' : 'false',
      settings && settings.category || '',
      settings && settings.siblings || 1,
      settings && settings.perSibling != null ? settings.perSibling : 4,
      columnWidth,
      settings && settings.autoBackupEnabled ? 'true' : 'false',
      settings && settings.autoBackupIntervalMinutes || 5,
      settings && settings.autoBackupLastAt || '',
    ].map(csvEscape).join(','));
    return lines.join('\r\n');
  }

  function settingsBundleToJson(products, settings, inventory) {
    // 設定一式は商品・在庫・設定の移行用。販売履歴や端末固有の保存先ハンドルは含めない。
    const columnWidth = ['compact', 'standard', 'wide'].includes(settings && settings.productColumnWidth) ? settings.productColumnWidth : 'standard';
    const bundleProducts = (products || []).map((product) => {
      const value = {
        id: clean(product.id) || productId(product.category, product.name),
        category: clean(product.category) || 'その他',
        name: clean(product.name),
        unitPrice: Number(product.unitPrice),
      };
      if (Number.isInteger(product.stockLimit) && product.stockLimit >= 0) value.stockLimit = product.stockLimit;
      if (typeof product.icon === 'string' && product.icon) value.icon = product.icon;
      if (typeof product.iconPath === 'string' && product.iconPath) value.iconPath = product.iconPath;
      return value;
    });
    return JSON.stringify({
      format: 'shirayuri-register-settings',
      version: 2,
      exportedAt: new Date().toISOString(),
      products: bundleProducts,
      inventory: inventory ? {
        salesByProduct: { ...(inventory.salesByProduct || {}) },
        remainingByProduct: { ...(inventory.remainingByProduct || {}) },
        adjustments: Array.isArray(inventory.adjustments) ? inventory.adjustments.slice(0, 50) : [],
      } : null,
      settings: {
        enabled: settings && settings.enabled === true,
        category: clean(settings && settings.category) || '古園服',
        siblings: Math.max(1, Math.floor(Number(settings && settings.siblings) || 1)),
        perSibling: Math.max(0, Math.floor(Number(settings && settings.perSibling) || 0)),
        productColumnWidth: columnWidth,
        autoBackupEnabled: settings && settings.autoBackupEnabled === true,
        autoBackupIntervalMinutes: Math.max(1, Math.floor(Number(settings && settings.autoBackupIntervalMinutes) || 5)),
      },
    }, null, 2);
  }

  function parseSettingsBundle(text) {
    let bundle;
    try {
      bundle = JSON.parse(String(text).replace(/^\uFEFF/, ''));
    } catch (error) {
      return { products: [], settings: null, warnings: ['設定一式ファイルのJSONを読み込めません。'] };
    }
    // version 1 の既存バックアップも読み込み、項目追加後の version 2 と共存させる。
    if (!bundle || bundle.format !== 'shirayuri-register-settings' || ![1, 2].includes(bundle.version)) {
      return { products: [], settings: null, warnings: ['対応していない設定一式ファイルです。'] };
    }
    if (!Array.isArray(bundle.products) || !bundle.products.length || !bundle.settings || typeof bundle.settings !== 'object') {
      return { products: [], settings: null, warnings: ['設定一式ファイルに商品または設定がありません。'] };
    }

    const products = [];
    const productIds = new Set();
    for (const [index, source] of bundle.products.entries()) {
      const category = clean(source && source.category) || 'その他';
      const name = clean(source && source.name);
      const unitPrice = parsePrice(source && source.unitPrice);
      if (!name || unitPrice === null) {
        return { products: [], settings: null, warnings: [`設定一式ファイルの商品${index + 1}件目が不正です。`] };
      }
      const id = clean(source && source.id) || productId(category, name);
      if (productIds.has(id)) {
        return { products: [], settings: null, warnings: [`設定一式ファイルの商品IDが重複しています: ${id}`] };
      }
      productIds.add(id);
      const product = { id, category, name, unitPrice };
      if (source && source.stockLimit !== undefined) {
        const stockLimit = parsePrice(source.stockLimit);
        if (stockLimit === null || !Number.isInteger(stockLimit) || stockLimit < 0) {
          return { products: [], settings: null, warnings: [`設定一式ファイルの商品${index + 1}件目の在庫上限が不正です。`] };
        }
        product.stockLimit = stockLimit;
      }
      if (typeof (source && source.icon) === 'string' && source.icon) product.icon = source.icon;
      if (typeof (source && source.iconPath) === 'string' && source.iconPath) product.iconPath = source.iconPath;
      products.push(product);
    }

    const sourceSettings = bundle.settings;
    const enabled = sourceSettings.enabled;
    const category = clean(sourceSettings.category);
    const siblings = parsePrice(sourceSettings.siblings);
    const perSibling = parsePrice(sourceSettings.perSibling);
    const productColumnWidth = sourceSettings.productColumnWidth === undefined ? 'standard' : clean(sourceSettings.productColumnWidth);
    const autoBackupEnabled = sourceSettings.autoBackupEnabled === undefined ? false : sourceSettings.autoBackupEnabled;
    const autoBackupIntervalMinutes = sourceSettings.autoBackupIntervalMinutes === undefined ? 5 : parsePrice(sourceSettings.autoBackupIntervalMinutes);
    if (typeof enabled !== 'boolean' || !category || siblings === null || perSibling === null || !Number.isInteger(siblings) || siblings < 1 || !Number.isInteger(perSibling) || perSibling < 0 || !['compact', 'standard', 'wide'].includes(productColumnWidth) || typeof autoBackupEnabled !== 'boolean' || autoBackupIntervalMinutes === null || !Number.isInteger(autoBackupIntervalMinutes) || autoBackupIntervalMinutes < 1) {
      return { products: [], settings: null, warnings: ['設定一式ファイルの制限、表示またはバックアップ設定が不正です。'] };
    }
    let inventory = null;
    if (bundle.inventory != null) {
      const sourceInventory = bundle.inventory;
      const validCounts = (value) => value && typeof value === 'object' && !Array.isArray(value)
        && Object.values(value).every((count) => Number.isInteger(count) && count >= 0);
      const validAdjustments = Array.isArray(sourceInventory.adjustments) && sourceInventory.adjustments.every((entry) => (
        entry && typeof entry === 'object' && typeof entry.productId === 'string' && typeof entry.recordedAt === 'string'
        && Number.isInteger(entry.after) && entry.after >= 0
        && (entry.before === null || (Number.isInteger(entry.before) && entry.before >= 0))
      ));
      if (!validCounts(sourceInventory.salesByProduct) || !validCounts(sourceInventory.remainingByProduct) || !validAdjustments) {
        return { products: [], settings: null, inventory: null, warnings: ['設定一式ファイルの在庫情報が不正です。'] };
      }
      inventory = {
        salesByProduct: { ...sourceInventory.salesByProduct },
        remainingByProduct: { ...sourceInventory.remainingByProduct },
        adjustments: sourceInventory.adjustments.slice(0, 50).map((entry) => ({ ...entry })),
      };
    }
    return {
      products,
      inventory,
      settings: { enabled, category, siblings, perSibling, productColumnWidth, autoBackupEnabled, autoBackupIntervalMinutes },
      warnings: [],
    };
  }

  function parseSettingsCsv(text) {
    const rows = parseRows(text, detectDelimiter(text));
    const nonEmptyRows = rows.filter((row) => row.some((cell) => clean(cell)));
    const headerIndex = nonEmptyRows.findIndex((row) => {
      const headers = row.map(normalizeHeader);
      return headers.includes('制限有効') && headers.includes('対象カテゴリ');
    });
    if (headerIndex < 0 || !nonEmptyRows[headerIndex + 1]) {
      return { settings: null, warnings: ['制限設定CSVの見出しまたは設定行が見つかりません。'] };
    }
    const headers = nonEmptyRows[headerIndex].map(normalizeHeader);
    const row = nonEmptyRows[headerIndex + 1];
    const indexOf = (...names) => headers.findIndex((header) => names.includes(header));
    const indexes = {
      enabled: indexOf('制限有効'),
      category: indexOf('対象カテゴリ'),
      siblings: indexOf('きょうだい人数'),
      perSibling: indexOf('1人あたり上限'),
      productColumnWidth: indexOf('商品列幅'),
      autoBackupEnabled: indexOf('自動バックアップ有効'),
      autoBackupIntervalMinutes: indexOf('自動バックアップ間隔分'),
      autoBackupLastAt: indexOf('自動バックアップ最終出力'),
    };
    const required = ['enabled', 'category', 'siblings', 'perSibling'];
    const missing = required.filter((name) => indexes[name] < 0);
    if (missing.length) return { settings: null, warnings: [`制限設定CSVに必要な列がありません: ${missing.join('、')}`] };
    const parseBoolean = (value) => {
      const normalized = clean(value).toLowerCase();
      if (['true', '1', 'yes', '有効', 'はい'].includes(normalized)) return true;
      if (['false', '0', 'no', '無効', 'いいえ'].includes(normalized)) return false;
      return null;
    };
    const enabled = parseBoolean(row[indexes.enabled]);
    const category = clean(row[indexes.category]);
    const siblings = parsePrice(row[indexes.siblings]);
    const perSibling = parsePrice(row[indexes.perSibling]);
    if (enabled === null || !category || siblings === null || perSibling === null || !Number.isInteger(siblings) || siblings < 1 || !Number.isInteger(perSibling) || perSibling < 0) {
      return { settings: null, warnings: ['制限設定CSVの値が不正です。'] };
    }
    const autoBackupEnabled = indexes.autoBackupEnabled < 0 ? false : parseBoolean(row[indexes.autoBackupEnabled]);
    const interval = indexes.autoBackupIntervalMinutes < 0 ? 5 : parsePrice(row[indexes.autoBackupIntervalMinutes]);
    const productColumnWidth = indexes.productColumnWidth < 0 ? 'standard' : clean(row[indexes.productColumnWidth]);
    if (autoBackupEnabled === null || interval === null || !Number.isInteger(interval) || interval < 1 || !['compact', 'standard', 'wide'].includes(productColumnWidth)) {
      return { settings: null, warnings: ['表示または自動バックアップ設定の値が不正です。'] };
    }
    return {
      settings: {
        enabled,
        category,
        siblings,
        perSibling,
        productColumnWidth,
        autoBackupEnabled,
        autoBackupIntervalMinutes: interval,
        autoBackupLastAt: indexes.autoBackupLastAt < 0 ? '' : clean(row[indexes.autoBackupLastAt]),
      },
      warnings: [],
    };
  }

  function parseTransactionCsv(text) {
    const rows = parseRows(text, detectDelimiter(text));
    const warnings = [];
    const nonEmptyRows = rows.filter((row) => row.some((cell) => clean(cell)));
    const headerIndex = nonEmptyRows.findIndex((row) => {
      const headers = row.map(normalizeHeader);
      return headers.includes('会計id') && headers.includes('会計日時') && headers.includes('商品名');
    });
    if (headerIndex < 0) {
      return { transactions: [], warnings: ['会計履歴CSVの見出しが見つかりません。新しい形式で書き出したCSVを使用してください。'], stats: { accepted: 0, rejected: 0 } };
    }

    const headers = nonEmptyRows[headerIndex].map(normalizeHeader);
    const indexOf = (...names) => headers.findIndex((header) => names.includes(header));
    const indexes = {
      id: indexOf('会計id'),
      recordedAt: indexOf('会計日時'),
      total: indexOf('会計合計'),
      received: indexOf('お預かり'),
      change: indexOf('おつり'),
      itemCount: indexOf('会計点数'),
      category: indexOf('カテゴリ'),
      name: indexOf('商品名'),
      unitPrice: indexOf('単価'),
      quantity: indexOf('数量'),
      subtotal: indexOf('売上金額'),
      productId: indexOf('商品id'),
      note: indexOf('会計メモ'),
    };
    const missing = Object.entries(indexes).filter(([name, index]) => name !== 'productId' && name !== 'note' && index < 0).map(([name]) => name);
    if (missing.length) {
      return { transactions: [], warnings: [`会計履歴CSVに必要な列がありません: ${missing.join('、')}`], stats: { accepted: 0, rejected: 0 } };
    }

    // CSVは会計明細ごとに複数行になるため、会計IDで再結合する。商品ID列は旧形式では省略可。
    const transactionMap = new Map();
    let rejected = 0;
    nonEmptyRows.slice(headerIndex + 1).forEach((row, offset) => {
      const rowNumber = headerIndex + offset + 2;
      const id = clean(row[indexes.id]);
      const recordedAt = clean(row[indexes.recordedAt]);
      const total = parsePrice(row[indexes.total]);
      const received = parsePrice(row[indexes.received]);
      const change = parsePrice(row[indexes.change]);
      const itemCount = parsePrice(row[indexes.itemCount]);
      const category = clean(row[indexes.category]);
      const name = clean(row[indexes.name]);
      const unitPrice = parsePrice(row[indexes.unitPrice]);
      const quantity = parsePrice(row[indexes.quantity]);
      const subtotal = parsePrice(row[indexes.subtotal]);
      if (!id || !recordedAt || total === null || received === null || change === null || itemCount === null || !category || !name || unitPrice === null || quantity === null || subtotal === null || !Number.isInteger(quantity) || quantity < 1) {
        rejected += 1;
        warnings.push(`${rowNumber}行目: 会計履歴または商品明細が不正です`);
        return;
      }
      if (!transactionMap.has(id)) {
        const note = indexes.note >= 0 ? clean(row[indexes.note]) : '';
        transactionMap.set(id, { id, recordedAt, total, received, change, itemCount, items: [], ...(note ? { note } : {}) });
      }
      const transaction = transactionMap.get(id);
      if (!transaction.note && indexes.note >= 0 && clean(row[indexes.note])) transaction.note = clean(row[indexes.note]);
      const item = { category, name, unitPrice, quantity, subtotal };
      if (indexes.productId >= 0 && clean(row[indexes.productId])) item.productId = clean(row[indexes.productId]);
      transaction.items.push(item);
    });

    return { transactions: Array.from(transactionMap.values()), warnings, stats: { accepted: transactionMap.size, rejected } };
  }

  return { makeProduct, makeProductCopy, parseProductText, calculateCart, buildTransaction, calculatePurchaseLimit, upsertTransaction, removeTransaction, summarizeTransactions, summarizeWeekdayHours, transactionsToCsv, createInventoryLedger, applyInventoryTransactionChange, adjustInventory, summarizeInventoryAvailability, dailyCloseReport, productsToCsv, settingsToCsv, settingsBundleToJson, parseSettingsBundle, parseSettingsCsv, parseTransactionCsv };
});

