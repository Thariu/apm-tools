# プランニングボード（apm-tools）

チームのタスクとスプリントを、ブラウザ上のボードで共有する社内向けアプリです。Backlog と ToDo / Doing / Done を並べ、担当・期間・進捗をリアルタイムに同期します。

## 使い方（公開後）

サイトが開いたあとの操作は **[docs/USAGE.md](docs/USAGE.md)** を参照してください。

## 初めて公開する

パソコンにプログラムを入れなくても進められます。元リポジトリは [https://github.com/Thariu/apm-tools](https://github.com/Thariu/apm-tools) です。次を順に実施してください。

**[docs/SETUP.md](docs/SETUP.md)** … GitHub テンプレートで複製 → Firebase → Netlify

- 共通 ID / パスワード認証: **[docs/AUTH_SETUP.md](docs/AUTH_SETUP.md)**

## ローカルで開発する

```bash
npm i
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開きます。`.env.example` を `.env.local` にコピーし、[docs/SETUP.md](docs/SETUP.md) の手順 2-4 で控えた Firebase の 6 値を入れてください。

認証を使う場合は `AUTH_USERNAME` / `AUTH_PASSWORD` / `AUTH_SESSION_SECRET` も `.env.local` に設定します（[docs/AUTH_SETUP.md](docs/AUTH_SETUP.md)）。