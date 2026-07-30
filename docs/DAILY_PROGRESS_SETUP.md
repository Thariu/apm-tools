# 今日の進捗（ボード回答 + GAS 通知）

Chat カスタムアプリに依存せず、**ボード内 UI で進捗回答**し、**GAS で定時通知**する運用です。

タスクの正本はこれまでどおりプランニングボード（Firestore）です。

## アプリ側

### 画面

ヘッダーの **「今日の進捗」** タブ。  
画面内に **途中 / 夕** タブがあり、`slot` で初期表示が決まります。

| slot | 表示 |
|------|------|
| `midday` | **未完了のみ** ＋ 進捗ボタン ＋ 追加タスク |
| `evening` | 全日当タスク ＋ 進捗 ＋ 追加タスク |

`slot` 未指定で開いた場合は、JST の現在時刻から既定枠を選びます（17時以降: 夕、それ以外: 途中）。

朝の確認はデイリー MTG で行う想定のため、朝枠は廃止しています。旧 URL `slot=morning` は `midday` へフォールバックします。

### 直リンク（GAS 通知に使う）

```text
https://repo-todo.vercel.app/?view=dailyProgress&slot=midday
https://repo-todo.vercel.app/?view=dailyProgress&slot=evening

# 担当者を事前指定（任意）
https://repo-todo.vercel.app/?view=dailyProgress&slot=evening&assignee=針生
```

- タブを切り替えると URL の `slot` も更新されます
- `assignee` はボード上の担当者名（完全一致）。以降は localStorage に保持

### できること

- 進捗（未着手 / 25% / 50% / 75% / 完了）→ ToDo / Doing / Done
- 追加タスク（既存 / 新規 Backlog）— 途中・夕（MTG もタスク名に `MTG: …` 等を入れて追加可能）。新規はボードを選択可能
- **枠ごとの申告完了**（「完了」ボタン）とメンバー一覧（済 / 未）

### 申告完了

各タブ（途中 / 夕）の下部に **「完了」** があります。押すと未完了タスクの進捗がボードに反映され、その枠を申告済みとして記録します（取り消しも可）。  
画面上部の表で、当日のメンバーごとの済・未を確認できます。

### 当日タスク条件

- 担当者に本人が含まれる
- `startDate` と `dueDate` の両方があり、当日を含む
- `cant` 除外

## 通知（GAS）

サンプル: [`google/apps-script/DailyProgressNotifier.gs`](../google/apps-script/DailyProgressNotifier.gs)

1. [script.google.com](https://script.google.com) で新規プロジェクト
2. スクリプトを貼り付け
3. スクリプトプロパティ:

| キー | 内容 |
|------|------|
| `DAILY_PROGRESS_BASE_URL` | `https://repo-todo.vercel.app`（クエリなし推奨） |
| `CHAT_WEBHOOK_URL` | （任意）Chat Incoming Webhook |
| `NOTIFY_EMAILS` | （任意）カンマ区切りメール |

4. トリガー（時間主導）:

| 関数 | 目安 | 付与される URL |
|------|------|----------------|
| `notifyMidday` | 12:00 / 15:00 | `...?view=dailyProgress&slot=midday` |
| `notifyEvening` | 17:00 | `...?view=dailyProgress&slot=evening` |

`notifyMorning` は互換用に残してあり、**途中枠の URL** を送ります（既存 8:00 トリガーの移行用）。

### Chat Incoming Webhook の作り方（概要）

1. 通知先スペースを開く
2. スペース名 → アプリと統合 / Webhook を管理
3. Incoming Webhook を追加し URL をコピー
4. `CHAT_WEBHOOK_URL` に設定

Webhook が社内で使えない場合は `NOTIFY_EMAILS` のみで運用できます。

## Chat カスタムアプリについて

管理者制限で DM・アプリ検索が使えない場合は **不要** です。  
将来許可された場合の手順は [`CHAT_PROGRESS_SETUP.md`](./CHAT_PROGRESS_SETUP.md) を参照（任意）。

## 受け入れ確認

1. `?view=dailyProgress&slot=midday` で未完了のみ＋進捗ボタン＋追加タスク
2. `slot=evening` で進捗＋追加タスク
3. `slot=morning`（旧）で途中枠にフォールバック
4. 画面内タブ切替で URL の `slot` が変わる
5. 進捗操作＋申告完了でカンバンのレーンが変わる
6. GAS 通知文に枠ごとの URL が付く
