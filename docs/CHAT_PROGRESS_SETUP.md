# Chat 進捗通知（docs/CHAT_PROGRESS_SETUP.md）

> **運用の本線はボード内「今日の進捗」+ GAS 通知です。**  
> 手順は [`DAILY_PROGRESS_SETUP.md`](./DAILY_PROGRESS_SETUP.md) を先に参照してください。  
> 本ドキュメントは、Workspace 管理者により **Chat カスタムアプリ** が使える場合の任意手順です。

Google Chat から当日タスクを回答し、プランニングボードのレーンを更新します。

## 前提

- アプリが HTTPS 公開されていること（例: `https://repo-todo.vercel.app`）
- Firestore（既存）が利用可能であること
- Google Cloud で Chat API が有効、Chat アプリが作成済みであること

## 1. 環境変数

Vercel（または `.env.local`）に追加します。

```env
# 必須: events / cron / actions の共有秘密
CHAT_SYNC_SECRET=長いランダム文字列

# 必須: Chat のメール → ボード上の担当者名（完全一致）
CHAT_MEMBER_MAP={"you@example.com":"山田太郎"}

# 定時送信時に必要: メール → Chat space 名（DM の spaces/xxx）
CHAT_SPACE_MAP={"you@example.com":"spaces/AAAAAAAAA"}

# 定時送信時に必要: Chat API 呼び出し用アクセストークン
CHAT_ACCESS_TOKEN=
```

`CHAT_SYNC_SECRET` は Google Chat の HTTP エンドポイント URL の `key=` と同一にします。

## 2. Google Chat アプリ構成

Google Cloud Console → **Google Chat API** → **構成**

| 項目 | 値 |
|------|-----|
| Connection | **HTTP endpoint URL** |
| Triggers | 全トリガー共通 |
| URL | `https://repo-todo.vercel.app/api/chat/events?key=（CHAT_SYNC_SECRET）` |
| Interactive features | ON |
| Visibility | まず自分のメールのみ |

保存後、反映まで数分かかることがあります。

## 3. 疎通確認

1. ブラウザで  
   `https://repo-todo.vercel.app/api/chat/events?key=秘密`  
   → `{ "ok": true, ... }` なら公開パスと key は OK
2. Google Chat でアプリに DM → 「今日のタスク」
3. カードの進捗ボタンを押し、ボード上で ToDo / Doing / Done が変わることを確認

### デバッグ API

```text
GET /api/chat/daily-tasks?key=秘密&email=you@example.com
POST /api/chat/actions?key=秘密
```

## 4. 定時送信（任意・疎通後）

```text
GET|POST /api/chat/cron?key=秘密&slot=morning|midday|evening
```

| slot | 内容 |
|------|------|
| morning | 当日タスク + MTG/追加申告 |
| midday | 未完了のみ（0 件なら送らない） |
| evening | 進捗ボタン + 追加申告 |

Apps Script サンプル: [`google/apps-script/ChatProgressDispatcher.gs`](../google/apps-script/ChatProgressDispatcher.gs)

## 当日タスク条件

- 担当者に本人が含まれる
- `startDate` と `dueDate` の**両方**があり、当日を含む
- `cant` は除外

## 進捗 → レーン

| Chat | レーン |
|------|--------|
| 未着手 (0) | ToDo |
| 25 / 50 / 75 | Doing |
| 完了 (100) | Done |

## やらないこと

- スプレッドシート集計
- カレンダー API 連携（MTG は自己申告）
- Chat 内だけの別マスタ（正本は常にボード）
