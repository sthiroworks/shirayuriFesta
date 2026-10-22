(function (root) {
  'use strict';

  const TOKEN_KEY = 'shirayuri-d1-session-v1';
  const ADMIN_TOKEN_KEY = 'shirayuri-d1-admin-session-v2';

  function apiUrl() {
    return String(root.SHIRAYURI_D1_API_URL || '').trim().replace(/\/+$/, '');
  }

  function isConfigured() {
    return /^https?:\/\//i.test(apiUrl());
  }

  function getToken() {
    try { return root.sessionStorage.getItem(TOKEN_KEY) || ''; } catch (error) { return ''; }
  }

  function getAdminToken() {
    try { return root.sessionStorage.getItem(ADMIN_TOKEN_KEY) || ''; } catch (error) { return ''; }
  }

  function setToken(token) {
    try {
      if (token) root.sessionStorage.setItem(TOKEN_KEY, token);
      else root.sessionStorage.removeItem(TOKEN_KEY);
    } catch (error) {
      if (token) throw new Error('このブラウザではログイン状態を保存できません。通常のブラウザ画面で開いてください。');
    }
  }

  function setAdminToken(token) {
    try {
      if (token) root.sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
      else root.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    } catch (error) {
      if (token) throw new Error('このブラウザでは管理者ログイン状態を保存できません。通常のブラウザ画面で開いてください。');
    }
  }

  async function request(path, options = {}) {
    if (!isConfigured()) throw new Error('D1 APIの接続先が設定されていません。');
    const headers = new Headers(options.headers || {});
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    const token = options.auth === false ? '' : options.tokenType === 'admin' ? getAdminToken() : getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    let response;
    try {
      response = await root.fetch(`${apiUrl()}${path}`, {
        method: options.method || 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        mode: 'cors',
        cache: 'no-store',
      });
    } catch (error) {
      throw new Error('共有サーバーに接続できません。通信環境とWorkerのURL・公開状態を確認してください。');
    }
    let result = {};
    try { result = await response.json(); } catch (error) { /* エラー本文がJSONでない場合 */ }
    if (response.status === 401) {
      if (options.tokenType === 'admin') setAdminToken('');
      else setToken('');
    }
    if (!response.ok) {
      const error = new Error(result.error || `共有サーバーでエラーが発生しました (${response.status})`);
      error.status = response.status;
      error.payload = result;
      throw error;
    }
    return result;
  }

  async function login(password) {
    const result = await request('/api/login', { method: 'POST', auth: false, body: { password } });
    setToken(result.token);
    return result;
  }

  async function adminLogin(password) {
    const result = await request('/api/admin/login', { method: 'POST', auth: false, body: { password } });
    setAdminToken(result.token);
    return result;
  }

  function isAdminAuthenticated() { return Boolean(getAdminToken()); }
  function adminLogout() { setAdminToken(''); }
  function logout() { setToken(''); setAdminToken(''); }
  function getState() { return request('/api/state'); }
  function initialize(snapshot) { return request('/api/initialize', { method: 'POST', body: snapshot, tokenType: 'admin' }); }
  function save(snapshot) {
    const changes = snapshot && snapshot.changes;
    const requiresAdmin = Boolean(changes && (
      ['products', 'productOrder', 'settings'].some((key) => Object.prototype.hasOwnProperty.call(changes, key))
      || (Object.prototype.hasOwnProperty.call(changes, 'inventory') && !Object.prototype.hasOwnProperty.call(changes, 'transactions'))
      || (changes.transactions && Array.isArray(changes.transactions.remove) && changes.transactions.remove.length > 0)
    ));
    return request('/api/sync', { method: 'POST', body: snapshot, tokenType: requiresAdmin ? 'admin' : 'register' });
  }
  function getChanges(after) { return request(`/api/changes?after=${encodeURIComponent(after)}`); }

  root.SalesRegisterD1Client = Object.freeze({ isConfigured, getToken, getAdminToken, isAdminAuthenticated, login, adminLogin, logout, adminLogout, getState, initialize, save, getChanges });
})(typeof window !== 'undefined' ? window : globalThis);
