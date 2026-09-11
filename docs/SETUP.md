# セットアップ手順（公開まで）

このアプリを **自分たちのサイトとして公開する** 手順です。パソコンにプログラムを入れる必要はありません。ブラウザだけで進められます。

元になるリポジトリは [https://github.com/Thariu/apm-tools](https://github.com/Thariu/apm-tools) です。

順番は次の 3 つです。途中で止めても、控えた値は消さないでください。

1. GitHub でリポジトリ（プログラム一式）を複製する
2. Firebase でデータを置く場所を作る
3. Netlify でサイトを公開する

必要なアカウント:

- GitHub
- Google（Firebase 用）
- Netlify（GitHub アカウントでログインできます）

> **社内向けの注意**: サイトにログイン画面を付けても、データの置き場（Firebase）は「誰でも読み書きできる」設定です。URL と設定値は関係者限りにしてください。

認証の詳細は [AUTH_SETUP.md](./AUTH_SETUP.md) を参照してください。自分のパソコンで開発する場合は [README.md](../README.md) の「ローカルで開発する」を参照してください。

## 0. 元リポジトリの管理者だけ（最初の 1 回）

チームでテンプレートとして使うには、元になる GitHub リポジトリで次を行います。すでにチェック済みならこの節は飛ばしてください。

1. リポジトリ [https://github.com/Thariu/apm-tools](https://github.com/Thariu/apm-tools) をブラウザで開く
2. **Settings**（設定）→ **General**（一般）
3. **Template repository**（テンプレートリポジトリ）にチェックを入れる
4. 組織の非公開リポジトリにする場合は、使う人に閲覧権限を付けておく

## 1. GitHub でリポジトリを複製する

GitHub の **テンプレート** 機能で、元のプログラム一式を自分（または組織）の新しいリポジトリとしてコピーします。

1. テンプレートリポジトリ [https://github.com/Thariu/apm-tools](https://github.com/Thariu/apm-tools) をブラウザで開く
2. 緑色の **Use this template**（このテンプレートを使用）→ **Create a new repository**（新しいリポジトリを作成）
3. 次を入力して作成する
  - **Owner**（所有者）: 自分、または所属組織
  - **Repository name**（リポジトリ名）: わかりやすい名前（例: `apm-tools`）
  - **Private**（非公開）を推奨
4. 作成後のアドレスを控える（例: `https://github.com/組織名/リポジトリ名`）

このあと Firebase のルール貼り付けで、この新しいリポジトリのファイルを開きます。  

## 2. Firebase でデータを置く場所を作る

ボードの内容（タスクなど）は Firebase の **Firestore**に保存します。

### 2-1. プロジェクトを作る

1. [Firebase Console](https://console.firebase.google.com/) に Google アカウントでログインする
2. **プロジェクトを追加** を押す
3. 名前を入力する（例: `agile-planning-board`）
4. Google アナリティクスはオフでよい
5. 作成完了まで待つ

### 2-2. Firestore を有効にする

1. 左メニュー **データベースとストレージ → Firestore**（英語 UI: **Databases & Storage → Firestore**）
2. **データベースの作成**
3. エディションは **Standard**（Standard edition）→ **次へ**
4. データベース ID はそのままでよい（通常は `(default)`）
5. ロケーションは例として `asia-northeast1`（東京）→ **次へ**
6. セキュリティルールの開始は **テストモード** でよい（次の節で差し替えます）
7. **作成**

無料プラン（Spark）では、プロジェクトあたり無料の Firestore は 1 つです。左メニューに「ビルド」が無いときは **データベースとストレージ** を探してください。

### 2-3. セキュリティルールを公開する

1. 手順 1 で作った **自分の GitHub リポジトリ** をブラウザで開く
2. ファイル一覧から `[firestore.rules](../firestore.rules)` をクリックし、中身をすべてコピーする
3. Firebase Console の **Database と Storage → Firestore** → **ルール** タブを開く
4. 既存の内容を消して貼り付ける
5. **公開** を押す

### 2-4. Web アプリを登録して値を控える

1. 歯車アイコンの **設定** を開く
2. **全般** → **マイアプリ** → **</> Web** をクリックする
3. ニックネームを入力する（例: `planning-board-web`）→ **アプリを登録**
4. 表示される設定のうち、次の 6つをメモする（Hosting の手順は **スキップ** してよい）


| 画面上の名前              | あとで Netlify に入れる名前                         |
| ------------------- | ------------------------------------------ |
| `apiKey`            | `NEXT_PUBLIC_FIREBASE_API_KEY`             |
| `authDomain`        | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`         |
| `projectId`         | `NEXT_PUBLIC_FIREBASE_PROJECT_ID`          |
| `storageBucket`     | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`      |
| `messagingSenderId` | `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` |
| `appId`             | `NEXT_PUBLIC_FIREBASE_APP_ID`              |


値は次の Netlify の画面に直接入れます。    


## 3. Netlify でサイトを公開する

Netlify は、GitHub 上のプログラムをインターネットのサイトにするサービスです。

### 3-1. GitHub のリポジトリとつなぐ

1. [Netlify](https://app.netlify.com/) を開き、**GitHub でログイン** する
2. **Add new site**（新しいサイトを追加）→ **Import an existing project**（既存プロジェクトをインポート）
3. GitHub を選び、手順 1 で **自分たちが作ったリポジトリ** を選ぶ（テンプレート元ではない）
4. ビルド設定は自動検出のままでよい
  - Build command: `npm run build`
  - Publish directory: `.next`
5. まだ Deploy（公開）せず、先に環境変数を入れる

Node.js の版が古いとビルドに失敗することがあります。そのときは **Site configuration**（サイト設定）→ **Environment variables**（環境変数）に `NODE_VERSION` を `20` で追加してください。

### 3-2. 環境変数を入れる

**Site configuration → Environment variables → Add a variable**（サイト設定 → 環境変数 → 変数を追加）

Production / Deploy Previews / Branch deploys のすべてに付けるのが無難です。値に引用符（`"`）は付けません。

**必須（手順 2-4 で控えた値）:**

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

**社内公開では推奨（入口の共通ログイン）:** 3 つすべて入れるとログイン画面が出ます。1 つでも欠けるとログインなしで開きます。

```
AUTH_USERNAME=チームで決めたID
AUTH_PASSWORD=チームで決めたパスワード
AUTH_SESSION_SECRET=32文字以上の長いランダム文字列
```

`AUTH_SESSION_SECRET` は、パスワードマネージャの生成機能を使うか、英数字を 32 文字以上並べてください。チームのログイン用パスワードとは別の値にします。

`NEXT_PUBLIC_` で始まる値をあとから変えたときは、**再デプロイ（再ビルド）** が必要です。

認証の詳細は [AUTH_SETUP.md](./AUTH_SETUP.md) を参照してください。

### 3-3. 公開する

環境変数を保存したあと、**Deploys → Trigger deploy → Deploy site**（デプロイ → デプロイを実行 → サイトをデプロイ）を実行します。GitHub の main（または master）へ push しても公開されます。

成功すると `https://（サイト名）.netlify.app` のような URL が付きます。  

## 4. 動作確認

- [ ] `https://（サイト名）.netlify.app` が開く
- [ ] 認証を入れた場合はログイン画面が出て、決めた ID / パスワードで入れる
- [ ] タスクの追加・編集・ドラッグが保存される（再読み込みしても残る）
- [ ] 別のブラウザ（またはシークレットウィンドウ）でも同じ内容が見える
- [ ] ログアウトできる（認証を入れた場合）

初回アクセス時に、サンプル用のデータが自動で入ります。