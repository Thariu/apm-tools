# 共通 ID / パスワード認証

社内向けの簡易認証です。ブラウザでアプリにアクセスする際に、共通の ID とパスワードを求めます。

> **注意**: Firestore のセキュリティルールは別途の設定です。API キーが分かると、認証を経由せずデータに直接アクセスできる可能性があります。社内ネットワーク・非公開 URL での利用を前提にしてください。

## 1. 環境変数を設定する

`.env.local`（または `.env`）に次を追加します。**3 つすべて**設定したときだけ認証が有効になります。

```env
AUTH_USERNAME=your_id
AUTH_PASSWORD=your_secret_password
AUTH_SESSION_SECRET=ランダムな長い文字列
```

`AUTH_SESSION_SECRET` は 32 文字以上のランダム文字列を推奨します。

```bash
# 例（PowerShell では別手段で生成してください）
openssl rand -base64 32
```

`.env.example` を参照してコピーしても構いません。

## 2. 開発サーバーを再起動する

```bash
npm run dev
```

## 3. 動作確認

1. http://localhost:3000 を開く → `/login` にリダイレクトされる
2. 設定した ID / パスワードでログイン → ボードが表示される
3. 「ログアウト」→ 再びログイン画面になる