# Cloudflare Workers + D1 の設定

画面ファイルはGitHub Pages、共有データはCloudflare Worker経由のD1に置きます。Cloudflareアカウントへの作成・デプロイはまだ行っていません。以下の値を設定してから公開してください。

## 1. D1データベースを作成

Cloudflareアカウントを用意し、PowerShellでリポジトリの `cloudflare` フォルダへ移動します。

```powershell
cd C:\work\sryfst\shirayuriFesta\cloudflare
npx wrangler login
npx wrangler d1 create shirayuri-festa-register --update-config=false
```

コマンド出力の `database_id` をコピーし、`cloudflare/wrangler.toml` の `PASTE_D1_DATABASE_ID_HERE` と置き換えます。

## 2. Workerの接続元を設定

`cloudflare/wrangler.toml` の `ALLOWED_ORIGINS` を、GitHub Pagesサイトの**Origin**に変更します。Originにはパスや末尾の `/` を含めません。

```toml
ALLOWED_ORIGINS = "https://アカウント名.github.io"
```

独自ドメインで公開する場合は、そのOrigin（例 `https://register.example.jp`）を指定します。ローカルで動作確認する場合は、使うURLもカンマ区切りで追加します。

```toml
ALLOWED_ORIGINS = "https://アカウント名.github.io,http://localhost:8769,http://127.0.0.1:8769"
```

## 3. テーブルを作成して秘密情報を登録

```powershell
npx wrangler d1 migrations apply shirayuri-festa-register --remote
npx wrangler secret put APP_PASSWORD
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
```

`APP_PASSWORD` は利用端末で共有するログイン用パスワード、`ADMIN_PASSWORD` は商品・在庫・設定などを変更する管理者用パスワードです。必ず別の長いパスワード（目安16文字以上）を設定してください。`SESSION_SECRET` にはパスワードとは別の十分に長いランダム文字列を設定します。どれもGitHubへコミットせず、CloudflareのSecretとして保管してください。

## 4. APIを公開

```powershell
npx wrangler deploy
```

出力された `https://...workers.dev` のURLを、GitHub Pagesで配信している `api-config.js` の値に設定します。

```js
root.SHIRAYURI_D1_API_URL = 'https://デプロイ時に表示されたWorkerのURL';
```

GitHub Pagesがリポジトリのルートを公開する場合はルートの `api-config.js` を更新します。`dist` を公開している場合は `dist/api-config.js` も同じURLに更新してください。変更した画面ファイルをGitHub Pagesへ反映します。

## 5. 初回データを登録

公開されたページを開き、共有パスワードでログインします。D1が空の場合、画面に表示される初回確認で、この端末の商品・会計履歴・在庫・購入制限を登録します。

初回登録前に、どの端末のデータを正本にするか決めてください。**複数端末のlocalStorageデータを自動で合算することはありません。**登録後は他の端末から同じURLを開いてログインすれば、D1の共有データが読み込まれます。

**API URLを有効にする前に、各端末で必要な商品・会計履歴をバックアップしてください。**共有DBと端末内データが異なる場合はログイン後に置き換え確認が表示されます。キャンセルすれば端末内データはそのままですが、D1へ自動統合はされません。

## 本番とは別のテストURL

本番のGitHub Pagesはそのままにして、Cloudflare Pagesに別プロジェクト `shirayuri-festa-preview` を作成し、同じGitHubリポジトリを接続します。Production branchを`main`、Preview branchを`test`に設定すると、テストブランチの固定URLは `https://test.shirayuri-festa-preview.pages.dev` になります。Cloudflare Pagesのプレビューは本番サイトの公開先を変更しません。[ブランチ別プレビューの仕様](https://developers.cloudflare.com/pages/configuration/preview-deployments/)

テスト用API・DBは本番と完全に分けます。`test`ブランチのコードをGitHubへpushした後、Cloudflare CLIで`cloudflare`フォルダから次を実行します。

```powershell
npx wrangler login
npx wrangler d1 create shirayuri-festa-register-staging --update-config=false
```

作成されたIDを `wrangler.staging.toml` の `PASTE_STAGING_D1_DATABASE_ID_HERE` に設定し、テスト用DBへ初期スキーマを適用します。

```powershell
npx wrangler d1 migrations apply shirayuri-festa-register-staging --remote --config wrangler.staging.toml
npx wrangler secret put APP_PASSWORD --config wrangler.staging.toml
npx wrangler secret put ADMIN_PASSWORD --config wrangler.staging.toml
npx wrangler secret put SESSION_SECRET --config wrangler.staging.toml
npx wrangler deploy --config wrangler.staging.toml
```

テスト用Worker URLはdeployの出力に表示されます。そのURLを**`test`ブランチの** `api-config.js` に設定してpushしてください。Cloudflare Pagesがブランチを自動公開し、`https://test.shirayuri-festa-preview.pages.dev` から独立したテストデータを使えます。プロジェクト名が使用済みの場合は、Pagesの作成名と `wrangler.staging.toml` の `ALLOWED_ORIGINS` を同じ別名にしてください。

Cloudflare PagesのプレビューURLはインターネット上から開けるため、テスト用パスワードを本番と共用せず、テストデータも実データにしないでください。アカウントのGitHub連携とCloudflareログインが必要です。

## 保存・同期のルール

- 会計、商品、在庫、購入制限はD1に保存します。会計確定はサーバー保存が成功してから完了扱いになります。通信できない時はカートを残し、ローカルだけで確定しません。
- 同時更新は版番号で検知します。別端末の保存が先なら古いデータの書き込みを拒否し、最新データを読み込んでから再操作を促します。
- 他端末の変更は通常15秒以内、またはページに戻った時に反映されます。
- 商品列幅、自動バックアップの設定・保存フォルダは端末ごとの設定です。会計履歴CSVの自動バックアップ先も各端末で選びます。
- 共有ログイン用の`APP_PASSWORD`と管理者用の`ADMIN_PASSWORD`は別々に設定します。利用者別アカウントや操作履歴のユーザー識別はありませんが、共有モードでは「管理」を開く際に管理者パスワードを求め、商品・在庫・購入制限などの変更を管理者だけに制限します。
- `api-config.js` が空欄なら従来の端末内保存です。D1を有効にした後は、Workerに接続できない状態で会計を確定できないようにしています。

## ローカルでWorkerを試す

```powershell
npx wrangler dev
```

`api-config.js` に表示されたローカルWorker URLを設定し、`ALLOWED_ORIGINS` にローカル画面のOriginを追加します。リモートD1への誤接続を避けるため、本番データを使う場合はCloudflare DashboardのD1 binding設定を明示的に確認してください。
