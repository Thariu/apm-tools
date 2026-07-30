# Firebase（Firestore + Realtime）セットアップ手順
このアプリは **認証なし** で Firestore に読み書きし、`onSnapshot` でリアルタイム同期します。社内ネットワーク・非公開 URL 前提で利用してください。


## 1. Firebase プロジェクトを作る
1. [Firebase Console](https://console.firebase.google.com/) にログイン
2. **プロジェクトを追加** → 名前を入力（例: `agile-planning-board`）
3. Google アナリティクスは任意（オフでも可）
4. 作成完了まで待つ


## 2. Firestore を有効化
1. 左メニュー **Build → Firestore Database**
2. **データベースの作成**
3. ロケーションを選択（例: `asia-northeast1`）
4. セキュリティルールは一旦 **テストモード** で開始してもよい（後で 3 のルールに差し替え）
> Spark（無料）プランでは、プロジェクトあたり **無料枠の Firestore データベースは 1 つ** です。


## 3. セキュリティルールを公開する
1. Firestore → **ルール** タブ
2. リポジトリの [`firestore.rules`](../firestore.rules) の内容を貼り付け
3. **公開**
認証を使わないため、**anon（未ログイン）でも読み書き可能** なルールです。API キーが漏れるとデータ改ざんのリスクがあります。


## 4. Web アプリを登録する
1. プロジェクトのホーム（歯車 **プロジェクトの設定**）
2. **全般** → **マイアプリ** → **</> Web** をクリック
3. アプリのニックネーム（例: `planning-board-web`）を入力 → **アプリを登録**
4. 表示される `firebaseConfig` の値を控える:
```javascript
const firebaseConfig = {
  apiKey: "...",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "...",
  appId: "1:...:web:...",
};
```
5. **コンソールへ** で完了（Hosting の手順はスキップ可）


## 5. 環境変数を設定する
プロジェクトルートの `.env.local` を次の形式で作成（既存の Supabase 用の行は削除して差し替え）:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=あなたのapiKey
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=あなたのprojectId.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=あなたのprojectId
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=あなたのprojectId.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=あなたのmessagingSenderId
NEXT_PUBLIC_FIREBASE_APP_ID=あなたのappId
```
`.env.example` をコピーしても構いません。


## 6. 開発サーバーを起動する
```bash
npm i
npm run dev
```
1. ブラウザで http://localhost:3000 を開く
2. 初回アクセス時に **モックデータが自動 seed** されます（`planning_meta/app` に `seeded: true` が付く）
3. 別ブラウザ／別 PC から同じプロジェクトを開くと、**Realtime で変更が同期** されます


## 7. 動作確認チェックリスト
- [ ] タスクの追加・編集・DnD が反映される
- [ ] リロード後もデータが残る
- [ ] 2 つのブラウザで同じボードを開き、片方の変更がもう片方に届く
- [ ] バーンダウン・バーンアップの操作がエラーにならない


## トラブルシューティング
| 症状 | 対処 |
|------|------|
| 「Firebase が未設定です」 | `.env.local` の 6 変数と `npm run dev` の再起動 |
| `Missing or insufficient permissions` | `firestore.rules` を公開済みか確認 |
| データが空のまま | コンソールで `planning_meta/app` の `seeded` を確認。未 seed ならページを再読み込み |
| Realtime が届かない | オフライン永続化の影響を疑い、ハードリロード。Firestore ルール・ネットワークを確認 |


## データ構造（参考）
```
planning_meta/
  app                 … { seeded: true }
  burndown_sprint     … 全ボード共通スプリント設定

boards/{boardId}/
  product_backlog/{id}
  tasks/{id}
  schedule/default
  burndown_snapshots/{YYYY-MM-DD}
  release_burnup/config
  finalized_sprints/{sprintTuesdayIso}
```
`boardId`: `ad_hoc` | `baseball_board` | `proposal_improvement`


## 無料プランの目安
- Realtime は Firestore の `onSnapshot` で実現（追加課金の Realtime Database は未使用）
- 読み取り 50,000 / 日、書き込み 20,000 / 日（[クォータ](https://firebase.google.com/docs/firestore/quotas)）
- バーンダウン WIP は 3 秒 debounce で書き込み回数を抑制しています
