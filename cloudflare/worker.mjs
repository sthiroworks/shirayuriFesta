const DEFAULT_SETTINGS = Object.freeze({ enabled: true, category: '古園服', siblings: 1, perSibling: 4 });
const DEFAULT_INVENTORY = Object.freeze({ salesByProduct: {}, remainingByProduct: {}, adjustments: [] });
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const MAX_BATCH_STATEMENTS = 4500;
const CHANGE_LOG_RETENTION = 2000;
const MAX_CHANGES_PER_RESPONSE = 100;
const encoder = new TextEncoder();

function jsonResponse(value, status, corsHeaders) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders },
  });
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '').split(/[\s,]+/).map((origin) => origin.trim()).filter(Boolean);
}

function makeCorsHeaders(origin, env) {
  const headers = { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
  if (origin && allowedOrigins(env).includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function constantTimeEqual(left, right) {
  const a = encoder.encode(String(left));
  const b = encoder.encode(String(right));
  let difference = a.length ^ b.length;
  const size = Math.max(a.length, b.length);
  for (let index = 0; index < size; index += 1) difference |= (a[index] || 0) ^ (b[index] || 0);
  return difference === 0;
}

async function signToken(payload, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const encodedPayload = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(encodedPayload));
  return `${encodedPayload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function verifyToken(token, secret) {
  const [encodedPayload, encodedSignature, extra] = String(token || '').split('.');
  if (!encodedPayload || !encodedSignature || extra) return null;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('HMAC', key, base64UrlDecode(encodedSignature), encoder.encode(encodedPayload));
  if (!valid) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload)));
    return payload.aud === 'shirayuri-festa' && Number(payload.exp) > Math.floor(Date.now() / 1000) ? payload : null;
  } catch (error) {
    return null;
  }
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function validateSnapshot(input) {
  if (!isPlainObject(input)) throw new Error('共有データの形式が正しくありません。');
  const products = input.products;
  const transactions = input.transactions;
  const inventory = input.inventory;
  const settings = input.settings;
  if (!Array.isArray(products) || products.length > 5000 || !products.every((item) => (
    isPlainObject(item) && typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 200
    && typeof item.name === 'string' && item.name.length <= 500 && typeof item.category === 'string' && item.category.length <= 200
    && Number.isFinite(item.unitPrice) && (item.stockLimit === undefined || (Number.isInteger(item.stockLimit) && item.stockLimit >= 0))
  ))) throw new Error('商品一覧の形式または件数が正しくありません。');
  if (new Set(products.map((item) => item.id)).size !== products.length) throw new Error('商品IDが重複しています。');
  if (!Array.isArray(transactions) || transactions.length > 100000 || !transactions.every((item) => (
    isPlainObject(item) && typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 200
    && typeof item.recordedAt === 'string' && item.recordedAt.length <= 100
    && Number.isFinite(item.total) && Number.isFinite(item.received) && Number.isFinite(item.change)
    && Number.isFinite(item.itemCount) && Array.isArray(item.items)
  ))) throw new Error('会計履歴の形式または件数が正しくありません。');
  if (new Set(transactions.map((item) => item.id)).size !== transactions.length) throw new Error('会計IDが重複しています。');
  if (products.some((item) => encoder.encode(JSON.stringify(item)).length > 1_900_000)
    || transactions.some((item) => encoder.encode(JSON.stringify(item)).length > 1_900_000)) {
    throw Object.assign(new Error('商品画像または会計明細が大きすぎます。画像を小さくしてから再度お試しください。'), { status: 413 });
  }
  if (!isPlainObject(inventory) || !isPlainObject(inventory.salesByProduct) || !isPlainObject(inventory.remainingByProduct)
    || !Array.isArray(inventory.adjustments) || inventory.adjustments.length > 100000) throw new Error('在庫台帳の形式が正しくありません。');
  for (const counts of [inventory.salesByProduct, inventory.remainingByProduct]) {
    if (Object.keys(counts).length > 10000 || !Object.values(counts).every((count) => Number.isInteger(count) && count >= 0)) {
      throw new Error('在庫台帳の個数が正しくありません。');
    }
  }
  if (!isPlainObject(settings) || typeof settings.enabled !== 'boolean' || typeof settings.category !== 'string'
    || !Number.isInteger(settings.siblings) || settings.siblings < 1 || settings.siblings > 1000
    || !Number.isInteger(settings.perSibling) || settings.perSibling < 0 || settings.perSibling > 10000) {
    throw new Error('購入制限設定の形式が正しくありません。');
  }
  return {
    products,
    transactions,
    inventory: { salesByProduct: inventory.salesByProduct, remainingByProduct: inventory.remainingByProduct, adjustments: inventory.adjustments },
    settings: { enabled: settings.enabled, category: settings.category, siblings: settings.siblings, perSibling: settings.perSibling },
  };
}

function validateChanges(input) {
  if (!isPlainObject(input)) throw new Error('同期差分の形式が正しくありません。');
  const changes = {};
  for (const key of ['products', 'transactions']) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const delta = input[key];
    if (!isPlainObject(delta) || !Array.isArray(delta.upsert) || !Array.isArray(delta.remove)) throw new Error('同期差分の形式が正しくありません。');
    const validated = validateSnapshot({
      products: key === 'products' ? delta.upsert : [],
      transactions: key === 'transactions' ? delta.upsert : [],
      inventory: DEFAULT_INVENTORY,
      settings: DEFAULT_SETTINGS,
    });
    const items = key === 'products' ? validated.products : validated.transactions;
    const ids = items.map((item) => item.id);
    if (!delta.remove.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 200)
      || new Set(delta.remove).size !== delta.remove.length
      || delta.remove.some((id) => ids.includes(id))) throw new Error('同期対象のIDが重複または不正です。');
    changes[key] = { upsert: items, remove: delta.remove };
  }
  if (Object.prototype.hasOwnProperty.call(input, 'inventory')) {
    changes.inventory = validateSnapshot({ products: [], transactions: [], inventory: input.inventory, settings: DEFAULT_SETTINGS }).inventory;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'productOrder')) {
    const order = input.productOrder;
    if (!Array.isArray(order) || order.length > 5000 || !order.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 200)
      || new Set(order).size !== order.length) throw new Error('商品一覧の並び順が不正です。');
    changes.productOrder = order;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'settings')) {
    changes.settings = validateSnapshot({ products: [], transactions: [], inventory: DEFAULT_INVENTORY, settings: input.settings }).settings;
  }
  return changes;
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch (error) { return fallback; }
}

function rowsFrom(result) {
  return result && Array.isArray(result.results) ? result.results : [];
}

async function readSnapshot(db) {
  const [meta, productResult, transactionResult] = await Promise.all([
    db.prepare('SELECT revision, initialized, settings_json, inventory_json FROM app_meta WHERE singleton_id = 1').first(),
    db.prepare('SELECT id, data_json FROM products ORDER BY sort_order, id').all(),
    db.prepare('SELECT id, data_json FROM transactions ORDER BY recorded_at DESC, id DESC').all(),
  ]);
  if (!meta) throw new Error('D1の初期化が必要です。マイグレーションを実行してください。');
  return {
    initialized: Boolean(meta.initialized),
    revision: Number(meta.revision) || 0,
    settings: parseJson(meta.settings_json, DEFAULT_SETTINGS),
    inventory: parseJson(meta.inventory_json, DEFAULT_INVENTORY),
    products: rowsFrom(productResult).map((row) => parseJson(row.data_json, null)).filter(Boolean),
    transactions: rowsFrom(transactionResult).map((row) => parseJson(row.data_json, null)).filter(Boolean),
  };
}

function makeDiff(currentItems, nextItems) {
  const current = new Map(currentItems.map((item) => [item.id, item]));
  const next = new Map(nextItems.map((item) => [item.id, item]));
  const upsert = [];
  const remove = [];
  next.forEach((item, id) => {
    if (JSON.stringify(current.get(id)) !== JSON.stringify(item)) upsert.push(item);
  });
  current.forEach((item, id) => { if (!next.has(id)) remove.push(id); });
  return { upsert, remove };
}

function d1Conflict(revision) {
  const error = new Error('別の端末で先にデータが更新されました。最新データを読み込み直してください。');
  error.status = 409;
  error.revision = revision;
  return error;
}

function guardSql(sql, bindValues, revision, requestId) {
  return sql.bind(...bindValues, revision, requestId);
}

async function initializeDatabase(db, rawSnapshot) {
  const snapshot = validateSnapshot(rawSnapshot);
  const requestId = crypto.randomUUID();
  const nextRevision = 1;
  const statements = [db.prepare(`UPDATE app_meta SET revision = ?, initialized = 1, settings_json = ?, inventory_json = ?, last_request_id = ?
    WHERE singleton_id = 1 AND initialized = 0 AND revision = 0`)
    .bind(nextRevision, JSON.stringify(snapshot.settings), JSON.stringify(snapshot.inventory), requestId)];
  snapshot.products.forEach((product, position) => statements.push(guardSql(
    db.prepare(`INSERT INTO products (id, data_json, sort_order) SELECT ?, ?, ? WHERE EXISTS (
      SELECT 1 FROM app_meta WHERE singleton_id = 1 AND revision = ? AND last_request_id = ?)`),
    [product.id, JSON.stringify(product), position], nextRevision, requestId,
  )));
  snapshot.transactions.forEach((transaction) => statements.push(guardSql(
    db.prepare(`INSERT INTO transactions (id, recorded_at, data_json) SELECT ?, ?, ? WHERE EXISTS (
      SELECT 1 FROM app_meta WHERE singleton_id = 1 AND revision = ? AND last_request_id = ?)`),
    [transaction.id, transaction.recordedAt, JSON.stringify(transaction)], nextRevision, requestId,
  )));
  if (statements.length > MAX_BATCH_STATEMENTS) throw Object.assign(new Error('初回データが大きすぎます。会計履歴CSVを分けてから、もう一度初期設定してください。'), { status: 413 });
  const results = await db.batch(statements);
  if (!results[0]?.meta?.changes) {
    const meta = await db.prepare('SELECT revision FROM app_meta WHERE singleton_id = 1').first();
    throw d1Conflict(Number(meta && meta.revision) || 0);
  }
  return { revision: nextRevision };
}

async function syncDatabase(db, expectedRevision, rawChanges) {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw new Error('同期番号が不正です。');
  const changes = validateChanges(rawChanges);
  const meta = await db.prepare('SELECT revision, initialized, settings_json, inventory_json FROM app_meta WHERE singleton_id = 1').first();
  if (!meta || !meta.initialized) throw Object.assign(new Error('共有データの初期設定が必要です。'), { status: 428 });
  const currentRevision = Number(meta.revision) || 0;
  if (currentRevision !== expectedRevision) throw d1Conflict(currentRevision);
  const currentInventory = parseJson(meta.inventory_json, DEFAULT_INVENTORY);
  const currentSettings = parseJson(meta.settings_json, DEFAULT_SETTINGS);
  const nextInventory = changes.inventory || currentInventory;
  const nextSettings = changes.settings || currentSettings;
  const inventoryChanged = Object.prototype.hasOwnProperty.call(changes, 'inventory') && JSON.stringify(currentInventory) !== JSON.stringify(nextInventory);
  const settingsChanged = Object.prototype.hasOwnProperty.call(changes, 'settings') && JSON.stringify(currentSettings) !== JSON.stringify(nextSettings);
  const productChanges = changes.products || { upsert: [], remove: [] };
  const transactionChanges = changes.transactions || { upsert: [], remove: [] };
  const hasChanges = productChanges.upsert.length + productChanges.remove.length
    + transactionChanges.upsert.length + transactionChanges.remove.length > 0 || inventoryChanged || settingsChanged
    || Object.prototype.hasOwnProperty.call(changes, 'productOrder');
  if (!hasChanges) return { revision: currentRevision, changed: false };

  const nextRevision = currentRevision + 1;
  const requestId = crypto.randomUUID();
  const eventChanges = {};
  if (productChanges.upsert.length || productChanges.remove.length) eventChanges.products = productChanges;
  if (Object.prototype.hasOwnProperty.call(changes, 'productOrder')) eventChanges.productOrder = changes.productOrder;
  if (transactionChanges.upsert.length || transactionChanges.remove.length) eventChanges.transactions = transactionChanges;
  if (inventoryChanged) eventChanges.inventory = nextInventory;
  if (settingsChanged) eventChanges.settings = nextSettings;
  const eventPayload = JSON.stringify({ revision: nextRevision, changes: eventChanges });
  // 大きな一括復元でも同期を止めない。イベントは小さなリセット通知にし、受信端末は完全状態を再読込する。
  const logPayload = encoder.encode(eventPayload).length > 1_500_000
    ? JSON.stringify({ revision: nextRevision, reset: true })
    : eventPayload;
  const statements = [db.prepare(`UPDATE app_meta SET revision = ?, initialized = 1, settings_json = ?, inventory_json = ?, last_request_id = ?
    WHERE singleton_id = 1 AND initialized = 1 AND revision = ?`)
    .bind(nextRevision, JSON.stringify(nextSettings), JSON.stringify(nextInventory), requestId, currentRevision)];
  productChanges.remove.forEach((id) => statements.push(guardSql(
    db.prepare(`DELETE FROM products WHERE id = ? AND EXISTS (
      SELECT 1 FROM app_meta WHERE singleton_id = 1 AND revision = ? AND last_request_id = ?)`),
    [id], nextRevision, requestId,
  )));
  productChanges.upsert.forEach((product) => statements.push(guardSql(
    db.prepare(`INSERT INTO products (id, data_json, sort_order) SELECT ?, ?, 0 WHERE EXISTS (
      SELECT 1 FROM app_meta WHERE singleton_id = 1 AND revision = ? AND last_request_id = ?)
      ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json`),
    [product.id, JSON.stringify(product)], nextRevision, requestId,
  )));
  (changes.productOrder || []).forEach((id, position) => statements.push(guardSql(
    db.prepare(`UPDATE products SET sort_order = ? WHERE id = ? AND EXISTS (
      SELECT 1 FROM app_meta WHERE singleton_id = 1 AND revision = ? AND last_request_id = ?)`),
    [position, id], nextRevision, requestId,
  )));
  transactionChanges.remove.forEach((id) => statements.push(guardSql(
    db.prepare(`DELETE FROM transactions WHERE id = ? AND EXISTS (
      SELECT 1 FROM app_meta WHERE singleton_id = 1 AND revision = ? AND last_request_id = ?)`),
    [id], nextRevision, requestId,
  )));
  transactionChanges.upsert.forEach((transaction) => statements.push(guardSql(
    db.prepare(`INSERT INTO transactions (id, recorded_at, data_json) SELECT ?, ?, ? WHERE EXISTS (
      SELECT 1 FROM app_meta WHERE singleton_id = 1 AND revision = ? AND last_request_id = ?)
      ON CONFLICT(id) DO UPDATE SET recorded_at = excluded.recorded_at, data_json = excluded.data_json`),
    [transaction.id, transaction.recordedAt, JSON.stringify(transaction)], nextRevision, requestId,
  )));
  statements.push(guardSql(
    db.prepare(`INSERT INTO change_log (revision, payload_json, created_at) SELECT ?, ?, ? WHERE EXISTS (
      SELECT 1 FROM app_meta WHERE singleton_id = 1 AND revision = ? AND last_request_id = ?)`),
    [nextRevision, logPayload, new Date().toISOString()], nextRevision, requestId,
  ));
  if (nextRevision % 100 === 0) statements.push(guardSql(
    db.prepare(`DELETE FROM change_log WHERE revision <= ? AND EXISTS (
      SELECT 1 FROM app_meta WHERE singleton_id = 1 AND revision = ? AND last_request_id = ?)`),
    [Math.max(0, nextRevision - CHANGE_LOG_RETENTION)], nextRevision, requestId,
  ));
  if (statements.length > MAX_BATCH_STATEMENTS) {
    throw Object.assign(new Error('一度に変更するデータが多すぎます。会計履歴の復元を分けて実行してください。'), { status: 413 });
  }
  const results = await db.batch(statements);
  if (!results[0]?.meta?.changes) throw d1Conflict(currentRevision);
  return { revision: nextRevision, changed: true };
}

async function requireAuthorization(request, env, { admin = false } = {}) {
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const payload = env.SESSION_SECRET ? await verifyToken(token, env.SESSION_SECRET) : null;
  if (!payload) {
    throw Object.assign(new Error('ログインの有効期限が切れました。もう一度ログインしてください。'), { status: 401 });
  }
  if (admin && payload.scope !== 'admin') {
    throw Object.assign(new Error('管理者権限が必要です。管理パスワードで認証してください。'), { status: 403 });
  }
  return payload;
}

function changesRequireAdmin(changes) {
  if (!isPlainObject(changes)) return false;
  if (['products', 'productOrder', 'settings'].some((key) => Object.prototype.hasOwnProperty.call(changes, key))) return true;
  // 会計確定時の在庫更新は通常ログインで許可する。在庫だけの変更は管理操作として扱う。
  if (Object.prototype.hasOwnProperty.call(changes, 'inventory') && !Object.prototype.hasOwnProperty.call(changes, 'transactions')) return true;
  // 履歴の削除は在庫にも影響するため、管理操作として扱う。
  if (isPlainObject(changes.transactions) && Array.isArray(changes.transactions.remove) && changes.transactions.remove.length > 0) return true;
  return false;
}

async function readJson(request) {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > MAX_BODY_BYTES) throw Object.assign(new Error('送信データが大きすぎます。'), { status: 413 });
  const text = await request.text();
  if (encoder.encode(text).length > MAX_BODY_BYTES) throw Object.assign(new Error('送信データが大きすぎます。'), { status: 413 });
  try { return JSON.parse(text); } catch (error) { throw Object.assign(new Error('JSONの形式が正しくありません。'), { status: 400 }); }
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin') || '';
  const cors = makeCorsHeaders(origin, env);
  if (origin && !allowedOrigins(env).includes(origin)) return jsonResponse({ error: '許可されていない接続元です。' }, 403, {});
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (url.pathname === '/api/health' && request.method === 'GET') return jsonResponse({ ok: true }, 200, cors);

  try {
    if ((url.pathname === '/api/login' || url.pathname === '/api/admin/login') && request.method === 'POST') {
      const isAdminLogin = url.pathname === '/api/admin/login';
      const requiredPassword = isAdminLogin ? env.ADMIN_PASSWORD : env.APP_PASSWORD;
      if (!requiredPassword || !env.SESSION_SECRET) throw Object.assign(new Error('ログイン用シークレットが設定されていません。'), { status: 503 });
      const body = await readJson(request);
      if (typeof body.password !== 'string' || !constantTimeEqual(body.password, requiredPassword)) {
        throw Object.assign(new Error('パスワードが違います。'), { status: 401 });
      }
      const scope = isAdminLogin ? 'admin' : 'register';
      const token = await signToken({ aud: 'shirayuri-festa', scope, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60 }, env.SESSION_SECRET);
      return jsonResponse({ token, expiresIn: 12 * 60 * 60 }, 200, cors);
    }

    let body = null;
    if (url.pathname === '/api/initialize' && request.method === 'POST') body = await readJson(request);
    if (url.pathname === '/api/sync' && request.method === 'POST') body = await readJson(request);
    await requireAuthorization(request, env, {
      admin: url.pathname === '/api/initialize' || (url.pathname === '/api/sync' && changesRequireAdmin(body && body.changes)),
    });
    if (!env.DB) throw Object.assign(new Error('D1データベースの接続設定がありません。'), { status: 503 });
    if (url.pathname === '/api/state' && request.method === 'GET') return jsonResponse(await readSnapshot(env.DB), 200, cors);
    if (url.pathname === '/api/initialize' && request.method === 'POST') {
      return jsonResponse(await initializeDatabase(env.DB, body), 200, cors);
    }
    if (url.pathname === '/api/sync' && request.method === 'POST') {
      return jsonResponse(await syncDatabase(env.DB, body.expectedRevision, body.changes), 200, cors);
    }
    if (url.pathname === '/api/changes' && request.method === 'GET') {
      const after = Number(url.searchParams.get('after'));
      if (!Number.isInteger(after) || after < 0) throw Object.assign(new Error('同期番号が不正です。'), { status: 400 });
      const meta = await env.DB.prepare('SELECT revision FROM app_meta WHERE singleton_id = 1').first();
      if (!meta) throw new Error('D1の初期化が必要です。');
      const revision = Number(meta.revision) || 0;
      if (after === revision) return jsonResponse({ revision, events: [], hasMore: false }, 200, cors);
      if (after > revision) return jsonResponse({ revision, reset: true, events: [], hasMore: false }, 200, cors);
      const oldestRow = await env.DB.prepare('SELECT MIN(revision) AS oldest FROM change_log').first();
      const oldest = oldestRow && Number(oldestRow.oldest);
      if (!oldest || after < oldest - 1) return jsonResponse({ revision, reset: true, events: [], hasMore: false }, 200, cors);
      const result = await env.DB.prepare('SELECT revision, payload_json FROM change_log WHERE revision > ? ORDER BY revision LIMIT ?')
        .bind(after, MAX_CHANGES_PER_RESPONSE).all();
      const events = rowsFrom(result).map((row) => parseJson(row.payload_json, { revision: Number(row.revision), reset: true }));
      if (events.some((event) => event.reset)) return jsonResponse({ revision, reset: true, events: [], hasMore: false }, 200, cors);
      const lastRevision = events.length ? Number(events[events.length - 1].revision) : after;
      return jsonResponse({ revision, events, hasMore: lastRevision < revision }, 200, cors);
    }
    return jsonResponse({ error: 'APIが見つかりません。' }, 404, cors);
  } catch (error) {
    return jsonResponse({ error: error.message || 'サーバー内部でエラーが発生しました。', revision: error.revision }, error.status || 500, cors);
  }
}

export { validateSnapshot, validateChanges, makeDiff, changesRequireAdmin, initializeDatabase, syncDatabase, handleRequest };

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
