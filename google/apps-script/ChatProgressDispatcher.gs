/**
 * プランニング進捗カードの定時送信（Apps Script）
 *
 * 使い方:
 * 1. script.google.com で新規プロジェクト
 * 2. このファイルを貼り付け
 * 3. スクリプトプロパティに設定:
 *    - CHAT_CRON_BASE_URL = https://repo-todo.vercel.app/api/chat/cron
 *    - CHAT_SYNC_SECRET   = （Vercel の CHAT_SYNC_SECRET と同じ）
 * 4. トリガーを時間主導で作成（朝 8:00 / 12:00 / 15:00 / 17:00）
 */

function dispatchSlot_(slot) {
  const props = PropertiesService.getScriptProperties();
  const base = props.getProperty("CHAT_CRON_BASE_URL");
  const secret = props.getProperty("CHAT_SYNC_SECRET");
  if (!base || !secret) {
    throw new Error("CHAT_CRON_BASE_URL / CHAT_SYNC_SECRET を設定してください");
  }

  const url =
    base.replace(/\?.*$/, "") +
    "?key=" +
    encodeURIComponent(secret) +
    "&slot=" +
    encodeURIComponent(slot);

  const res = UrlFetchApp.fetch(url, {
    method: "get",
    muteHttpExceptions: true,
  });

  const code = res.getResponseCode();
  const body = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error("cron failed " + code + ": " + body);
  }
  Logger.log(slot + " => " + body);
}

function dispatchMorning() {
  dispatchSlot_("morning");
}

function dispatchMidday() {
  dispatchSlot_("midday");
}

function dispatchEvening() {
  dispatchSlot_("evening");
}
