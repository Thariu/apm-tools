/**
 * 今日の進捗 — 定時通知（Apps Script）
 *
 * 通知だけ送り、回答はボードの「今日の進捗」画面で行う。
 * 枠ごとに slot 付き URL を付ける。
 *
 * スクリプトプロパティ:
 *   DAILY_PROGRESS_BASE_URL  必須 例: https://repo-todo.vercel.app
 *     （互換: DAILY_PROGRESS_URL でも可。クエリは無視してベースに slot を付与）
 *   CHAT_WEBHOOK_URL         任意  Chat Incoming Webhook URL
 *   NOTIFY_EMAILS            任意  カンマ区切り
 *
 * URL 例:
 *   ?view=dailyProgress&slot=midday
 *   ?view=dailyProgress&slot=evening
 */

function getBaseUrl_() {
  const props = PropertiesService.getScriptProperties();
  var raw =
    props.getProperty("DAILY_PROGRESS_BASE_URL") ||
    props.getProperty("DAILY_PROGRESS_URL");
  if (!raw) {
    throw new Error(
      "DAILY_PROGRESS_BASE_URL（または DAILY_PROGRESS_URL）を設定してください",
    );
  }
  // クエリ・末尾スラッシュを除去
  return raw.replace(/\/?(\?.*)?$/, "");
}

/**
 * @param {string} slot midday | evening
 */
function getProgressUrl_(slot) {
  return (
    getBaseUrl_() +
    "?view=dailyProgress&slot=" +
    encodeURIComponent(slot)
  );
}

/**
 * @param {string} slot
 * @param {string} slotLabel
 */
function buildMessage_(slot, slotLabel) {
  var url = getProgressUrl_(slot);
  return (
    "【" +
    slotLabel +
    "】今日の進捗を入力してください（約1分）\n" +
    url +
    "\n※ログインが必要な場合があります"
  );
}

function postChatWebhook_(text) {
  var webhook = PropertiesService.getScriptProperties().getProperty(
    "CHAT_WEBHOOK_URL",
  );
  if (!webhook) return false;

  var res = UrlFetchApp.fetch(webhook, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ text: text }),
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error("Chat webhook failed " + code + ": " + res.getContentText());
  }
  return true;
}

function sendEmails_(text, slotLabel) {
  var raw =
    PropertiesService.getScriptProperties().getProperty("NOTIFY_EMAILS") || "";
  var emails = raw
    .split(",")
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
  if (emails.length === 0) return false;

  MailApp.sendEmail({
    to: emails.join(","),
    subject: "【" + slotLabel + "】今日の進捗リマインド",
    body: text,
  });
  return true;
}

/**
 * @param {string} slot
 * @param {string} slotLabel
 */
function notifySlot_(slot, slotLabel) {
  var text = buildMessage_(slot, slotLabel);
  var chatOk = postChatWebhook_(text);
  var mailOk = sendEmails_(text, slotLabel);
  if (!chatOk && !mailOk) {
    throw new Error(
      "CHAT_WEBHOOK_URL または NOTIFY_EMAILS のいずれかを設定してください",
    );
  }
  Logger.log(
    slotLabel +
      " (" +
      slot +
      ") notified. chat=" +
      chatOk +
      " mail=" +
      mailOk +
      " url=" +
      getProgressUrl_(slot),
  );
}

/** 互換: 旧トリガー名。途中枠の URL を送る */
function notifyMorning() {
  notifySlot_("midday", "途中経過");
}

function notifyMidday() {
  notifySlot_("midday", "途中経過");
}

function notifyEvening() {
  notifySlot_("evening", "夕");
}
