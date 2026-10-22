(function (root) {
  'use strict';

  // D1を使う場合、Cloudflare WorkerのURLを入力します。空欄なら従来どおり端末内保存です。
  // 本番の接続先は環境ごとに設定します。空欄では端末内保存を使用します。
  root.SHIRAYURI_D1_API_URL = '';
  if (root.document && /^https?:\/\//i.test(root.SHIRAYURI_D1_API_URL.trim())) {
    root.document.documentElement.dataset.sharedGate = 'locked';
  }
})(typeof window !== 'undefined' ? window : globalThis);
